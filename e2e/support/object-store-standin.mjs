#!/usr/bin/env node
/**
 * An in-memory object store for the e2e run — 2S8-QA-01.
 *
 * Every upload in the app is presign (API) → PUT straight from the browser
 * to the bucket → the API asks the bucket whether it landed (a HEAD, for
 * IDs and onboarding documents — storage.ts privateObjectSize). CI's e2e
 * job has no MinIO, so a page.route stub of the PUT is not enough there: the
 * HEAD that follows would find nothing. This answers the few path-style S3
 * calls those steps make, the way a bucket with a CORS policy does:
 *
 *   PUT    /<bucket>/<key>    keep the bytes and the Content-Type
 *   HEAD   /<bucket>/<key>    200 with Content-Length / Content-Type / ETag, or 404
 *   GET    /<bucket>/<key>    the bytes
 *   DELETE /<bucket>/<key>    204
 *   HEAD   /<bucket>          200
 *   OPTIONS                   the CORS preflight
 *   GET    /minio/health/live 200 — what support/object-store.ts probes
 *
 * Signatures are not checked and nothing is written to disk: it lives for
 * one run. Started by playwright.config.ts when E2E_OBJECT_STORE_STANDIN is
 * set, on S3_ENDPOINT's port; the API presigns against the same endpoint.
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";

const endpoint = new URL(process.env.S3_ENDPOINT ?? "http://127.0.0.1:9100");
const port = Number(endpoint.port || 80);
const objects = new Map();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, HEAD, DELETE, POST",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "ETag",
};

function parse(url) {
  const path = decodeURIComponent(new URL(url ?? "/", "http://x").pathname).replace(/^\/+/, "");
  const [bucket = "", ...rest] = path.split("/");
  return { bucket, key: rest.join("/") };
}

function missing(res, head) {
  res.writeHead(404, { ...CORS, "Content-Type": "application/xml" });
  res.end(head ? undefined : '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code></Error>');
}

createServer((req, res) => {
  if (req.method === "OPTIONS" || req.url?.startsWith("/minio/health")) {
    res.writeHead(200, CORS);
    return res.end();
  }
  const { bucket, key } = parse(req.url);
  if (!bucket) return missing(res, req.method === "HEAD");
  if (!key) {
    res.writeHead(200, CORS);
    return res.end();
  }
  const id = `${bucket}/${key}`;
  if (req.method === "PUT") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const etag = `"${createHash("md5").update(body).digest("hex")}"`;
      objects.set(id, { body, type: req.headers["content-type"] ?? "application/octet-stream", etag, at: new Date() });
      res.writeHead(200, { ...CORS, ETag: etag });
      res.end();
    });
    return;
  }
  if (req.method === "DELETE") {
    objects.delete(id);
    res.writeHead(204, CORS);
    return res.end();
  }
  if (req.method === "HEAD" || req.method === "GET") {
    const o = objects.get(id);
    if (!o) return missing(res, req.method === "HEAD");
    res.writeHead(200, {
      ...CORS,
      "Content-Type": o.type,
      "Content-Length": o.body.length,
      ETag: o.etag,
      "Last-Modified": o.at.toUTCString(),
    });
    return res.end(req.method === "GET" ? o.body : undefined);
  }
  res.writeHead(405, CORS);
  res.end();
}).listen(port, endpoint.hostname, () => console.log(`object store stand-in on ${endpoint.origin}`));

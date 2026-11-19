#!/usr/bin/env node
/**
 * An in-memory object store for the e2e run — 2S8-QA-01.
 *
 * Every upload in the app is presign (API) → PUT straight from the browser
 * to the bucket → the API asks the bucket whether it landed (a HEAD, for
 * IDs and onboarding documents — storage.ts checkPrivateUpload). CI's e2e
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
 * Nothing is written to disk: it lives for one run. Started by
 * playwright.config.ts when E2E_OBJECT_STORE_STANDIN is set, on S3_ENDPOINT's
 * port; the API presigns against the same endpoint.
 *
 * STRICT, AS R2 IS — POL-BE-112 (CI sets E2E_STORE_STRICT=1). MinIO's server
 * image is no longer published, so CI's browser uploads land here, and here
 * they are held to what the real bucket enforces:
 *   - the upload rule (CORS): only E2E_STORE_ALLOW_ORIGIN's preflight is
 *     allowed, and only its responses carry an allow-origin — another site's
 *     browser upload fails, as it did on staging on 2026-11-16;
 *   - signed links: a PUT or GET carrying X-Amz-Signature must be signed
 *     with the API's keys for exactly that key, type and length, and not
 *     expired — a broken signature fails, as it would on R2.
 * Requests the API makes itself (signed in a header, not a link) are taken
 * as they come. Without E2E_STORE_STRICT (a laptop) it answers as before:
 * any origin, no signature check.
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";

const endpoint = new URL(process.env.S3_ENDPOINT ?? "http://127.0.0.1:9100");
const port = Number(process.env.E2E_STORE_PORT ?? (endpoint.port || 80));
const objects = new Map();
const STRICT = process.env.E2E_STORE_STRICT === "1";
const ALLOW = new Set((process.env.E2E_STORE_ALLOW_ORIGIN ?? "").split(",").map((o) => o.trim()).filter(Boolean));

const LAX_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, HEAD, DELETE, POST",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "ETag",
};
/** The CORS headers for this request: anyone (lax), or only an allowed origin (strict). */
function corsFor(req) {
  if (!STRICT) return LAX_CORS;
  const origin = req.headers.origin;
  if (!origin || !ALLOW.has(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, PUT, HEAD", "Access-Control-Allow-Headers": "content-type", "Access-Control-Expose-Headers": "ETag", Vary: "Origin" };
}

/* The API's own keys, to check a signed link the way R2 does: sign the same request again and compare. */
let signer = null;
async function signerFor() {
  if (signer) return signer;
  const { S3Client, PutObjectCommand, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = new S3Client({
    endpoint: endpoint.origin, region: process.env.S3_REGION ?? "us-east-1", forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "sponsorx", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "sponsorx-dev-secret" },
  });
  signer = { client, PutObjectCommand, GetObjectCommand, getSignedUrl };
  return signer;
}
function amzDate(v) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v ?? "");
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}
/** Whether a signed link (PUT or GET) is signed for exactly this request, and not expired. */
async function linkValid(req, bucket, key, length) {
  const q = new URL(req.url ?? "/", "http://x").searchParams;
  const sig = q.get("X-Amz-Signature");
  const date = amzDate(q.get("X-Amz-Date"));
  const expires = Number(q.get("X-Amz-Expires"));
  if (!sig || !date || !expires || Date.now() > date.getTime() + expires * 1000) return false;
  const { client, PutObjectCommand, GetObjectCommand, getSignedUrl } = await signerFor();
  const signed = new Set((q.get("X-Amz-SignedHeaders") ?? "").split(";"));
  const type = req.headers["content-type"];
  const disposition = q.get("response-content-disposition");
  const command = req.method === "PUT"
    ? new PutObjectCommand({
        Bucket: bucket, Key: key,
        ...(signed.has("content-type") && type ? { ContentType: type } : {}),
        ...(signed.has("content-length") ? { ContentLength: length } : {}),
      })
    : new GetObjectCommand({ Bucket: bucket, Key: key, ...(disposition ? { ResponseContentDisposition: disposition } : {}) });
  const again = await getSignedUrl(client, command, {
    expiresIn: expires, signingDate: date,
    ...(req.method === "PUT" && signed.has("content-type") ? { signableHeaders: new Set(["content-type"]) } : {}),
  });
  return new URL(again).searchParams.get("X-Amz-Signature") === sig;
}
const isLink = (req) => new URL(req.url ?? "/", "http://x").searchParams.has("X-Amz-Signature");
function refuse(res, cors, code) {
  res.writeHead(403, { ...cors, "Content-Type": "application/xml" });
  res.end(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code></Error>`);
}

function parse(url) {
  const path = decodeURIComponent(new URL(url ?? "/", "http://x").pathname).replace(/^\/+/, "");
  const [bucket = "", ...rest] = path.split("/");
  return { bucket, key: rest.join("/") };
}

function missing(res, head, cors) {
  res.writeHead(404, { ...cors, "Content-Type": "application/xml" });
  res.end(head ? undefined : '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code></Error>');
}

createServer((req, res) => {
  const CORS = corsFor(req);
  if (req.url?.startsWith("/minio/health")) {
    res.writeHead(200, LAX_CORS);
    return res.end();
  }
  if (req.method === "OPTIONS") {
    /* Strict: a preflight from a site the upload rule doesn't name is refused. */
    res.writeHead(!STRICT || CORS["Access-Control-Allow-Origin"] ? 204 : 403, CORS);
    return res.end();
  }
  const { bucket, key } = parse(req.url);
  if (!bucket) return missing(res, req.method === "HEAD", CORS);
  if (!key) {
    res.writeHead(200, CORS);
    return res.end();
  }
  const id = `${bucket}/${key}`;
  if (req.method === "PUT") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const body = Buffer.concat(chunks);
      if (STRICT && isLink(req) && !(await linkValid(req, bucket, key, body.length).catch(() => false))) return refuse(res, CORS, "SignatureDoesNotMatch");
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
    const answer = () => {
      const o = objects.get(id);
      if (!o) return missing(res, req.method === "HEAD", CORS);
      const disposition = new URL(req.url ?? "/", "http://x").searchParams.get("response-content-disposition");
      res.writeHead(200, {
        ...CORS,
        "Content-Type": o.type,
        "Content-Length": o.body.length,
        ETag: o.etag,
        "Last-Modified": o.at.toUTCString(),
        ...(disposition ? { "Content-Disposition": disposition } : {}),
      });
      return res.end(req.method === "GET" ? o.body : undefined);
    };
    if (STRICT && req.method === "GET" && isLink(req)) {
      void linkValid(req, bucket, key, 0).catch(() => false).then((ok) => (ok ? answer() : refuse(res, CORS, "SignatureDoesNotMatch")));
      return;
    }
    return answer();
  }
  res.writeHead(405, CORS);
  res.end();
}).listen(port, endpoint.hostname, () => console.log(`object store stand-in on ${endpoint.origin}`));

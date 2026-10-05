/**
 * An in-process S3 bucket for tests that need the real upload path — 2S8-SEC-03.
 *
 * Unlike e2e/support/object-store-standin.mjs, this one CHECKS PRESIGNED
 * SIGNATURES the way R2 does: a PUT whose Content-Type or Content-Length
 * differs from what the URL was signed for is refused 403
 * (SignatureDoesNotMatch). It recomputes the signature with the API's own S3
 * client, over the headers the URL says it signed (X-Amz-SignedHeaders), so
 * an unpinned URL accepts any type and a pinned one only its own.
 *
 *   PUT    /<bucket>/<key>?X-Amz-…   verified, then kept with its Content-Type
 *   HEAD   /<bucket>/<key>           Content-Length / Content-Type, or 404
 *   DELETE /<bucket>/<key>           204
 *
 * Header-signed calls from the server itself (HEAD, DELETE) are not checked:
 * the API holds the bucket's credentials, and what is under test is the
 * credential it hands a browser. `objects` is exposed so a test can place a
 * file the way a bucket that did NOT enforce the signature would have.
 */
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StoredObject = { body: Buffer; type: string };

export type ObjectStore = {
  endpoint: string;
  objects: Map<string, StoredObject>;
  /** Hand the store the API's S3 client once it is importable (it reads S3_ENDPOINT at import). */
  verifyWith: (client: S3Client) => void;
  close: () => Promise<void>;
};

function amzDate(s: string): Date {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) throw new Error(`bad X-Amz-Date ${s}`);
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!));
}

async function presignedPutValid(client: S3Client, req: IncomingMessage, bucket: string, key: string, length: number): Promise<boolean> {
  const q = new URL(req.url ?? "/", "http://x").searchParams;
  const sig = q.get("X-Amz-Signature");
  const date = q.get("X-Amz-Date");
  const expires = Number(q.get("X-Amz-Expires"));
  if (!sig || !date || !expires) return false;
  if (Date.now() > amzDate(date).getTime() + expires * 1000) return false;
  const signed = new Set((q.get("X-Amz-SignedHeaders") ?? "").split(";"));
  const type = req.headers["content-type"];
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket, Key: key,
      ...(signed.has("content-type") && type ? { ContentType: type } : {}),
      ...(signed.has("content-length") ? { ContentLength: length } : {}),
    }),
    { expiresIn: expires, signingDate: amzDate(date), ...(signed.has("content-type") ? { signableHeaders: new Set(["content-type"]) } : {}) },
  );
  return new URL(url).searchParams.get("X-Amz-Signature") === sig;
}

export async function startObjectStore(): Promise<ObjectStore> {
  const objects = new Map<string, StoredObject>();
  let client: S3Client | null = null;

  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname).replace(/^\/+/, "");
    const [bucket = "", ...rest] = path.split("/");
    const key = rest.join("/");
    const id = `${bucket}/${key}`;
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        const presigned = new URL(req.url ?? "/", "http://x").searchParams.has("X-Amz-Signature");
        const check = presigned && client ? presignedPutValid(client, req, bucket, key, body.length) : Promise.resolve(true);
        check.then((ok) => {
          if (!ok) {
            res.writeHead(403, { "Content-Type": "application/xml" });
            res.end('<?xml version="1.0" encoding="UTF-8"?><Error><Code>SignatureDoesNotMatch</Code></Error>');
            return;
          }
          objects.set(id, { body, type: req.headers["content-type"] ?? "application/octet-stream" });
          res.writeHead(200, { ETag: '"x"' });
          res.end();
        }, (error: unknown) => {
          res.writeHead(500);
          res.end(String(error));
        });
      });
      return;
    }
    if (req.method === "DELETE") {
      objects.delete(id);
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === "HEAD" || req.method === "GET") {
      const o = objects.get(id);
      if (!o) {
        res.writeHead(404, { "Content-Type": "application/xml" });
        res.end(req.method === "HEAD" ? undefined : '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code></Error>');
        return;
      }
      res.writeHead(200, { "Content-Type": o.type, "Content-Length": o.body.length, ETag: '"x"', "Last-Modified": new Date().toUTCString() });
      res.end(req.method === "GET" ? o.body : undefined);
      return;
    }
    res.writeHead(405);
    res.end();
  });

  server.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  return {
    endpoint: `http://127.0.0.1:${port}`,
    objects,
    verifyWith: (c) => {
      client = c;
    },
    close: () => new Promise((r) => server.close(() => r())),
  };
}

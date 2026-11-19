/**
 * The socket service's entry point — one process, one socket server, on
 * Railway's `socketservice` service (one replica). Settings:
 * documentation/SponsorX-Switches.md.
 */
import { createSocketService } from "./server.ts";
import { publicKeyFrom } from "./pass.ts";

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`[socketservice] ${name} is not set; refusing to start.`);
    process.exit(1);
  }
  return v;
}

const port = Number(process.env.PORT ?? 4100);
const service = createSocketService({
  passKey: publicKeyFrom(required("SOCKETSERVICE_PASS_PUBLIC_KEY")),
  publishSecret: required("SOCKETSERVICE_PUBLISH_SECRET"),
  allowedOrigins: required("SOCKETSERVICE_ALLOWED_ORIGINS").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean),
  sessionMs: Math.max(1, Number(process.env.SOCKETSERVICE_SESSION_MINUTES ?? 15)) * 60_000,
});

if (required("SOCKETSERVICE_PUBLISH_SECRET").length < 32) {
  console.error("[socketservice] SOCKETSERVICE_PUBLISH_SECRET must be at least 32 characters.");
  process.exit(1);
}

await service.listen(port);
console.log(`SponsorX socket service listening on :${port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void service.close().finally(() => process.exit(0));
  });
}

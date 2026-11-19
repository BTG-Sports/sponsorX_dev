/**
 * Backend entry point — the HTTP API service.
 *
 * This is one of two long-running Node processes in the backend:
 *   1. this API (Express), and
 *   2. the pg-boss worker (worker/index.mts), started separately.
 * They share the database and the outbox but never the process, exactly as in
 * production (Railway runs them as two services).
 */
import { createApp } from "./app";
import { env } from "./config/env";
import { startDealChatSocket } from "./realtime/deal-chat-socket";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`SponsorX API listening on :${env.PORT} (${env.NODE_ENV})`);
});

/* Deal Chat's live updates (behind DEAL_CHAT_SOCKET): a socket on the same server and port as the routes. */
const dealChatSocket = startDealChatSocket(server);
if (dealChatSocket) console.log("Deal Chat socket on /api/v1/socket");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    /* The sockets first: an open one would keep server.close() waiting. */
    void (dealChatSocket?.close() ?? Promise.resolve()).finally(() => server.close(() => process.exit(0)));
  });
}

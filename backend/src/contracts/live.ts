/** 2S4-BE-18 — a pass to the live socket service (documentation/SponsorX-Socket-Service.md). */
import { z } from "./zod";

export const LivePassInput = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("chat"), chatId: z.string().min(1).max(64) }).strict(),
    z.object({ kind: z.literal("inbox") }).strict(),
  ])
  .meta({ id: "LivePassInput", description: "Which channel: one chat that is open or visible on screen, or the person's Messages list (inbox)." });

export const LivePass = z
  .object({
    url: z.string().meta({ description: "The socket service's address (socketservice.sponsorx.net)." }),
    path: z.string().meta({ description: "The WebSocket path: /ws." }),
    channel: z.string().meta({ description: "The one channel the pass opens, e.g. chat:<id>:seller or inbox:sponsor:<id>." }),
    pass: z.string().meta({ description: "Send as handshake auth { pass } to connect, or emit join { pass } on an open connection. Good for 60 seconds, once." }),
    expiresAt: z.string(),
  })
  .meta({ id: "LivePass" });

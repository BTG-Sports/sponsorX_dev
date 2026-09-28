import { z } from "./zod";

import { CHANNELS, MUTABLE_EVENTS } from "../domain/notification-preferences";

/* 2S6-BE-02 — mute (or unmute) one channel for one event type. */
export const NotificationPreferenceInput = z
  .object({ event: z.enum(MUTABLE_EVENTS), channel: z.enum(CHANNELS), muted: z.boolean() })
  .meta({ id: "NotificationPreferenceInput", description: "Decision notices (application outcomes, guardian and onboarding decisions) cannot be muted." });

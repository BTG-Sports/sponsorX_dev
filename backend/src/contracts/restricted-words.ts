import { z } from "zod";

import { RESTRICTED_KINDS } from "../domain/restricted-words-rules";

/* 2S1-BE-18 — BTG's restricted-words list. */

export const RestrictedWordInput = z
  .object({ word: z.string().trim().min(1).max(80), kind: z.enum(RESTRICTED_KINDS) })
  .strict()
  .meta({ id: "RestrictedWordInput", description: "A word or phrase to add to the restricted list, and its kind. Adding a removed word brings it back." });

export const RestrictedTextInput = z
  .object({ text: z.string().max(4000) })
  .strict()
  .meta({ id: "RestrictedTextInput", description: "Text to test against the list — what would match, and why." });

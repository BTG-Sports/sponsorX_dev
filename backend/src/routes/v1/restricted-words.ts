/**
 * /api/v1 — BTG's restricted-words list (2S1-BE-18). Rules live in
 * domain/restricted-words.ts; this file only parses and hands over.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { RestrictedTextInput, RestrictedWordInput } from "../../contracts/restricted-words";
import {
  addRestrictedWord, listRestrictedWords, removeRestrictedWord, restrictedWordHistory, testRestrictedText,
} from "../../domain/restricted-words";

export const restrictedWordsRouter = Router();
type Id = { id: string };

restrictedWordsRouter.get("/restricted-words", requireActor, (async (req, res) => {
  res.json(await listRestrictedWords(req.actor!));
}) as RequestHandler);
restrictedWordsRouter.get("/restricted-words/history", requireActor, (async (req, res) => {
  res.json({ history: await restrictedWordHistory(req.actor!) });
}) as RequestHandler);
restrictedWordsRouter.post("/restricted-words", requireActor, (async (req, res) => {
  res.status(201).json(await addRestrictedWord(req.actor!, RestrictedWordInput.parse(req.body)));
}) as RequestHandler);
restrictedWordsRouter.post("/restricted-words/test", requireActor, (async (req, res) => {
  res.json(await testRestrictedText(req.actor!, RestrictedTextInput.parse(req.body).text));
}) as RequestHandler);
restrictedWordsRouter.delete("/restricted-words/:id", requireActor, (async (req, res) => {
  res.json(await removeRestrictedWord(req.actor!, req.params.id));
}) as RequestHandler<Id>);

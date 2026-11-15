import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CONTENT_READY_NOTE_MS, contentReadyNote } from "../src/lib/editions-live";

/* --------------------------------------------------------------------------
   POL-FE-50 — the Content ready confirmation. Found in walkthrough practice
   (2026-11-15): after Mark content ready then Mark not ready, the box showed
   "not yet marked ready" with a GREEN "Content marked not ready." hanging
   under the link, which read as a contradiction. Now marking ready is green
   with a tick, the undo is muted and says it is an undo, and the note clears
   itself after a few seconds. Error notes stay.
   -------------------------------------------------------------------------- */

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const controls = src("../src/components/edition-controls.tsx");
const actions = src("../src/app/(app)/admin/next/actions.ts");

describe("POL-FE-50 · the Content ready note", () => {
  it("is toned by meaning: ready is green with a tick, the undo is muted", () => {
    expect(contentReadyNote(true)).toEqual({ message: "Content marked ready ✓", tone: "success" });
    expect(contentReadyNote(false)).toEqual({ message: "Undone: content is back to not ready.", tone: "muted" });
  });

  it("the server action uses the same wording, and the old line is gone", () => {
    expect(actions).toContain("contentReadyNote(contentReady).message");
    expect(actions).not.toContain("Content marked not ready.");
  });

  it("the toggle clears its note after about four seconds", () => {
    expect(CONTENT_READY_NOTE_MS).toBe(4000);
    const toggle = controls.slice(controls.indexOf("export function ContentReadyToggle"), controls.indexOf("const field ="));
    expect(toggle).toContain("useAction({ clearOkAfterMs: CONTENT_READY_NOTE_MS })");
    expect(toggle).toContain("contentReadyNote(next)");
  });

  it("only success notes are cleared by the timer, and only where asked", () => {
    const hook = controls.slice(controls.indexOf("function useAction"), controls.indexOf("export function EditionAdvance"));
    expect(hook).toContain("if (!note?.ok || !clearOkAfterMs) return;");
    /* Every other caller keeps the old behaviour: no timer. */
    const others = controls.match(/= useAction\([^)]*\)/g) ?? [];
    expect(others.length).toBeGreaterThan(5);
    expect(others.filter((c) => c.includes("clearOkAfterMs"))).toEqual(["= useAction({ clearOkAfterMs: CONTENT_READY_NOTE_MS })"]);
  });

  it("a muted note is not green, and an error is always red", () => {
    const line = controls.slice(controls.indexOf("function NoteLine"), controls.indexOf("function useAction"));
    expect(line).toContain('!note.ok ? "text-danger" : note.tone === "muted" ? "text-muted" : "text-success"');
  });
});

import { describe, expect, it } from "vitest";

import { printInLight } from "@/lib/print-light";

/* P1-FE-26 — a forwarded schools proposal prints in the light theme, and
   the visitor's own theme comes back afterwards. */

const rootWith = (theme?: string) => ({ dataset: (theme ? { theme } : {}) as Record<string, string | undefined> });
const fire = (t: EventTarget, type: string) => t.dispatchEvent(new Event(type));

describe("printInLight", () => {
  it("a dark visitor (no attribute) prints light, then is dark again", () => {
    const root = rootWith();
    const win = new EventTarget();
    printInLight(root, win);
    fire(win, "beforeprint");
    expect(root.dataset.theme).toBe("light");
    fire(win, "afterprint");
    expect("theme" in root.dataset).toBe(false);
  });

  it("a light visitor stays light throughout", () => {
    const root = rootWith("light");
    const win = new EventTarget();
    printInLight(root, win);
    fire(win, "beforeprint");
    fire(win, "afterprint");
    expect(root.dataset.theme).toBe("light");
  });

  it("a repeated beforeprint does not overwrite the theme it will restore", () => {
    const root = rootWith();
    const win = new EventTarget();
    printInLight(root, win);
    fire(win, "beforeprint");
    fire(win, "beforeprint");
    fire(win, "afterprint");
    expect("theme" in root.dataset).toBe(false);
  });

  it("detaching mid-print restores the theme and stops listening", () => {
    const root = rootWith();
    const win = new EventTarget();
    const detach = printInLight(root, win);
    fire(win, "beforeprint");
    detach();
    expect("theme" in root.dataset).toBe(false);
    fire(win, "beforeprint");
    expect("theme" in root.dataset).toBe(false);
  });
});

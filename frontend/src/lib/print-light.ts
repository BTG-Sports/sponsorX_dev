/* --------------------------------------------------------------------------
   P1-FE-26 — the schools proposal prints in the light theme.

   It is forwarded to a principal and printed, and the public site is dark by
   (the only screen theme). Dark text is near-white, and a
   browser drops background colours when printing unless "background
   graphics" is ticked — so a dark page printed as pale text on white paper.

   For the length of one print, <html> wears data-theme="light" (globals.css
   keeps the light palette for this alone — the app has no on-screen light
   theme since 2026-10-14), so paper gets it with no second copy of its
   tokens to drift. The screen comes back as it was afterwards. Window events, so Ctrl+P is covered as well as the button.
   -------------------------------------------------------------------------- */

type Root = { dataset: Record<string, string | undefined> };
type Target = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/** Attach; returns the detach (which also restores, if a print is open). */
export function printInLight(root: Root, target: Target): () => void {
  let active = false;
  let previous: string | undefined;

  const before = () => {
    if (active) return;
    active = true;
    previous = root.dataset.theme;
    root.dataset.theme = "light";
  };
  const after = () => {
    if (!active) return;
    active = false;
    if (previous === undefined) delete root.dataset.theme;
    else root.dataset.theme = previous;
  };

  target.addEventListener("beforeprint", before);
  target.addEventListener("afterprint", after);
  return () => {
    target.removeEventListener("beforeprint", before);
    target.removeEventListener("afterprint", after);
    after();
  };
}

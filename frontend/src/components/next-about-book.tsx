"use client";

/* --------------------------------------------------------------------------
   The interactive magazine on /next/about (design spec
   docs/superpowers/specs/2026-09-30-next-about-flipbook-design.md).

   MagBook takes the eight server-rendered faces — cover, pages 02–07, back
   cover — and shows them as four leaves the reader turns. One piece of
   state, the current face `f`; everything else derives from it:
   - from lg ("spread" mode) `k = spreadOf(f)` leaves are turned; the left
     page is the back of leaf k-1, the right page the front of leaf k. The
     CSS (`.sx-book*`, globals.css) does the 3D turn off `data-turned` and
     the 25% shift that centres a closed or finished book off `data-k`.
   - below lg ("page" mode) one face shows at a time (`data-show`), the
     outgoing one hinges away (`data-leaving`) for the animation's length.
   Inputs: click a page (right → next, left → prev), the ◂ ▸ buttons, ← →
   while the book is on screen, a ≥ 40px horizontal swipe, the chips, and
   the hashes #magazine / #how / #students (on load, hashchange, and clicks
   of in-page links) which also scroll the book into view.
   Faces that are not visible are `inert` + aria-hidden so the tab order
   reaches only what can be seen. Without JS the <noscript> style in the
   stage lays the faces out flat; the controls never show.
   -------------------------------------------------------------------------- */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { CHIPS, FACE_COUNT, HASH_FACE, LEAF_COUNT, faceLabel, nextFace, prevFace, spreadOf, type BookMode } from "@/lib/next-about";

const PAGE_ANIM_MS = 400;

function LeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-4">
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}
function RightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-4">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function MagBook({ faces }: { faces: ReactNode[] }) {
  const section = useRef<HTMLElement>(null);
  const book = useRef<HTMLDivElement>(null);
  const [f, setF] = useState(0);
  const [mode, setMode] = useState<BookMode>("spread");
  const [leaving, setLeaving] = useState<{ face: number; dir: 1 | -1 } | null>(null);
  const [turning, setTurning] = useState<number | null>(null);
  const inView = useRef(false);
  /* `go` writes fRef before setF, so a burst of calls reads the newest face;
     the effect keeps it in step with `f` (refs are not written in render). */
  const fRef = useRef(0);
  useEffect(() => {
    fRef.current = f;
  }, [f]);
  const k = spreadOf(f);

  /* mode follows the lg breakpoint */
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 64rem)");
    const apply = () => setMode(mq.matches ? "spread" : "page");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const go = useCallback(
    (target: number, opts: { scroll?: boolean } = {}) => {
      const next = Math.max(0, Math.min(FACE_COUNT - 1, target));
      const cur = fRef.current;
      if (opts.scroll) section.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (next === cur) return;
      if (mode === "page") {
        setLeaving({ face: cur, dir: next > cur ? 1 : -1 });
        window.setTimeout(() => setLeaving(null), PAGE_ANIM_MS);
      } else {
        const kc = spreadOf(cur);
        const kn = spreadOf(next);
        setTurning(kn > kc ? kc : kn);
        window.setTimeout(() => setTurning(null), 700);
      }
      fRef.current = next;
      setF(next);
    },
    [mode],
  );

  /* hashes: on load, on change, and on clicks of in-page links */
  useEffect(() => {
    const fromHash = (hash: string, scroll: boolean) => {
      const target = HASH_FACE[hash];
      if (target != null) go(target, { scroll });
    };
    fromHash(window.location.hash, false);
    const onHash = () => fromHash(window.location.hash, true);
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href^='#']") as HTMLAnchorElement | null;
      if (!a) return;
      const hash = a.getAttribute("href") ?? "";
      if (HASH_FACE[hash] == null) return;
      e.preventDefault();
      history.replaceState(null, "", hash);
      fromHash(hash, true);
    };
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
    };
  }, [go]);

  /* arrow keys while the book is on screen */
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => (inView.current = entry.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    const onKey = (e: KeyboardEvent) => {
      if (!inView.current) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight") go(nextFace(f, mode));
      if (e.key === "ArrowLeft") go(prevFace(f, mode));
    };
    document.addEventListener("keydown", onKey);
    return () => {
      io.disconnect();
      document.removeEventListener("keydown", onKey);
    };
  }, [f, mode, go]);

  /* swipe */
  useEffect(() => {
    const el = book.current;
    if (!el) return;
    let x0: number | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      x0 = e.clientX;
    };
    const up = (e: PointerEvent) => {
      if (x0 == null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) < 40) return;
      go(dx < 0 ? nextFace(f, mode) : prevFace(f, mode));
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
    };
  }, [f, mode, go]);

  const onLeafClick = (leaf: number) => go(leaf >= k ? nextFace(f, mode) : prevFace(f, mode));

  /** Which faces can be seen right now. */
  const visible = (face: number) => {
    if (mode === "page") return face === f;
    const leaf = Math.floor(face / 2);
    const isBack = face % 2 === 1;
    return isBack ? leaf === k - 1 : leaf === k;
  };

  const pageVars =
    leaving == null
      ? undefined
      : ({
          "--sx-page-origin": leaving.dir > 0 ? "0 50%" : "100% 50%",
          "--sx-page-in-from": leaving.dir > 0 ? "70deg" : "-70deg",
          "--sx-page-out-to": leaving.dir > 0 ? "-70deg" : "70deg",
        } as CSSProperties);

  return (
    <section
      ref={section}
      id="magazine"
      role="region"
      aria-label="The magazine"
      data-reveal=""
      className="sx-book-wrap relative mx-auto w-full max-w-[1320px] scroll-mt-24 px-5 pt-16 sm:px-[6vw] lg:pt-24 2xl:px-0"
    >
      <span id="how" aria-hidden="true" className="absolute top-0 scroll-mt-24" />
      <span id="students" aria-hidden="true" className="absolute top-0 scroll-mt-24" />

      <div ref={book} className="sx-book" data-f={f} data-k={k} data-mode={mode} style={pageVars}>
        {Array.from({ length: LEAF_COUNT }, (_, leaf) => {
          const zIndex = leaf < k ? leaf : LEAF_COUNT - leaf;
          return (
            <div
              key={leaf}
              className="sx-leaf"
              data-i={leaf}
              data-turned={leaf < k ? "" : undefined}
              data-turning={turning === leaf ? "" : undefined}
              style={{ zIndex }}
              onClick={() => onLeafClick(leaf)}
            >
              {[2 * leaf, 2 * leaf + 1].map((face) => {
                const shown = visible(face);
                const isLeaving = leaving?.face === face;
                return (
                  <div
                    key={face}
                    className={`sx-face ${face % 2 === 0 ? "sx-face-front" : "sx-face-back"} ${face === 0 || face === FACE_COUNT - 1 ? "sx-face-dark" : ""}`}
                    data-face={face}
                    data-show={shown ? "" : undefined}
                    data-leaving={isLeaving ? "" : undefined}
                    inert={!shown}
                    aria-hidden={!shown}
                    role={face === 0 && shown ? "button" : undefined}
                    aria-label={face === 0 && shown ? "Open the magazine" : undefined}
                  >
                    {faces[face]}
                  </div>
                );
              })}
              <span aria-hidden="true" className="sx-leaf-shade" />
            </div>
          );
        })}
        <span aria-hidden="true" className="sx-book-shadow" />
      </div>

      <div className="sx-book-ctrl mt-6 flex flex-col items-center gap-4">
        <div className="flex items-center gap-4">
          <button type="button" className="sx-book-btn" aria-label="Previous page" disabled={f === 0} onClick={() => go(prevFace(f, mode))}>
            <LeftIcon />
          </button>
          <span aria-live="polite" className="min-w-[88px] text-center font-mag text-[20px] tracking-[0.08em] text-[#ffd12b]">
            {faceLabel(f, mode)}
          </span>
          <button type="button" className="sx-book-btn" aria-label="Next page" disabled={f === FACE_COUNT - 1} onClick={() => go(nextFace(f, mode))}>
            <RightIcon />
          </button>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {CHIPS.map((c) => {
            const last = FACE_COUNT - 1;
            const current = c.face === 0 ? f === 0 : c.face === last ? f === last : f !== 0 && f !== last && spreadOf(c.face) === k;
            return (
              <button key={c.face} type="button" className="sx-book-chip text-on-media" aria-current={current ? "true" : undefined} onClick={() => go(c.face)}>
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

"use client";

import { useLayoutEffect } from "react";

/* --------------------------------------------------------------------------
   POL-FE-82 — the public athlete page's motion, as one small island that
   renders nothing. The page is server-rendered and complete without it;
   this only adds:

   - scroll reveals: `[data-reveal]` pieces rise in once as they enter
     (the root is "armed" first, so without JS nothing is ever hidden);
   - tilt + glare: `[data-tilt]` cards lean toward the pointer;
   - parallax: the cover's light follows the pointer (`[data-pp-hero]`);
   - the section tabs: the underline slides to the section in view, and a
     tab click scrolls there smoothly.

   DOM state React never owns, so it is written straight to attributes and
   CSS variables (the count-up.tsx convention). Reduced motion: only the tab
   underline follows; nothing moves on its own.
   -------------------------------------------------------------------------- */

export function ProfileFx({ rootId }: { rootId: string }) {
  useLayoutEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: (() => void)[] = [];

    /* ── reveals ─────────────────────────────────────────────────────── */
    if (!reduce && "IntersectionObserver" in window) {
      root.dataset.ppArmed = "1";
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            (e.target as HTMLElement).dataset.in = "1";
            io.unobserve(e.target);
          }
        },
        { threshold: 0.18, rootMargin: "0px 0px -6% 0px" },
      );
      root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
    }

    /* ── tilt + glare ────────────────────────────────────────────────── */
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!reduce && fine) {
      root.querySelectorAll<HTMLElement>("[data-tilt]").forEach((card) => {
        let frame = 0;
        const move = (ev: PointerEvent) => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            const r = card.getBoundingClientRect();
            const x = (ev.clientX - r.left) / r.width;
            const y = (ev.clientY - r.top) / r.height;
            card.style.setProperty("--rx", `${((x - 0.5) * 9).toFixed(2)}deg`);
            card.style.setProperty("--ry", `${((0.5 - y) * 9).toFixed(2)}deg`);
            card.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
            card.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
            card.dataset.tilting = "1";
          });
        };
        const leave = () => {
          cancelAnimationFrame(frame);
          card.style.setProperty("--rx", "0deg");
          card.style.setProperty("--ry", "0deg");
          delete card.dataset.tilting;
        };
        card.addEventListener("pointermove", move);
        card.addEventListener("pointerleave", leave);
        cleanups.push(() => {
          cancelAnimationFrame(frame);
          card.removeEventListener("pointermove", move);
          card.removeEventListener("pointerleave", leave);
        });
      });

      /* ── cover parallax ────────────────────────────────────────────── */
      const hero = root.querySelector<HTMLElement>("[data-pp-hero]");
      if (hero) {
        let frame = 0;
        const move = (ev: PointerEvent) => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            const r = hero.getBoundingClientRect();
            hero.style.setProperty("--px", ((ev.clientX - r.left) / r.width - 0.5).toFixed(3));
            hero.style.setProperty("--py", ((ev.clientY - r.top) / r.height - 0.5).toFixed(3));
          });
        };
        hero.addEventListener("pointermove", move);
        cleanups.push(() => {
          cancelAnimationFrame(frame);
          hero.removeEventListener("pointermove", move);
        });
      }
    }

    /* ── section tabs ────────────────────────────────────────────────── */
    const nav = root.querySelector<HTMLElement>("[data-pp-tabs]");
    if (nav) {
      const links = [...nav.querySelectorAll<HTMLAnchorElement>("a[href^='#']")];
      const sections = links
        .map((a) => document.getElementById(a.hash.slice(1)))
        .filter((s): s is HTMLElement => !!s);
      const mark = (id: string) => {
        for (const a of links) {
          const on = a.hash === `#${id}`;
          if (on) {
            a.setAttribute("aria-current", "true");
            nav.style.setProperty("--ind-x", `${a.offsetLeft}px`);
            nav.style.setProperty("--ind-w", `${a.offsetWidth}px`);
          } else a.removeAttribute("aria-current");
        }
      };
      mark(sections[0]?.id ?? "");
      const spy = () => {
        /* The section whose top has passed the tab bar is the one being read. */
        const line = nav.getBoundingClientRect().bottom + 24;
        let current = sections[0]?.id ?? "";
        for (const s of sections) if (s.getBoundingClientRect().top <= line) current = s.id;
        mark(current);
      };
      let ticking = false;
      const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          spy();
        });
      };
      const click = (ev: MouseEvent) => {
        const a = (ev.target as HTMLElement).closest<HTMLAnchorElement>("a[href^='#']");
        const target = a && document.getElementById(a.hash.slice(1));
        if (!a || !target) return;
        ev.preventDefault();
        const top = target.getBoundingClientRect().top + window.scrollY - nav.getBoundingClientRect().height - 96;
        window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
        history.replaceState(null, "", a.hash);
        mark(target.id);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      nav.addEventListener("click", click);
      spy();
      cleanups.push(() => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        nav.removeEventListener("click", click);
      });
    }

    return () => {
      for (const c of cleanups) c();
      delete root.dataset.ppArmed;
    };
  }, [rootId]);

  return null;
}

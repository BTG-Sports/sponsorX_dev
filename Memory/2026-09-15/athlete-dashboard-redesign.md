# Athlete dashboard redesign (learning-curve pass)

**What:** Rebuilt `/athlete` per spec
`docs/superpowers/specs/2026-09-15-athlete-dashboard-redesign-design.md`.
Two focal points: slim money strip, then one actionable "Needs your
attention" queue (expiring invites → due deliverables → profile row) beside
a 3-card rail (earnings / profile / audience). New teaching element:
`src/components/journey-strip.tsx` — dismissible 4-step journey strip
(localStorage `sx-athlete-journey-dismissed`), the page's only new client
island. Dismissal reads through `useSyncExternalStore` (house lint forbids
setState-in-effect).

**Removed from the dashboard (rehoused, not lost):** per-state earnings →
`/athlete/earnings`; rate card → profile editor `?section=rates`;
agreements → `?section=agreements`; audience detail → `?section=socials`;
full checklist → editor; amber onboarding strip → queue profile row; §08
acceptance notice → order page (dashboard has no accept button anymore —
its invite action is "Review terms", a link).

**Kept:** all `?demo=` states, §4 minor gating (upload disabled + guardian
rail card), §22 provenance chips (hero figure + audience card), slim
clickable stat tiles (user chose to keep them).

**Why:** first-time athletes faced a wall — everything at equal weight.
User picked "both, staged" (money then actions) from three layout options.

**Plan:** `docs/superpowers/plans/2026-09-15-athlete-dashboard-redesign.md`.
Commits: journey strip island, useSyncExternalStore fix, page rewrite.

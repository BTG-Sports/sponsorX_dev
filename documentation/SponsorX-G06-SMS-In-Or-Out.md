# Decision G-06 — SMS In or Out for Phase 1

**Task `P0-PMO-04` · Version 0.1 · 2026-09-15 · Status: decided, for confirmation**

---

## The decision

**SMS is out of Phase 1.** No text messages are sent by SponsorX, and no Twilio
account is opened.

## Why

The case *for* SMS is real and worth stating: athletes are young, they do not
read email, and the campaign loop depends on them accepting invitations and
delivering on time. A text is the channel that actually reaches them.

It is still the wrong call for Phase 1, for three reasons.

**It is a compliance surface, not just a vendor.** Sending automated texts in the
US brings consent capture, opt-out handling on every message, quiet-hours rules,
and — because a meaningful share of this network are minors — parental consent
questions layered on top. Phase 1 already carries the fan-PII reward funnel as
its most legally sensitive flow. Adding a second regulated channel before the
first one has passed a privacy review is taking two risks to learn one lesson.

**The loop is small enough to work without it.** Phase 1 is roughly 25 athletes
with BTG staff in the loop on every campaign. When an athlete goes quiet, a
person notices and calls them. That does not scale, but neither does Phase 1 —
and the manual follow-up teaches you *which* messages actually needed to be
urgent, which is exactly what you want to know before automating them.

**Nothing is lost by waiting.** The notification layer is being built behind a
single send interface (G-04). Adding SMS later means writing one more adapter,
not revisiting the campaign loop.

## What this forbids, concretely

- **No `TWILIO_*` variable in any environment** — local, preview, staging or
  production.
- **No `twilio` package installed.** Its version is recorded in Guide §01 for
  when the decision changes, marked do-not-install. This is already enforced:
  `P2-BE-01` installed the pinned set and deliberately left it out.
- **No phone-number field collected for messaging purposes.** A phone number
  captured for contact is not consent to be texted, and a field collected now
  becomes a consent question later.

## What would change the decision

- Athlete non-response measurably costs campaigns — missed deliverable deadlines
  traceable to messages not being seen, not to athletes declining.
- The network passes the size where a person can chase each athlete individually.
- A sponsor-facing requirement appears that genuinely needs SMS, such as event
  check-in at a venue with no usable wifi.

If it returns, it returns with a consent model designed first, including the
guardian path for minors.

## Confirmation

| | |
|---|---|
| **SMS in Phase 1** | Out (recommended) / In |
| **Confirmed by** | |
| **Date** | |

*References: Addendum A1 (defers SMS); Guide §01; Blueprint §4 (minors).
Implements `P0-PMO-04`. Constrains `P3-INT-01` and every environment
configuration task.*

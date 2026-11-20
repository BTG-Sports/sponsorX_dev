import { Glyph } from "@/components/athlete-inventory/glyphs";
import { PropertyChangeDecision } from "@/components/property-change-decision";
import { Badge } from "@/components/ui";
import { changeRows, dayOf, kindWord, waitedLine, type ApiHeldPropertyChange } from "@/lib/property-profile-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Organisation changes waiting for BTG, on New sign-ups — POL-FE-104.

   A team, school or other organisation changes its own name, city, state and
   type details from its Profile page (POL-BE-104). Most take effect at once.
   One is held for a person when a safety check fails: another organisation
   has the name, a restricted word, an open order or an offer out, a changed
   legal name or registration number, a missing document for the new state,
   or an organisation not in good standing. Those wait here, oldest first,
   each with what was asked for, why it was held, and Approve / Reject.

   The owner's decision (2026-11-18): a PropertyProfileChange beside the
   athlete's sensitive edits, shown on the same admin page. The old
   /admin/profile-changes path redirects to this page.

   Drawn only when something waits: a desk with no work adds nothing to the
   page. A role the API refuses (403) is simply shown nothing; an outage says
   so in one line, because a held change is a team waiting on BTG.

   Reads  GET /property-profile-changes   held changes, oldest first (BTG staff)
   Writes property-change-actions.ts      approve / reject (BTG Admin)
   -------------------------------------------------------------------------- */

export async function PropertyChanges() {
  let res: Response;
  try {
    res = await apiFetch("/property-profile-changes");
  } catch (e) {
    if (e instanceof Error && /signed in/i.test(e.message)) throw e;
    return null;
  }
  if (res.status === 403) return null;

  let body: React.ReactNode;
  if (!res.ok) {
    body = <p className="sx-su-note">Organisation changes couldn’t be read just now ({res.status}). Refresh in a minute.</p>;
  } else {
    const { changes } = (await res.json()) as { changes: ApiHeldPropertyChange[] };
    if (!Array.isArray(changes) || changes.length === 0) return null;
    const now = new Date();
    body = (
      <ul className="sx-su-edits">
        {changes.map((c, i) => (
          <li key={c.id} data-waiting="" className="sx-su-edit sx-ap-rise" style={{ "--d": `${Math.min(i, 8) * 0.04}s` } as React.CSSProperties}>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm font-semibold text-white">{c.property.name}</strong>
              <Badge tone="neutral">{kindWord(c.property.kind)}</Badge>
              <Badge tone="warn">Waiting for you</Badge>
              <span className="text-[#8a96a3]">asked {dayOf(c.requestedAt)} · waited {waitedLine(c.requestedAt, now)}</span>
            </div>
            <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-3 gap-y-0.5">
              {changeRows(c, c.property.kind).map((r) => (
                <div key={r.key} className="contents">
                  <dt className="text-[#8a96a3]">{r.label}</dt>
                  <dd className="min-w-0 break-words">
                    <span className="text-[#8a96a3] line-through">{r.before}</span> <span aria-hidden>→</span><span className="sr-only"> changes to </span>{" "}
                    <span className="font-medium text-white">{r.after}</span>
                  </dd>
                </div>
              ))}
            </dl>
            {c.holdReasons.length > 0 && (
              <div>
                <p className="font-semibold text-[#fdba74]">Why it was held</p>
                <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-[#c7d0db]">
                  {c.holdReasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
            )}
            <PropertyChangeDecision changeId={c.id} organisation={c.property.name} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section id="organisation-changes" aria-label="Organisation changes waiting for you">
      <div className="sx-su-sec sx-ap-rise" style={{ "--d": "0.45s" } as React.CSSProperties}>
        <span className="sx-su-sec-icon" aria-hidden="true">
          <Glyph ui="edit" className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h2>Organisation changes waiting for you</h2>
          <p>
            A team, school or other organisation changes its own name, place and details, and most changes take effect at once. These were held by a
            safety check. Approve one and it takes effect; reject it with a reason the organisation reads. Until you answer, it keeps what is on file.
          </p>
        </div>
      </div>
      {body}
    </section>
  );
}

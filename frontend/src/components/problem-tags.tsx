import type { ReactNode } from "react";

import { Badge } from "@/components/ui";
import { problemTag, problemTarget, type ApiProblem } from "@/lib/support-inbox-live";

/* --------------------------------------------------------------------------
   POL-FE-41 / POL-FE-42 — a held record's problems as tags (POL-BE-42's
   `problems`): one tag per problem, coloured by its type, saying the
   stored reason word for word. The type's name leads, so a colour is never
   the only cue. Nothing for a record with no problems.

   - ProblemTags: the tags; `compact` (a list row) shows only the type, the
     reason on hover; `hrefOf` makes a tag a link (to its document).
   - WhatsWrongPanel: the panel at the top of a review page — every tag in
     full, each about a document jumping to it (problemTarget).
   -------------------------------------------------------------------------- */

export function ProblemTags({ problems, compact = false, hrefOf }: {
  problems: readonly ApiProblem[];
  compact?: boolean;
  hrefOf?: (p: ApiProblem) => string | null;
}) {
  if (!problems.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="What's wrong">
      {problems.map((p, i) => {
        const tag = problemTag(p.type);
        const href = hrefOf?.(p) ?? null;
        const body = (
          <Badge tone={tag.tone}>
            <span className="font-semibold">{tag.word}</span>
            {compact ? <span className="sr-only">: {p.label}</span> : <span className="ml-1 font-normal">· {p.label}</span>}
            {href && <span aria-hidden="true" className="ml-1">↓</span>}
          </Badge>
        );
        return (
          <li key={`${p.code}-${i}`} title={compact ? p.label : undefined}>
            {href ? <a href={href} className="rounded-full hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{body}</a> : body}
          </li>
        );
      })}
    </ul>
  );
}

export function WhatsWrongPanel({ problems, documents = [], children }: {
  problems: readonly ApiProblem[];
  /** The page's document rows, so a tag about one jumps to it. */
  documents?: readonly { id: string; name: string }[];
  /** A line under the tags (e.g. who already holds the name). */
  children?: ReactNode;
}) {
  if (!problems.length) return null;
  return (
    <section aria-label="What's wrong" className="rounded-xl border border-warn/40 bg-warn/5 p-4 sm:px-5">
      <h2 className="text-sm font-semibold">What&rsquo;s wrong{problems.length > 1 ? ` · ${problems.length}` : ""}</h2>
      <p className="mt-0.5 text-[11px] text-muted">Why it is waiting for BTG. A tag about a document jumps to it.</p>
      <div className="mt-2.5">
        <ProblemTags problems={problems} hrefOf={(p) => problemTarget(p, documents)} />
      </div>
      {children && <div className="mt-2 text-xs text-muted">{children}</div>}
    </section>
  );
}

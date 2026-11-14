import { Badge } from "@/components/ui";
import { problemTag, type ApiProblem } from "@/lib/support-inbox-live";

/* --------------------------------------------------------------------------
   POL-FE-41 / POL-FE-42 — a held record's problems as tags (POL-BE-42's
   `problems`): one tag per problem, coloured by its type, saying the
   stored reason word for word. The type's name leads, so a colour is never
   the only cue. Nothing for a record with no problems.
   -------------------------------------------------------------------------- */

export function ProblemTags({ problems, compact = false }: { problems: readonly ApiProblem[]; compact?: boolean }) {
  if (!problems.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="What's wrong">
      {problems.map((p, i) => {
        const tag = problemTag(p.type);
        return (
          <li key={`${p.code}-${i}`} title={compact ? p.label : undefined}>
            <Badge tone={tag.tone}>
              <span className="font-semibold">{tag.word}</span>
              {!compact && <span className="ml-1 font-normal">· {p.label}</span>}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { RestrictedWordsDesk } from "@/components/restricted-words-desk";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  groupWords, historyLines, type ApiRestrictedHistory, type ApiRestrictedWordList,
} from "@/lib/restricted-words-live";
import { apiFetch, fetchActor } from "@/server/api";
import { addRestrictedWordAction, removeRestrictedWordAction, testRestrictedTextAction } from "./actions";

/* --------------------------------------------------------------------------
   Restricted words — 2S1-FE-11, the word-list half (Claude Design
   RestrictedWords.dc.html: list, add, test). BTG admins keep the list of
   words and phrases that hold an item for BTG's review. A match never
   rejects anything. Today the check runs on a sponsor's "Other" business
   description (2S1-BE-17); profiles and listings follow.

   Reads  GET    /restricted-words            the words by kind, active and removed
          GET    /restricted-words/history    the change history
   Writes POST   /restricted-words            add / add back   (./actions.ts)
          DELETE /restricted-words/:id        remove
          POST   /restricted-words/test       the test box (changes nothing)
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/restricted-words";
const TITLE = "Restricted words";

export default async function RestrictedWordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <SkeletonRows rows={6} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;

  const [res, hist] = await Promise.all([apiFetch("/restricted-words"), apiFetch("/restricted-words/history")]);
  if (res.status === 403) {
    const who = await fetchActor();
    return <NotInRole path={PATH} title={TITLE} roles={who.status === "linked" ? who.actor.roles : []} />;
  }
  if (!res.ok) throw new Error(`Restricted words unavailable (${res.status}).`);
  const list = (await res.json()) as ApiRestrictedWordList;
  /* The history is a second read; if it fails the list still works. */
  const history = hist.ok ? ((await hist.json()) as ApiRestrictedHistory).history : null;

  if (demo === "empty" || list.kinds.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <EmptyState mark="inbox" title="No restricted words yet" hint="Words BTG adds here hold a sponsor's description for review instead of approving it by itself." />
      </div>
    );
  }

  const lines = history ? historyLines(history, list.words) : [];
  const historyCard = (
    <section aria-label="Change history" className="rounded-xl border border-line bg-surface px-4 py-4 sm:px-5">
      <h2 className="text-sm font-semibold">Change history</h2>
      {history === null ? (
        <p className="mt-2 text-xs text-muted">The change history couldn&rsquo;t be read just now ({hist.status}). The list above is current.</p>
      ) : lines.length === 0 ? (
        <p className="mt-2 text-xs text-muted">No changes yet.</p>
      ) : (
        <ol className="mt-2 text-xs">
          {lines.map((h, i) => (
            <li key={`${h.at}-${i}`} className="flex flex-col gap-0.5 border-t border-line-soft py-2 sm:flex-row sm:gap-3">
              <span className="shrink-0 text-muted sm:w-36">{h.when}</span>
              <span className="min-w-0 break-words">{h.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );

  return (
    <RestrictedWordsDesk
      groups={groupWords(list)}
      kinds={list.kinds}
      activeWords={list.words.filter((w) => w.active).map((w) => w.word)}
      history={historyCard}
      actions={{ add: addRestrictedWordAction, remove: removeRestrictedWordAction, test: testRestrictedTextAction }}
    />
  );
}

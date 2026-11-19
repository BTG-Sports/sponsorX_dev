import "../applications/(queue)/applications.css";
import "@/components/deal-chat/deal-chat.css";

/* Deal chats' loading screen (2S4-FE-09): the desk's own shape on the stage's
   dark ground — the title and its button, the line under it, the four number
   cards, the tab bar and the first messages waiting for a check. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading Deal chats">
      <div aria-hidden="true">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="sx-ops-ghost h-7 w-40 max-w-full rounded-md" />
          <div className="flex items-center gap-2">
            <div className="sx-ops-ghost hidden h-6 w-36 rounded-full sm:block" />
            <div className="sx-ops-ghost h-[34px] w-32 rounded-md" />
          </div>
        </div>
        <div className="sx-ops-ghost mt-3 h-3.5 w-[30rem] max-w-full rounded" />
        <div className="sx-ap-stats mt-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sx-ops-panel sx-ops-ghost relative h-[7.75rem]" />
          ))}
        </div>
        <div className="sx-ops-ghost mb-3 mt-6 h-10 w-64 max-w-full rounded-md" />
        <ul className="sx-dc sx-dc-reviews">
          {[0, 1, 2].map((i) => (
            <li key={i} className="sx-dc-review">
              <div className="sx-ops-ghost h-4 w-72 max-w-full rounded" />
              <div className="sx-ops-ghost h-14 w-full rounded-lg" />
              <div className="flex gap-2">
                <div className="sx-ops-ghost h-9 w-44 rounded-full" />
                <div className="sx-ops-ghost h-9 w-28 rounded-full" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

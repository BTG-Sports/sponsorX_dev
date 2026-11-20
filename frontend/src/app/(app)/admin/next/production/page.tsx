import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { ProductionDesk } from "@/components/production-desk";
import { BoardNote, ProductionHeader, ProductionStats } from "@/components/production-stage";
import { ServerList } from "@/components/server-pager";
import { demoState } from "@/lib/demo";
import {
  boardDates, boardParams, boardRowView, filterRows, pieceTurn, type ApiProductionBoard,
} from "@/lib/production-live";
import { liveEditions, readJson } from "@/server/next-editions";

import "../../applications/(queue)/applications.css";
import "../../new-signups/(stream)/signups.css";
import "./production.css";

/* --------------------------------------------------------------------------
   The production board — P9-FE-16 (spec §8), on GET /editions/:id/production
   (P9-BE-28). One edition's pieces — students' work not yet approved, the
   edition's content, each sold ad slot's artwork, the cover and the press
   PDF — and what each still needs before the edition publishes. The API asks
   the publishing gate's own questions, so when the board says a piece is
   ready, the gate agrees.

   Drawn like the other redrawn admin desks (desk-kit; New sign-ups,
   POL-FE-109), on the Mission Control stage:
     1. the title, a live pill, "How it works" and a link to the edition, then
        one line naming the edition and its dates;
     2. four cards, numbers only: Needs you, Waiting on others, Ready, and the
        four gates as the API answers them;
     3. the list: three tabs (Still needs something / Ready / All pieces),
        List ↔ Cards, search, the edition and the kind of piece as dropdowns;
        per piece what it is, whose move it is, each thing it still needs in
        the API's words, and one button to where it is fixed.

   URL: `edition`, `show` (waiting by default), `source`, `q`. An edition
   holds a few dozen pieces, so the board is read whole and filtered here;
   every number on the cards is counted from the whole board, never from the
   filtered list.

   BTG admins only (edition write — lib/admin-access.ts). An advisor's view of
   their school's pieces is the Content review (/advisor/review).
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/next/production";
const TITLE = "Production board";
const BOARD_ROLES = ["SUPER_ADMIN", "BTG_ADMIN"];

export default async function ProductionBoardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const demo = await demoState(searchParams);
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;

  const filter = boardParams(sp);

  if (demo === "loading") {
    return (
      <>
        <ProductionHeader readAt={null} line={null} editionHref={null} />
        <div aria-hidden="true" className="sx-ap-stats mt-6">
          {[0, 1, 2, 3].map((i) => <div key={i} className="sx-ops-panel sx-ops-ghost relative h-[7.75rem]" />)}
        </div>
        <ServerList>
          <ProductionDesk rows={[]} total={0} filter={filter} editions={[]} editionId="" mine={0} forceLoading />
        </ServerList>
      </>
    );
  }

  const live = demo === "empty" ? null : await liveEditions(typeof sp.edition === "string" ? sp.edition : undefined, BOARD_ROLES);
  if (!live || live.refused || !live.current) {
    return (
      <>
        <ProductionHeader readAt={null} line={null} editionHref={null} />
        {live?.refused ? (
          <BoardNote title="Editions are outside your role's scope">Only BTG admins read an edition&rsquo;s production board.</BoardNote>
        ) : (
          <BoardNote title="No edition yet">
            The board fills in once there is an edition: its students&rsquo; pieces, its content, the ads sold in it, its cover and its press PDF.
          </BoardNote>
        )}
      </>
    );
  }

  const e = live.current;
  const res = await readJson<ApiProductionBoard>(`/editions/${encodeURIComponent(e.id)}/production`);
  const board = res.body;
  const readAt = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const line = `${e.label} · ${e.publication.name} · ${boardDates(board?.edition ?? e)}`;
  const editionHref = `/admin/next/editions?edition=${encodeURIComponent(e.id)}`;

  if (!board) {
    return (
      <>
        <ProductionHeader readAt={null} line={line} editionHref={editionHref} />
        <BoardNote title="This edition is outside your role's scope">The production board is read with an edition&rsquo;s write access, which only BTG admins hold.</BoardNote>
      </>
    );
  }

  const all = board.pieces.map((p) => boardRowView(p, board.edition.id));
  const rows = filterRows(all, filter);
  const mine = board.pieces.filter((p) => pieceTurn(p) === "BTG").length;
  const editions = live.editions.map((x) => ({ value: x.id, label: `${x.label} · ${x.publication.name}` }));

  return (
    <>
      <ProductionHeader readAt={readAt} line={line} editionHref={editionHref} />
      <ProductionStats board={board} />
      <ServerList>
        <section aria-label="The edition's pieces" className="mt-6">
          <ProductionDesk rows={rows} total={all.length} filter={filter} editions={editions} editionId={board.edition.id} mine={mine} />
        </section>
      </ServerList>
    </>
  );
}

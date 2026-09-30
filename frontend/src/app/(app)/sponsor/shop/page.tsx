import Link from "next/link";

import { Badge } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { ShopAddToCart } from "@/components/shop-add-to-cart";
import {
  CATEGORY_OPTIONS,
  KIND_OPTIONS,
  SEARCH_LIMIT,
  athleteLine,
  hasFilters,
  kindLabel,
  propertyLine,
  ruleNotes,
  searchApiQuery,
  shopFilters,
  usd,
  windowLabel,
  type ApiSearchResult,
} from "@/lib/shop-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Shop — 2S4-FE-01. Phase 2 self-service buying: search what properties and
   athletes have published, and add it to the cart.

   Reads  GET /marketplace/search  (q, kind, category, sport, stateCode,
          minPrice, maxPrice [cents], availableFrom, availableUntil, limit)
   Writes (via ShopAddToCart → actions.ts)  POST /cart, POST /cart/lines

   Server-rendered: the filters are a plain GET form, so the URL is the
   state and a search is shareable. The API applies the sponsor's catalogue
   scope and hides anything restricted for its brand categories.

   Roles. SPONSOR_ADMIN adds to the cart; SPONSOR_ANALYST can search but not
   write (the cart write is 403 for them), so the add control isn't shown.

   Honest gaps. The API has no paging (first SEARCH_LIMIT results, newest
   first) and no remaining-stock figure — the item's `quantity` is its total
   stock, not what's left, so it is not shown. Availability is checked when a
   line is added, and every reason it fails is listed. This page is separate
   from the Phase 1 /sponsor/marketplace (request-a-brief), which is unchanged.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-text placeholder:text-faint focus:border-primary/50 focus:outline-none";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePortalAccess("sponsor");
  const canWrite = actor.roles.includes("SPONSOR_ADMIN");
  const sp = await searchParams;
  const f = shopFilters(sp);
  const { query, ignored } = searchApiQuery(sp);

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Shop</h1>
        <p className="mt-1 text-xs text-muted">
          Buy published items straight from properties and athletes — add them to your cart, hold them, and place the
          order.
        </p>
      </div>
      <div className="flex gap-3 text-xs">
        <Link href="/sponsor/cart" className="text-primary hover:underline">
          Cart →
        </Link>
        <Link href="/sponsor/orders" className="text-primary hover:underline">
          Orders →
        </Link>
      </div>
    </div>
  );

  const res = await apiFetch(`/marketplace/search${query}`);
  if (res.status === 403) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="users"
          title="The shop isn't open to this account"
          hint="Search is for sponsor accounts linked to a sponsor organisation. Ask BTG to link your account."
        />
      </div>
    );
  }
  let results: ApiSearchResult[] = [];
  let refused: string | null = null;
  if (res.status === 400) {
    /* The builder only sends what the contract accepts, so this is rare — a
       filter the API still refused. Say so rather than fail the page. */
    const body = (await res.json().catch(() => null)) as { error?: { issues?: { message?: string }[]; message?: string } } | null;
    refused = body?.error?.issues?.[0]?.message ?? body?.error?.message ?? "One of the filters wasn't accepted.";
  } else if (!res.ok) {
    throw new Error(`Shop search unavailable (${res.status}).`);
  } else {
    results = ((await res.json()) as { results: ApiSearchResult[] }).results;
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      {heading}

      <form method="get" action="/sponsor/shop" className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-[11px] text-muted sm:col-span-2">
            Search
            <input type="search" name="q" defaultValue={f.q} placeholder="Title or description…" className={field} />
          </label>
          <label className="text-[11px] text-muted">
            Type
            <select name="kind" defaultValue={f.kind} className={field}>
              <option value="">Any type</option>
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-muted">
            Brand category
            <select name="category" defaultValue={f.category} className={field}>
              <option value="">Any category</option>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-muted">
            Sport
            <input type="text" name="sport" defaultValue={f.sport} placeholder="e.g. Basketball" className={field} />
          </label>
          <label className="text-[11px] text-muted">
            State
            <input type="text" name="stateCode" defaultValue={f.stateCode} placeholder="e.g. MD" maxLength={2} className={field} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-muted">
              Min price ($)
              <input type="number" name="minPrice" min={0} step="0.01" defaultValue={f.minPrice} className={field} />
            </label>
            <label className="text-[11px] text-muted">
              Max price ($)
              <input type="number" name="maxPrice" min={0} step="0.01" defaultValue={f.maxPrice} className={field} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-muted">
              Available from
              <input type="date" name="availableFrom" defaultValue={f.availableFrom} className={field} />
            </label>
            <label className="text-[11px] text-muted">
              Available until
              <input type="date" name="availableUntil" defaultValue={f.availableUntil} className={field} />
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-cta-ink hover:bg-primary-soft">
            Search
          </button>
          {hasFilters(f) && (
            <Link href="/sponsor/shop" className="text-xs text-muted hover:text-text">
              Clear filters
            </Link>
          )}
        </div>
        {ignored.length > 0 && (
          <p className="text-[11px] text-warn">Not applied (not a valid value): {ignored.join(", ")}.</p>
        )}
        {refused && <p className="text-[11px] text-warn">{refused}</p>}
      </form>

      {!canWrite && (
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[11px] text-muted">
          You&rsquo;re signed in as a Sponsor Analyst — you can search and read, and a Sponsor Admin adds to the cart and
          places orders.
        </p>
      )}

      {results.length === 0 ? (
        <EmptyState
          mark="inbox"
          title={hasFilters(f) ? "Nothing matches these filters" : "Nothing is on sale yet"}
          hint={
            hasFilters(f)
              ? "Loosen a filter — a wider price range or dates, or any type."
              : "Items appear here once a property publishes a listing and BTG approves it."
          }
        />
      ) : (
        <section className="space-y-3">
          <p className="text-[11px] text-faint">
            {results.length === SEARCH_LIMIT
              ? `Showing the newest ${SEARCH_LIMIT} — narrow the filters to see others.`
              : `${results.length} ${results.length === 1 ? "result" : "results"}`}
          </p>
          <ul className="grid gap-3 lg:grid-cols-2">
            {results.map((r) => {
              const athlete = athleteLine(r.athlete);
              const notes = ruleNotes(r.item.packageRules);
              return (
                <li key={r.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{r.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted">{propertyLine(r.property)}</p>
                      {athlete && <p className="mt-0.5 text-[11px] text-muted">Athlete: {athlete}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">{usd(r.item.priceCents)}</p>
                      <p className="text-[10px] text-faint">each</p>
                    </div>
                  </div>
                  {r.description && <p className="line-clamp-3 text-xs text-muted">{r.description}</p>}
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <Badge tone="primary">{kindLabel(r.item.kind)}</Badge>
                    <span className="text-muted">{windowLabel(r.item.availableFrom, r.item.availableUntil)}</span>
                  </div>
                  {notes.length > 0 && <p className="text-[11px] text-faint">{notes.join(" · ")}</p>}
                  {canWrite && (
                    <ShopAddToCart
                      listingId={r.id}
                      item={{
                        availableFrom: r.item.availableFrom,
                        availableUntil: r.item.availableUntil,
                        packageRules: r.item.packageRules,
                      }}
                      today={today}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   The live catalogue, in the shapes the marketplace renders — P4-FE-01.

   GET /catalogue/packages and /catalogue/jobs answer in whole dollars at
   sponsor prices (never athlete pay, P4-SEC-02); these turn them into the
   catalogue card shapes the fixture demo already uses, so one component
   renders both.
   -------------------------------------------------------------------------- */
import type { LiveJob, Pkg } from "@/components/marketplace-catalog";

export type ApiPackage = {
  id: string; name: string; priceLow: number; priceHigh: number;
  athleteCountMin: number; athleteCountMax: number;
  lineItems: { jobCode: string; quantityPerAthlete: number }[];
  includes: { kind: string; code: string }[];
  exclusivity: boolean; durationWeeks: number | null;
};
export type ApiJob = { id: string; name: string; sellLow: number; sellHigh: number };

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** The API's package, in the shape the catalogue renders. Whole dollars. */
export function toPkg(p: ApiPackage): Pkg {
  const range = (lo: number, hi: number, f: (n: number) => string) => (lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`);
  const parts = [
    ...p.lineItems.map((l) => `${l.jobCode} × ${l.quantityPerAthlete} per athlete`),
    ...p.includes.map((i) => i.code.replace(/_/g, " ").toLowerCase()),
  ];
  return {
    id: p.id,
    name: p.name,
    price: range(p.priceLow, p.priceHigh, usd),
    athletes: range(p.athleteCountMin, p.athleteCountMax, String),
    includes: parts.join(" · "),
    note: p.exclusivity ? "Category exclusivity" : p.durationWeeks ? `${p.durationWeeks}-week run` : "Managed by BTG",
    state: "ACTIVE",
  } as Pkg;
}

export function toJob(j: ApiJob): LiveJob {
  return { id: j.id, name: j.name, price: j.sellLow === j.sellHigh ? usd(j.sellLow) : `${usd(j.sellLow)}–${usd(j.sellHigh)}` };
}


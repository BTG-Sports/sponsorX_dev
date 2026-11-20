#!/usr/bin/env node
/* --------------------------------------------------------------------------
   POL-BE-117 / POL-FE-117 — the place catalogue: Country → Region → City.

   Owner, 2026-11-20: athletes, teams and sponsors pick where they are from
   dropdowns (searchable), never type it. The countries are the United States
   and East Africa (Tanzania, Uganda, Kenya, Rwanda, Burundi, South Sudan,
   Ethiopia, Somalia, DR Congo); every region of each; and the cities in each
   region — for the US every incorporated place.

   ONE SOURCE, THREE OUTPUTS. Run this, never hand-edit what it writes:

     backend/places/places.json          the whole catalogue, cities included —
                                         the API validates every write against it
     frontend/src/lib/places-data.json   countries and regions only (small, bundled)
     frontend/public/places/CC-RC.json   one region's cities, fetched when picked

   INPUTS
     1. The US Census Bureau's place gazetteer (incorporated places). Download
        https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip
        unzip it, and pass the .txt as the first argument. A newer year's file
        has the same columns; bump US_SOURCE below with it.
     2. scripts/places/east-africa.json — the nine East African countries'
        regions and cities, each country with the sources it was checked
        against (researched 2026-11; see that file's `notes`).

   Usage:  node scripts/places/build-places.mjs path/to/2025_Gaz_place_national.txt
   -------------------------------------------------------------------------- */

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const US_SOURCE = "US Census Bureau, 2025 Gazetteer Files — Places (incorporated places, active governments)";

const US_STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/* The Census writes each place's legal type after its name ("Austin city").
   The type goes; it comes back in brackets only where two places in one
   state would otherwise share a name. Keyed by LSAD code. */
const SUFFIX = {
  "25": / city$/, "43": / town$/, "47": / village$/, "21": / borough$/, "37": / municipality$/,
  "53": / city and borough$/, "CN": / corporation$/,
};
const TYPE_WORD = { "25": "city", "43": "town", "47": "village", "21": "borough", "37": "municipality", "53": "city and borough", "CN": "corporation" };
const GOVERNMENT = / (unified government|consolidated government|metropolitan government|metro government|urban county)$/;

/** CDPs (57) and Puerto Rico's statistical places (55, 62) are not
 *  municipalities; inactive (I) and statistical (S) entities are not either. */
const isIncorporated = (lsad, funcstat, usps) => !["57", "55", "62"].includes(lsad) && !["I", "S"].includes(funcstat) && usps in US_STATES;

function cleanName(raw, lsad) {
  let n = raw.replace(/ \(balance\)$/, "");
  if (SUFFIX[lsad]) n = n.replace(SUFFIX[lsad], "");
  n = n.replace(GOVERNMENT, "");
  return n.trim();
}

function usCatalogue(gazetteerPath) {
  const lines = readFileSync(gazetteerPath, "utf8").split(/\r?\n/).filter(Boolean);
  const head = lines[0].split("|");
  const col = (name) => {
    const i = head.indexOf(name);
    if (i < 0) throw new Error(`The gazetteer has no ${name} column — is this the places file?`);
    return i;
  };
  const [USPS, NAME, LSAD, FUNCSTAT] = ["USPS", "NAME", "LSAD", "FUNCSTAT"].map(col);
  const byState = new Map(Object.keys(US_STATES).map((s) => [s, []]));
  /* Hawaii has no incorporated places (Honolulu is a city-county): every
     Census place there is a CDP. A state with none gets its CDPs instead. */
  const cdps = new Map(Object.keys(US_STATES).map((s) => [s, []]));
  for (const line of lines.slice(1)) {
    const c = line.split("|");
    if (c[LSAD] === "57" && c[USPS] in US_STATES) cdps.get(c[USPS]).push({ name: c[NAME].replace(/ CDP$/, "").trim(), lsad: "57" });
    if (!isIncorporated(c[LSAD], c[FUNCSTAT], c[USPS])) continue;
    byState.get(c[USPS]).push({ name: cleanName(c[NAME], c[LSAD]), lsad: c[LSAD] });
  }
  for (const [s, places] of byState) if (places.length === 0) byState.set(s, cdps.get(s));
  const regions = [];
  for (const [code, places] of byState) {
    const count = new Map();
    for (const p of places) count.set(p.name, (count.get(p.name) ?? 0) + 1);
    const cities = places.map((p) => (count.get(p.name) > 1 && TYPE_WORD[p.lsad] ? `${p.name} (${TYPE_WORD[p.lsad]})` : p.name));
    regions.push({ code, name: US_STATES[code], cities: unique(cities) });
  }
  return { name: "United States", regionLabel: "State", sources: [US_SOURCE], regions: byName(regions) };
}

const collator = new Intl.Collator("en", { sensitivity: "base" });
const byName = (list) => [...list].sort((a, b) => collator.compare(a.name, b.name));
const unique = (names) => [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort(collator.compare);

function eastAfrica() {
  const src = JSON.parse(readFileSync(join(ROOT, "scripts", "places", "east-africa.json"), "utf8"));
  const out = {};
  for (const [cc, c] of Object.entries(src.countries)) {
    if (!/^[A-Z]{2}$/.test(cc)) throw new Error(`${cc}: not a two-letter country code`);
    const codes = new Set();
    const regions = c.regions.map((r) => {
      const code = String(r.code).trim().toUpperCase();
      if (!/^[A-Z0-9]{1,3}$/.test(code)) throw new Error(`${cc}-${code}: a region code is 1–3 letters or digits`);
      if (codes.has(code)) throw new Error(`${cc}-${code}: used twice`);
      codes.add(code);
      return { code, name: r.name.trim(), cities: unique(r.cities ?? []) };
    });
    out[cc] = { name: c.name, regionLabel: c.regionLabel ?? "Region", sources: c.sources ?? [], regions: byName(regions) };
  }
  return { asOf: src.asOf, countries: out };
}

/* ------------------------------------------------------------------ build */

const gazetteer = process.argv[2];
if (!gazetteer) {
  console.error("Usage: node scripts/places/build-places.mjs path/to/YYYY_Gaz_place_national.txt");
  process.exit(1);
}

const ea = eastAfrica();
const countries = { US: usCatalogue(gazetteer), ...ea.countries };
const eastAfricaCodes = Object.keys(ea.countries).sort((a, b) => collator.compare(countries[a].name, countries[b].name));
const groups = [
  { label: "United States", countries: ["US"] },
  { label: "East Africa", countries: eastAfricaCodes },
];
const asOf = ea.asOf ?? "2026-11";

/* 1. The backend's whole catalogue. */
const full = { asOf, groups, countries };
mkdirSync(join(ROOT, "backend", "places"), { recursive: true });
writeFileSync(join(ROOT, "backend", "places", "places.json"), JSON.stringify(full) + "\n");

/* 2. The frontend's countries and regions (no cities). */
const lite = {
  asOf,
  groups,
  countries: Object.fromEntries(
    Object.entries(countries).map(([cc, c]) => [cc, {
      name: c.name, regionLabel: c.regionLabel,
      regions: c.regions.map((r) => ({ code: r.code, name: r.name, cities: r.cities.length })),
    }]),
  ),
};
writeFileSync(join(ROOT, "frontend", "src", "lib", "places-data.json"), JSON.stringify(lite, null, 1) + "\n");

/* 3. One file of cities per region, fetched when the region is picked. */
const pub = join(ROOT, "frontend", "public", "places");
mkdirSync(pub, { recursive: true });
for (const f of readdirSync(pub)) if (f.endsWith(".json")) rmSync(join(pub, f));
for (const [cc, c] of Object.entries(countries)) {
  for (const r of c.regions) writeFileSync(join(pub, `${cc}-${r.code}.json`), JSON.stringify(r.cities) + "\n");
}

for (const cc of ["US", ...eastAfricaCodes]) {
  const c = countries[cc];
  const word = c.regionLabel.toLowerCase().replace(/y$/, "ie") + "s";
  console.log(`${cc}  ${c.name.padEnd(14)} ${String(c.regions.length).padStart(3)} ${word.padEnd(10)} ${String(c.regions.reduce((n, r) => n + r.cities.length, 0)).padStart(6)} cities`);
}

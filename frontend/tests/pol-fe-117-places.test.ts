/* POL-FE-117 — where someone is from is picked (Country → Region → City),
   from the same catalogue the API checks writes against. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { filterChoices } from "@/lib/choice-filter";
import { countryChoices, isPlaceCountry, placeCountry, placeRegion, placeWords, regionChoices, regionLabel } from "@/lib/places";
import { changeBody, formFrom, placeLine, stepChanged, stepNeeds } from "@/lib/profile-wizard";
import { pickedRegions, requestRegions } from "@/lib/brief-actions";
import type { ApiMyProfile } from "@/lib/profile-live";

const ROOT = join(__dirname, "..", "..");
type Full = { asOf: string; groups: { label: string; countries: string[] }[]; countries: Record<string, { name: string; regionLabel: string; regions: { code: string; name: string; cities: string[] }[] }> };
const backend = JSON.parse(readFileSync(join(ROOT, "backend", "places", "places.json"), "utf8")) as Full;
const PUBLIC = join(ROOT, "frontend", "public", "places");

describe("the catalogue is one list, front and back", () => {
  it("the frontend's countries and regions are exactly the API's", () => {
    for (const [cc, c] of Object.entries(backend.countries)) {
      const mine = placeCountry(cc)!;
      expect(mine.name, cc).toBe(c.name);
      expect(mine.regionLabel, cc).toBe(c.regionLabel);
      expect(mine.regions.map((r) => [r.code, r.name, r.cities]), cc).toEqual(c.regions.map((r) => [r.code, r.name, r.cities.length]));
    }
    expect(countryChoices().map((o) => o.value)).toEqual(backend.groups.flatMap((g) => g.countries));
  });

  it("every region's city file is there and is that region's list", () => {
    const files = new Set(readdirSync(PUBLIC));
    let n = 0;
    for (const [cc, c] of Object.entries(backend.countries)) {
      for (const r of c.regions) {
        const f = `${cc}-${r.code}.json`;
        expect(files.has(f), f).toBe(true);
        expect(JSON.parse(readFileSync(join(PUBLIC, f), "utf8")), f).toEqual(r.cities);
        n++;
      }
    }
    expect(files.size).toBe(n); // no file for a region that no longer exists
  });
});

describe("the dropdowns", () => {
  it("Country is grouped: the United States, then East Africa A to Z", () => {
    const c = countryChoices();
    expect(c[0]).toMatchObject({ value: "US", label: "United States", group: "United States" });
    const ea = c.filter((o) => o.group === "East Africa");
    expect(ea.map((o) => o.value).sort()).toEqual(["BI", "CD", "ET", "KE", "RW", "SO", "SS", "TZ", "UG"]);
    expect(ea.map((o) => o.label)).toEqual([...ea.map((o) => o.label)].sort((a, b) => a.localeCompare(b)));
    /* One country (a team's profile) needs no heading. */
    expect(countryChoices(["US"])).toEqual([{ value: "US", label: "United States", group: undefined }]);
  });

  it("each country's regions under its own word", () => {
    expect(regionLabel("US")).toBe("State");
    expect(regionChoices("US")).toHaveLength(51);
    expect(regionChoices("TZ").length).toBeGreaterThanOrEqual(31);
    expect(isPlaceCountry("ug")).toBe(true);
    expect(isPlaceCountry("CA")).toBe(false);
    expect(placeRegion("us", "tx")?.name).toBe("Texas");
  });

  it("search finds by the start of a name, then the start of any word, then anywhere", () => {
    const o = [
      { value: "1", label: "Port Arthur" }, { value: "2", label: "Arlington" }, { value: "3", label: "Clearwater" },
      { value: "4", label: "Austin" }, { value: "5", label: "Paso Robles (El Paso de Robles)" },
    ];
    expect(filterChoices(o, "ar").map((x) => x.label)).toEqual(["Arlington", "Port Arthur", "Clearwater"]);
    expect(filterChoices(o, "  AUS ").map((x) => x.label)).toEqual(["Austin"]);
    expect(filterChoices(o, "robles").map((x) => x.label)).toEqual(["Paso Robles (El Paso de Robles)"]);
    expect(filterChoices(o, "")).toHaveLength(5);
    expect(filterChoices(o, "zzz")).toEqual([]);
  });

  it("a place in words: the US as before, abroad by name", () => {
    expect(placeWords({ countryCode: "US", stateCode: "TX", city: "Austin" })).toBe("Austin, TX");
    expect(placeWords({ stateCode: "MD", city: null })).toBe("MD");
    const dar = regionChoices("TZ").find((r) => r.label === "Dar es Salaam")!;
    expect(placeWords({ countryCode: "TZ", stateCode: dar.value, city: "Dar es Salaam" })).toBe("Dar es Salaam, Tanzania");
    expect(placeWords({ countryCode: "TZ", stateCode: dar.value, city: "" })).toBe("Dar es Salaam, Tanzania");
    expect(placeLine({ school: "Lincoln High", city: "Austin", stateCode: "TX" })).toBe("Lincoln High · Austin, TX");
  });
});

describe("the athlete's profile wizard", () => {
  const profile = { displayName: "Neema", city: "Austin", stateCode: "TX", sport: "Athletics", position: null, school: null, level: null, gradYear: null, achievements: null, contentCapabilities: [], brandInterests: [], restrictedCategories: [], restrictionNotes: null } as unknown as ApiMyProfile;

  it("starts in the US when the API says nothing, and sends the country with the place", () => {
    const f = formFrom(profile);
    expect(f.countryCode).toBe("US");
    const ug = regionChoices("UG")[0]!.value;
    const moved = { ...f, countryCode: "UG", stateCode: ug, city: "" };
    expect(stepChanged("identity", moved, f, [], [])).toBe(true);
    expect(changeBody("identity", moved)).toEqual({ identity: { displayName: "Neema", city: null, stateCode: ug, countryCode: "UG" } });
  });

  it("needs a region from the chosen country's list, in that country's word", () => {
    const f = formFrom(profile);
    expect(stepNeeds("identity", f, [])).toBeNull();
    expect(stepNeeds("identity", { ...f, stateCode: "" }, [])).toMatch(/Choose your state from the list/);
    expect(stepNeeds("identity", { ...f, countryCode: "KE", stateCode: "TX" }, [])).toMatch(new RegExp(`Choose your ${regionLabel("KE").toLowerCase()} from the list`));
  });
});

describe("a sponsor's request regions", () => {
  it("are picked from the request's country — US states, or East African regions — and checked", () => {
    expect(pickedRegions(["md", "DC", "MD"], "US")).toEqual(["MD", "DC"]);
    expect(() => pickedRegions(["ZZ"], "US")).toThrow(/ZZ isn't a state of United States/);
    const tz = requestRegions("TZ");
    expect(tz.length).toBeGreaterThanOrEqual(31);
    expect(pickedRegions([tz[0]!.value], "TZ")).toEqual([tz[0]!.value]);
    expect(() => pickedRegions(["MD"], "TZ")).toThrow(/Pick from the list/);
    /* Elsewhere a request covers the whole country. */
    expect(requestRegions("CA")).toEqual([]);
  });
});

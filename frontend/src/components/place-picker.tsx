"use client";

/* --------------------------------------------------------------------------
   POL-FE-117 — Country → Region → City, picked, never typed (owner,
   2026-11-20: "its better if its dropdown that can be selected instead of
   free text … also add a search on the dropdowns").

   Three SearchSelects over the place catalogue (lib/places): the country
   (United States · East Africa), its regions under the name that country
   uses (State, Region, County, Province…), and the region's cities, fetched
   when the region is picked. Changing the country clears the region and
   city; changing the region clears the city — a city is always one of its
   region's.

   A city already on file that isn't on the list (typed before the list
   existed) is kept and shown, marked, until the person picks another — so
   opening the form never silently changes where someone lives.

   Each screen keeps its own field look: pass `field` to wrap each control
   in that screen's label/hint/error markup.
   -------------------------------------------------------------------------- */

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { SearchSelect, type FilterTone, type SearchOption } from "@/components/filter-kit";
import { countryChoices, loadCities, placeCountry, placeRegion, regionChoices, regionLabel, type Place } from "@/lib/places";

export type PlaceField = (f: { key: string; id: string; label: string; hint?: string; error?: string; children: ReactNode }) => ReactNode;

const defaultField: PlaceField = ({ key, id, label, hint, error, children }) => (
  <div key={key} className="min-w-0">
    <label htmlFor={id} className="mb-1 block text-[11px] font-medium text-muted">{label}</label>
    {children}
    {error ? <p className="mt-1 text-[11px] text-danger">{error}</p> : hint ? <p className="mt-1 text-[11px] text-faint">{hint}</p> : null}
  </div>
);

type CityState = { key: string; status: "loading" | "ready" | "error"; list: string[] };

export function PlacePicker({
  value,
  onChange,
  idPrefix,
  tone = "athlete",
  only,
  cityOptional = true,
  errors = {},
  hints = {},
  field = defaultField,
  disabled = false,
}: {
  value: Place;
  onChange: (next: Place) => void;
  /** Ids for the three controls: `${idPrefix}-country` and so on. */
  idPrefix: string;
  tone?: FilterTone;
  /** Limit the countries (a team's profile: the US). One country hides the Country field. */
  only?: readonly string[];
  cityOptional?: boolean;
  errors?: Partial<Record<"country" | "region" | "city", string>>;
  hints?: Partial<Record<"country" | "region" | "city", string>>;
  field?: PlaceField;
  disabled?: boolean;
}) {
  const countries = useMemo(() => countryChoices(only), [only]);
  const showCountry = countries.length > 1;
  const country = value.countryCode || (countries.length === 1 ? countries[0]!.value : "");
  const known = placeCountry(country) !== null;
  const regions = useMemo(() => regionChoices(country), [country]);
  const label = regionLabel(country);
  const region = placeRegion(country, value.regionCode);

  /* The region's cities, fetched once it's picked. */
  const want = known && region ? `${country}-${region.code}` : "";
  const [cities, setCities] = useState<CityState | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!want) return;
    let live = true;
    const [cc, rc] = [country, region!.code];
    loadCities(cc, rc).then(
      (list) => live && setCities({ key: want, status: "ready", list }),
      () => live && setCities({ key: want, status: "error", list: [] }),
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `want` names both codes
  }, [want, retry]);
  /* Nothing back yet for this region means it is on its way. */
  const here = useMemo<CityState | null>(() => (!want ? null : cities && cities.key === want ? cities : { key: want, status: "loading", list: [] }), [want, cities]);

  const cityOptions = useMemo<SearchOption[]>(() => {
    const list: SearchOption[] = (here?.list ?? []).map((c) => ({ value: c, label: c }));
    const onFile = value.city.trim();
    if (onFile && here?.status === "ready" && !here.list.includes(onFile)) list.unshift({ value: onFile, label: onFile, hint: "not on the list" });
    if (cityOptional && (onFile || list.length)) list.unshift({ value: "", label: `No city — just the ${label.toLowerCase()}` });
    return list;
  }, [here, value.city, cityOptional, label]);

  const cityHint = hints.city ?? (here?.status === "ready" ? `${here.list.length.toLocaleString("en-US")} places in ${region?.name}.${cityOptional ? " Optional." : ""}` : cityOptional ? "Optional." : undefined);

  return (
    <>
      {showCountry &&
        field({
          key: "country", id: `${idPrefix}-country`, label: "Country", hint: hints.country, error: errors.country,
          children: (
            <SearchSelect
              id={`${idPrefix}-country`}
              value={known ? country : ""}
              options={countries}
              onChange={(cc) => cc !== country && onChange({ countryCode: cc, regionCode: "", city: "" })}
              placeholder={country && !known ? `${country} — choose from the list` : "Choose a country"}
              searchLabel="Search countries"
              tone={tone}
              disabled={disabled}
              invalid={Boolean(errors.country)}
            />
          ),
        })}
      {field({
        key: "region", id: `${idPrefix}-region`, label, hint: hints.region, error: errors.region,
        children: (
          <SearchSelect
            id={`${idPrefix}-region`}
            value={region?.code ?? ""}
            options={regions}
            onChange={(rc) => rc !== region?.code && onChange({ countryCode: country, regionCode: rc, city: "" })}
            placeholder={!known ? "Choose a country first" : value.regionCode && !region ? `${value.regionCode} — choose from the list` : `Choose a ${label.toLowerCase()}`}
            searchLabel={`Search ${label.toLowerCase()}s`}
            tone={tone}
            disabled={disabled || !known}
            invalid={Boolean(errors.region)}
          />
        ),
      })}
      {field({
        key: "city", id: `${idPrefix}-city`, label: "City", hint: cityHint, error: errors.city,
        children: (
          <>
            <SearchSelect
              id={`${idPrefix}-city`}
              value={value.city}
              options={cityOptions}
              onChange={(c) => onChange({ countryCode: country, regionCode: region?.code ?? value.regionCode, city: c })}
              placeholder={!region ? `Choose a ${label.toLowerCase()} first` : "Choose a city"}
              searchLabel="Search cities"
              tone={tone}
              disabled={disabled || !region || here?.status === "error"}
              loading={here?.status === "loading"}
              invalid={Boolean(errors.city)}
              emptyText={`No city by that name in ${region?.name ?? "this " + label.toLowerCase()} — check the spelling, or the ${label.toLowerCase()}.`}
            />
            {here?.status === "error" && (
              <p role="alert" className="mt-1 text-[11px] text-danger">
                Couldn&rsquo;t load the cities for {region?.name}.{" "}
                <button type="button" onClick={() => { setCities(null); setRetry((n) => n + 1); }} className="font-semibold underline">Try again</button>
              </p>
            )}
          </>
        ),
      })}
    </>
  );
}

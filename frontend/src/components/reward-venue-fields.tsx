"use client";

import { useId } from "react";
import { VENUE_CITY_MAX, VENUE_STATE_OPTIONS, parseVenue, venueLabel } from "@/lib/reward-venue";

/* --------------------------------------------------------------------------
   3S0-FE-01 — the reward creator's venue: a city and a US state, optional,
   both or neither (lib/reward-venue.ts). Used by the live creator
   (live-rewards-desk.tsx) and the fixture wizard (reward-creator.tsx). The
   parent owns the two values; this draws them and says, as you type, what
   will be saved — "Austin, TX", "Online only", or why it can't be.
   -------------------------------------------------------------------------- */

export function RewardVenueFields({
  city,
  stateCode,
  onCity,
  onState,
  inputClassName,
}: {
  city: string;
  stateCode: string;
  onCity: (v: string) => void;
  onState: (v: string) => void;
  inputClassName: string;
}) {
  const id = useId();
  const parsed = parseVenue(city, stateCode);
  const bad = !parsed.ok;
  return (
    <fieldset className="space-y-2 rounded-lg border border-line-soft p-3">
      <legend className="px-1 text-[11px] font-medium text-muted">
        Venue <span className="text-faint">(optional — where the reward is handed out)</span>
      </legend>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <label className="block">
          <span className="text-[11px] font-medium text-muted">City</span>
          <input
            value={city}
            onChange={(e) => onCity(e.target.value)}
            maxLength={VENUE_CITY_MAX}
            placeholder="e.g. Austin"
            autoComplete="off"
            aria-invalid={bad && !city.trim()}
            aria-describedby={`${id}-hint`}
            className={inputClassName}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-muted">State</span>
          <select
            value={stateCode}
            onChange={(e) => onState(e.target.value)}
            aria-invalid={bad && !stateCode}
            aria-describedby={`${id}-hint`}
            className={inputClassName}
          >
            <option value="">No state</option>
            {VENUE_STATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>
      <p id={`${id}-hint`} className={`text-[10px] ${bad ? "text-danger" : "text-faint"}`} aria-live="polite">
        {parsed.ok
          ? parsed.venue
            ? `Saved as ${venueLabel(parsed.venue)} — the reward's location, never the fan's.`
            : "Leave both blank for an online-only reward. This is the reward's location, never the fan's."
          : parsed.message}
      </p>
    </fieldset>
  );
}

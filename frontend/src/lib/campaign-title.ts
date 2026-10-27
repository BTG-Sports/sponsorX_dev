/* --------------------------------------------------------------------------
   A campaign's name with its sponsor's beside it, said once.

   BTG often names a campaign after its sponsor ("Harbor Coffee · SponsorX
   Test Drive"), so joining sponsor and campaign blindly printed the sponsor
   twice: "Harbor Coffee · Harbor Coffee · SponsorX Test Drive" (staging dry
   run, 2026-10-26). When the campaign's name already starts with the
   sponsor's, the campaign's name says both.
   -------------------------------------------------------------------------- */

/** True when `campaign` starts with `sponsor` as a whole word or phrase
 *  ("Harbor Coffee · Fall" for "Harbor Coffee"; not "Harborview Fall" for
 *  "Harbor"). Case and surrounding spaces are ignored. */
export function campaignNamesSponsor(campaign: string, sponsor: string): boolean {
  const c = campaign.trim().toLowerCase();
  const s = sponsor.trim().toLowerCase();
  if (!s || !c.startsWith(s)) return false;
  const next = c.charAt(s.length);
  return next === "" || !/[\p{L}\p{N}]/u.test(next);
}

/** The campaign's name with the sponsor's taken off the front — for a row
 *  whose title is already the sponsor ("Harbor Coffee" over "SponsorX Test
 *  Drive", not over "Harbor Coffee · SponsorX Test Drive"). Unchanged when the
 *  name doesn't start with the sponsor's, or when nothing would be left. */
export function campaignAfterSponsor(campaign: string, sponsor: string): string {
  if (!campaignNamesSponsor(campaign, sponsor)) return campaign;
  const after = campaign.trim().slice(sponsor.trim().length);
  /* Only a space or a separator ends the sponsor's part: "Harbor Coffee's
     Fall Push" and "Harbor Coffee & Friends" are names in their own right,
     and stripping them would leave "'s Fall Push" or "& Friends". */
  /* A plain hyphen counts only with a space after it ("Harbor - Fall"), not
     inside a word ("Harbor-view Fall"). */
  if (!/^(\s|[·•|:–—]|-\s)/u.test(after)) return campaign;
  const rest = after.replace(/^[\s·•|:\-–—]+/u, "").trim();
  /* What's left must read as a name of its own: "& Friends" or "+ Co" does not. */
  return /^[\p{L}\p{N}]/u.test(rest) ? rest : campaign;
}

/** "Sponsor · Campaign", or "Campaign · Sponsor" with `campaignFirst`, or the
 *  campaign's name alone when it already names the sponsor. */
export function campaignWithSponsor(campaign: string, sponsor: string, opts: { campaignFirst?: boolean } = {}): string {
  if (campaignNamesSponsor(campaign, sponsor)) return campaign;
  return opts.campaignFirst ? `${campaign} · ${sponsor}` : `${sponsor} · ${campaign}`;
}

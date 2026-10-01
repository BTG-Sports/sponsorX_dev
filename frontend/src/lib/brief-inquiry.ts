import { OTHER_BUSINESS_TYPE, businessTypeText, isBusinessType, packageOption, type BriefDraft } from "@/lib/brief-flow";

/* --------------------------------------------------------------------------
   The public brief → POST /public/inquiries body (P2-FE-01). Pure, and kept
   out of brief/actions.ts on purpose: every export of a "use server" file is
   a callable endpoint (QA pass 7, F-6), and this is not one.

   The inquiry contract is the Zoho Lead's shape — name, company, email,
   phone, message — and is strict, so the brief's structured answers travel
   in `message`, labelled, and optional fields are absent rather than "".

   2S1-FE-11: the business type also travels as its own fields —
   `businessType` (one of the list, or OTHER) and `businessTypeOther` (its
   own words, sent only with OTHER) — because automatic approval
   (2S1-BE-17) checks them. The message keeps a "Brand category:" line in
   words too: it is what BTG's sponsor-request desk reads back
   (categoryText) and what the Zoho Lead carries.
   -------------------------------------------------------------------------- */

/** The brief as the inquiry contract takes it. */
export function toInquiry(d: BriefDraft) {
  const a = d.answers;
  const t = (v: string | undefined) => (v ?? "").trim();
  const name = t(a.name);
  const space = name.lastIndexOf(" ");
  const firstName = space > 0 ? name.slice(0, space).trim() : "";
  const lastName = space > 0 ? name.slice(space + 1).trim() : name;
  const lines = [
    ["Goal", d.goal],
    ["Budget", d.budget],
    ["Package", packageOption(d.package).name],
    ["Brand category", businessTypeText(d) || a.category],
    ["Market", a.market],
    ["Audience", a.audience],
    ["Timing", a.timing],
    ["Success looks like", a.success],
  ]
    .filter(([, v]) => t(v))
    .map(([k, v]) => `${k}: ${t(v)}`);
  const type = isBusinessType(d.businessType) ? d.businessType : null;
  const other = t(d.businessTypeOther).slice(0, 200);
  return {
    lastName: lastName.slice(0, 80),
    ...(firstName ? { firstName: firstName.slice(0, 40) } : {}),
    ...(t(a.company) ? { companyName: t(a.company).slice(0, 200) } : {}),
    email: t(a.email),
    ...(t(a.phone).length >= 3 ? { phone: t(a.phone).slice(0, 30) } : {}),
    ...(type ? { businessType: type } : {}),
    ...(type === OTHER_BUSINESS_TYPE && other.length >= 2 ? { businessTypeOther: other } : {}),
    message: ["Sponsor brief (sponsorx /brief)", ...lines].join("\n").slice(0, 4000),
  };
}

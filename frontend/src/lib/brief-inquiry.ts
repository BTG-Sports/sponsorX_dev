import { packageOption, type BriefDraft } from "@/lib/brief-flow";

/* --------------------------------------------------------------------------
   The public brief → POST /public/inquiries body (P2-FE-01). Pure, and kept
   out of brief/actions.ts on purpose: every export of a "use server" file is
   a callable endpoint (QA pass 7, F-6), and this is not one.

   The inquiry contract is the Zoho Lead's shape — name, company, email,
   phone, message — and is strict, so the brief's structured answers travel
   in `message`, labelled, and optional fields are absent rather than "".
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
    ["Brand category", a.category],
    ["Market", a.market],
    ["Audience", a.audience],
    ["Timing", a.timing],
    ["Success looks like", a.success],
  ]
    .filter(([, v]) => t(v))
    .map(([k, v]) => `${k}: ${t(v)}`);
  return {
    lastName: lastName.slice(0, 80),
    ...(firstName ? { firstName: firstName.slice(0, 40) } : {}),
    ...(t(a.company) ? { companyName: t(a.company).slice(0, 200) } : {}),
    email: t(a.email),
    ...(t(a.phone).length >= 3 ? { phone: t(a.phone).slice(0, 30) } : {}),
    message: ["Sponsor brief (sponsorx /brief)", ...lines].join("\n").slice(0, 4000),
  };
}

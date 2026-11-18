/** POL-BE-102 — a sponsor's Account page: the company's details and the person's own. */
import { z } from "./zod";
import { BRAND_CATEGORIES } from "../domain/brand-categories";

const text = (max: number) => z.string().trim().min(1).max(max).nullable().optional();

export const SponsorCompanyInput = z
  .object({
    logoKey: z.string().max(300).nullable().optional(),
    website: z.url().max(300).refine((u) => /^https?:\/\//i.test(u), { message: "A website starts with http:// or https://." }).nullable().optional(),
    address: text(500),
    billingContactName: text(120),
    billingContactEmail: z.email().max(200).nullable().optional(),
    billingContactPhone: text(40),
  })
  .strict()
  .meta({ id: "SponsorCompanyInput", description: "The company details that save at once (null clears one): the logo key from POST /sponsor/account/logo, website, address and billing contact." });

export const SponsorMeInput = z
  .object({ name: text(120), jobTitle: text(120) })
  .strict()
  .meta({ id: "SponsorMeInput", description: "The signed-in person's own name and job title (null clears one)." });

export const SponsorAccountChangeInput = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    categories: z.array(z.enum(BRAND_CATEGORIES)).min(1).max(BRAND_CATEGORIES.length).optional(),
  })
  .strict()
  .meta({ id: "SponsorAccountChangeInput", description: "A new company name and/or brand categories, for BTG to approve." });

export const SponsorAccountRejectInput = z
  .object({ reason: z.string().trim().min(1).max(1000) })
  .strict()
  .meta({ id: "SponsorAccountRejectInput", description: "Why BTG rejected the change — the sponsor reads it." });

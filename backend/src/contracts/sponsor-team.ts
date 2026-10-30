/** POL-BE-19 — a sponsor admin's team: invite by email, and set each person's role. */
import { z } from "./zod";

export const SponsorTeamRole = z.enum(["SPONSOR_ADMIN", "SPONSOR_ANALYST"])
  .meta({ id: "SponsorTeamRole", description: "SPONSOR_ADMIN does everything the sponsor may do; SPONSOR_ANALYST reads only." });

export const SponsorTeamInviteInput = z
  .object({ email: z.email().max(100), role: SponsorTeamRole })
  .strict()
  .meta({ id: "SponsorTeamInviteInput", description: "Who to invite, and as what." });

export const SponsorTeamRoleInput = z
  .object({ role: SponsorTeamRole })
  .strict()
  .meta({ id: "SponsorTeamRoleInput", description: "The person's new role." });

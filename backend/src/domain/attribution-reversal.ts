/**
 * A refunded sale stops counting for the student who originated it —
 * P9-BE-19 follow-up (programme owner's review, 2026-10-03).
 *
 * SalesAttribution is append-only: Postgres refuses any update or delete
 * (trigger sales_attribution_immutable, P9-BE-13). So a sale is never
 * edited away. Its reversal is a NEW row — the same student, sponsor,
 * campaign and edition, the negative value, and `reversesId` naming the row
 * it reverses (unique: a sale is reversed once; a CHECK keeps reversals
 * negative and sales not). The student's total is `_sum(value)`
 * (student.ts `studentSales`), so it drops by the refunded sale with no
 * reader changed, and the next sale's milestones are counted from that
 * lower total (attributeSale's own `_sum`).
 *
 * POINTS. A SALES_500 accrual earned by crossing a $500 mark the refunded
 * sale carried the student over is taken back the same way: a
 * SALES_500_REVERSED accrual of minus the SALES_500 value, one per mark the
 * total falls back under. The balance is `_sum(points)`, so it drops too.
 *
 * Written in the cancellation's transaction (edition.ts `cancelEditionIn`),
 * under the campaign's row lock, as the slots are released.
 */
import type { Prisma } from "../generated/prisma/client";
import { audit, type AuditActor } from "../db/audit";
import { pointsFor, salesMilestonesCrossed } from "./student-points";

type Tx = Prisma.TransactionClient;

/** The accrual reason that takes a SALES_500 back. */
export const SALES_500_REVERSED = "SALES_500_REVERSED";

export async function reverseSaleAttributions(
  tx: Tx,
  by: AuditActor,
  sale: { tenantId: string; campaignId: string; editionId: string; reason: string },
): Promise<Array<{ studentId: string; reversedCents: number; pointsTakenBack: number }>> {
  const out: Array<{ studentId: string; reversedCents: number; pointsTakenBack: number }> = [];
  const rows = await tx.salesAttribution.findMany({
    where: { tenantId: sale.tenantId, campaignId: sale.campaignId, editionId: sale.editionId, reversesId: null, reversal: { is: null }, value: { gt: 0 } },
    select: { id: true, studentId: true, sponsorId: true, value: true },
    orderBy: { originatedAt: "asc" },
  });
  for (const row of rows) {
    const before = (await tx.salesAttribution.aggregate({
      where: { tenantId: sale.tenantId, studentId: row.studentId }, _sum: { value: true },
    }))._sum.value ?? 0;
    const made = await tx.salesAttribution.createMany({
      data: [{
        tenantId: sale.tenantId, studentId: row.studentId, sponsorId: row.sponsorId,
        campaignId: sale.campaignId, editionId: sale.editionId, value: -row.value, reversesId: row.id,
      }],
      /* reversesId is unique: a sale reversed twice is reversed once. */
      skipDuplicates: true,
    });
    if (!made.count) continue;
    const lost = salesMilestonesCrossed(Math.max(0, before - row.value), before);
    for (let i = 0; i < lost; i++) {
      await tx.studentPointAccrual.create({
        data: { tenantId: sale.tenantId, studentId: row.studentId, reason: SALES_500_REVERSED, points: -pointsFor("SALES_500"), editionId: sale.editionId },
        select: { id: true },
      });
    }
    await audit(tx, by, "saleAttribution.reverse", "Student", row.studentId, {
      before: { attributionId: row.id, value: row.value, totalCents: before },
      after: { reversedCents: row.value, totalCents: before - row.value, pointsTakenBack: lost * pointsFor("SALES_500"), reason: sale.reason },
    });
    out.push({ studentId: row.studentId, reversedCents: row.value, pointsTakenBack: lost * pointsFor("SALES_500") });
  }
  return out;
}

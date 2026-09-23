/**
 * What each SX job obliges the athlete to produce — P5-BE-03, §13 step 7.
 *
 * `NilJob` carries a name and four prices and nothing about the work itself,
 * so "the deliverable set derived from the SX job" needs this table to derive
 * it *from*. It is reference data in the same sense as the catalogue in
 * `nil-jobs.ts`: the same seven entries in every environment, production
 * included.
 *
 * DUE DATES COUNT BACK FROM THE ORDER'S DUE DATE, NOT FORWARD FROM
 * ACCEPTANCE. A campaign line exists to land before a date that matters — a
 * game, a launch, a season opener — and `CampaignOrder.dueDate` is that date.
 * Counting forward from acceptance would let a late-accepted order schedule
 * its deliverables after the moment the sponsor bought, which is exactly the
 * failure the due date exists to prevent. So the last item of every job is due
 * on the order's due date and earlier items step back from it.
 *
 * A DERIVED DATE IS NEVER PUSHED PAST THE ORDER DUE DATE, and an order
 * accepted so late that an earlier item would fall in the past still gets that
 * item — dated in the past, visibly overdue, rather than quietly re-based to
 * look achievable. An overdue row a campaign manager can see beats a tidy one
 * that lies.
 *
 * THIS TABLE IS A STARTING POINT, NOT A CONTRACT. Deliverable rows are
 * ordinary records once created; BTG edits titles and dates per order where a
 * sponsor negotiated something different. What the table guarantees is that no
 * accepted order ever has an *empty* set.
 */

export type DeliverableTemplateItem = {
  /** Becomes `Deliverable.title` verbatim. */
  title: string;
  /**
   * Days before `CampaignOrder.dueDate` this item is due. 0 means the due
   * date itself. Always >= 0 — nothing is scheduled after the order's date.
   */
  daysBeforeDue: number;
};

/**
 * Keyed by `NilJob.id` (SX-01…SX-07). Every id in `NIL_JOBS` must appear
 * here; `deliverable-template.test.ts` asserts it, because an unmapped job
 * would mean an athlete accepting a contract that owes nothing.
 */
export const DELIVERABLE_TEMPLATES: Readonly<
  Record<string, readonly DeliverableTemplateItem[]>
> = {
  "SX-01": [{ title: "Story drop", daysBeforeDue: 0 }],

  "SX-02": [{ title: "Sponsored feed post", daysBeforeDue: 0 }],

  "SX-03": [{ title: "Athlete reel", daysBeforeDue: 0 }],

  /* The product has to arrive and be used before it can be posted about, so
     the unboxing leads and the considered post follows. */
  "SX-04": [
    { title: "Product unboxing story", daysBeforeDue: 7 },
    { title: "Product experience post", daysBeforeDue: 0 },
  ],

  /* The appearance is the thing bought; the recap is what makes it reach
     people who were not there. */
  "SX-05": [
    { title: "Local appearance", daysBeforeDue: 3 },
    { title: "Appearance recap post", daysBeforeDue: 0 },
  ],

  /* A content day is one shoot that produces a package. The shoot is itself a
     deliverable because it is the thing that can slip; the edits depend on
     it. */
  "SX-06": [
    { title: "Content day shoot", daysBeforeDue: 14 },
    { title: "Edited hero video", daysBeforeDue: 5 },
    { title: "Photo set handover", daysBeforeDue: 0 },
  ],

  /* A month of ambassadorship is four weekly posts, not one deliverable the
     athlete can leave to the last day. */
  "SX-07": [
    { title: "Ambassador post — week 1", daysBeforeDue: 21 },
    { title: "Ambassador post — week 2", daysBeforeDue: 14 },
    { title: "Ambassador post — week 3", daysBeforeDue: 7 },
    { title: "Ambassador post — week 4", daysBeforeDue: 0 },
  ],
};

export class NoDeliverableTemplateError extends Error {
  readonly status = 500;
  constructor(jobId: string) {
    super(
      `No deliverable template for NIL job ${jobId}. An order cannot be ` +
        `accepted against a job that obliges the athlete to produce nothing — ` +
        `add it to DELIVERABLE_TEMPLATES.`,
    );
    this.name = "NoDeliverableTemplateError";
  }
}

/** The template for a job, or a loud failure. Never an empty set. */
export function templateForJob(jobId: string): readonly DeliverableTemplateItem[] {
  const template = DELIVERABLE_TEMPLATES[jobId];
  if (!template || template.length === 0) throw new NoDeliverableTemplateError(jobId);
  return template;
}

/**
 * The concrete rows an order owes: the job's template resolved against that
 * order's due date. Pure — no database, no clock — so the scheduling rule is
 * testable on its own.
 */
export function deliverablesForOrder(input: {
  jobId: string;
  dueDate: Date;
}): { title: string; dueDate: Date }[] {
  return templateForJob(input.jobId).map((item) => {
    const due = new Date(input.dueDate);
    due.setUTCDate(due.getUTCDate() - item.daysBeforeDue);
    return { title: item.title, dueDate: due };
  });
}

/**
 * Retry policy per queue — 2S1-INT-01 ("send as queued jobs and retry on
 * failure").
 *
 * pg-boss retries a failed job twice, immediately, unless told otherwise. For
 * email that is the wrong shape: a vendor outage lasts minutes, and three
 * attempts inside a second all land in it. So the email queue says what it
 * wants — six more attempts, backing off from thirty seconds (roughly 30s,
 * 1m, 2m, 4m, 8m, 16m: half an hour of outage survived) — and every attempt
 * is safe to repeat, because `handleSendEmail` claims the idempotency key
 * before sending and releases it when the vendor refuses.
 *
 * Applied with create-then-update, so a queue that already exists in a
 * deployed database (created under the defaults) is brought to this policy
 * on the next boot rather than keeping the old one forever.
 */
export type RetryPolicy = { retryLimit: number; retryDelay: number; retryBackoff: boolean };

export const QUEUE_POLICY: Readonly<Record<string, RetryPolicy>> = {
  "notify.email": { retryLimit: 6, retryDelay: 30, retryBackoff: true },
};

type QueueAdmin = {
  createQueue(name: string, options?: RetryPolicy): Promise<void>;
  updateQueue(name: string, options?: RetryPolicy): Promise<void>;
};

export async function applyQueuePolicy(boss: QueueAdmin, name: string): Promise<void> {
  const policy = QUEUE_POLICY[name];
  await boss.createQueue(name, policy);
  if (policy) await boss.updateQueue(name, policy);
}

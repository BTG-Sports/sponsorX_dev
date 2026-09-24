/**
 * A fake Zoho CRM org for the sync tests — P8-INT-01..07.
 *
 * Just enough of the real API's semantics to make the sync's rules
 * observable: upsert dedupes on `SponsorX_ID` exactly as
 * `duplicate_check_fields` does, update is by id, and every write is logged
 * and raises a notification the way a Notifications API channel would — so a
 * test can feed Zoho's own echo straight back into the inbound path.
 */
import type { ZohoRecord, ZohoUser } from "../../src/lib/zoho";
import type { ZohoApi } from "../../src/domain/zoho-sync";

export type Write = { op: "upsert" | "update"; module: string; id: string; record: ZohoRecord; action: string };

export class FakeZoho implements ZohoApi {
  readonly records = new Map<string, Map<string, ZohoRecord>>();
  readonly writes: Write[] = [];
  /** Notifications Zoho would send: one per write, ours or a person's. */
  readonly notifications: { module: string; id: string }[] = [];
  users: ZohoUser[] = [];
  /* Each fake org numbers from its own random base, so test files running
     in parallel against one database never mint the same Zoho id — the
     zoho*Id columns are unique. */
  private seq = 1_000_000_000 + Math.floor(Math.random() * 1_000_000) * 1_000;
  private clock = Date.now();

  private mod(module: string) {
    if (!this.records.has(module)) this.records.set(module, new Map());
    return this.records.get(module)!;
  }

  private tick(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  all(module: string): ZohoRecord[] {
    return [...this.mod(module).values()];
  }

  bySponsorXId(module: string, key: string): ZohoRecord | undefined {
    return this.all(module).find((r) => r.SponsorX_ID === key);
  }

  /** A person editing the record in the CRM. */
  humanEdit(module: string, id: string, fields: ZohoRecord): void {
    const r = this.mod(module).get(id)!;
    Object.assign(r, fields, { Modified_Time: this.tick() });
    this.notifications.push({ module, id });
  }

  /** A record that exists in the CRM before SponsorX ever wrote to it. */
  seed(module: string, fields: ZohoRecord): string {
    const id = String(++this.seq);
    this.mod(module).set(id, { ...fields, id, Modified_Time: this.tick() });
    return id;
  }

  async upsert(module: string, record: ZohoRecord) {
    if (!record.SponsorX_ID) throw new Error("upsert without SponsorX_ID");
    const existing = this.bySponsorXId(module, String(record.SponsorX_ID));
    let id: string;
    let action: string;
    if (existing) {
      Object.assign(existing, record, { Modified_Time: this.tick() });
      id = String(existing.id);
      action = "update";
    } else {
      id = String(++this.seq);
      this.mod(module).set(id, { ...record, id, Modified_Time: this.tick() });
      action = "insert";
    }
    this.writes.push({ op: "upsert", module, id, record, action });
    this.notifications.push({ module, id });
    return { id, action };
  }

  async update(module: string, id: string, record: ZohoRecord) {
    const existing = this.mod(module).get(id);
    if (!existing) throw new Error(`no ${module} ${id}`);
    Object.assign(existing, record, { Modified_Time: this.tick() });
    this.writes.push({ op: "update", module, id, record, action: "update" });
    this.notifications.push({ module, id });
    return { id, action: "update" };
  }

  async get(module: string, id: string) {
    const r = this.mod(module).get(id);
    return r ? { ...r } : null;
  }

  async coql(query: string) {
    const m = query.match(/from (\w+) where SponsorX_ID is not null limit (\d+), (\d+)/);
    if (!m) throw new Error(`fake coql cannot parse: ${query}`);
    const rows = this.all(m[1]!).filter((r) => r.SponsorX_ID);
    const off = Number(m[2]);
    const size = Number(m[3]);
    return { rows: rows.slice(off, off + size).map((r) => ({ ...r })), more: off + size < rows.length };
  }

  async list(module: string, _fields: readonly string[], page: number, perPage = 200) {
    const rows = this.all(module);
    const start = (page - 1) * perPage;
    return { rows: rows.slice(start, start + perPage).map((r) => ({ ...r })), more: start + perPage < rows.length };
  }

  async activeUsers() {
    return this.users;
  }
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Card } from "./ui";
import { setEmailDomainAction } from "@/app/(app)/advisor/actions";

/* P9-FE-11 — the advisor's school email domain. Students on the school's
   roster are approved automatically; an ADULT also needs an application
   email on this domain, so a stranger with a classmate's name and a free
   email address still comes to the advisor. The API refuses gmail.com and
   the like, and says why. */
export function SchoolEmailDomain({
  propertyId,
  school,
  emailDomain,
  rosterEntries,
}: {
  propertyId: string;
  school: string;
  emailDomain: string | null;
  rosterEntries: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(emailDomain ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <Card className="min-w-0">
      <p className="text-sm font-medium">Automatic approval at {school}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {rosterEntries === 0
          ? "Your school has no roster on file yet, so every application comes to you."
          : `An application that matches exactly one of the ${rosterEntries} names on your roster is approved automatically. Anything else waits here with the reason.`}{" "}
        Adults (18 and over) also need an application email on your school&rsquo;s domain.
      </p>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          start(async () => {
            const r = await setEmailDomainAction(propertyId, value);
            setMsg(r);
            if (r.ok) router.refresh();
          });
        }}
      >
        <label className="min-w-0 flex-1 basis-56 text-[10px] font-medium uppercase tracking-wide text-muted">
          School email domain
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="northside.k12.md.us"
            maxLength={253}
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs normal-case outline-none focus-visible:ring-2 focus-visible:ring-next"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
      <p className="mt-1.5 text-[10px] text-faint">The part after the @ — leave it empty and adult applicants always come to you.</p>
      {msg && (
        <p role="status" className={`mt-1.5 text-[11px] ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.message}
        </p>
      )}
    </Card>
  );
}

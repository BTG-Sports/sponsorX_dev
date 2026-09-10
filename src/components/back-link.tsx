import Link from "next/link";
import type { BackTarget } from "@/lib/back";

/** Shared back-link chrome so every detail screen renders it identically. */
export function BackLink({ target }: { target: BackTarget }) {
  return (
    <Link
      href={target.href}
      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted transition-colors hover:text-text"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3"
        aria-hidden="true"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      {target.label}
    </Link>
  );
}

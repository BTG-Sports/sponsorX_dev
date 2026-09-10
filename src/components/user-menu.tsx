"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/* --------------------------------------------------------------------------
   Top-bar user menu: the name/role block and avatar open a dropdown with a
   sign-out action. Mock auth has no session to clear, so signing out just
   returns to /login — replaced by Clerk's signOut() in guide §04.
   -------------------------------------------------------------------------- */

export function UserMenu({
  userName,
  userRole,
  accentBg,
  accentText,
}: {
  userName: string;
  userRole: string;
  accentBg: string;
  accentText: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-3 rounded-full border border-transparent py-1 pl-3 pr-1.5 transition-all duration-300 hover:border-line/70 hover:bg-surface-2/60"
      >
        <span className="hidden text-right sm:block">
          <span className="block text-xs font-medium leading-tight">
            {userName}
          </span>
          <span className="block text-[10px] leading-tight text-faint">
            {userRole}
          </span>
        </span>
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full ${accentBg} text-xs font-semibold ${accentText} shadow-md shadow-black/20 ring-1 ring-inset ring-text/15`}
        >
          {userName.slice(0, 1)}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`size-3 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="sx-pop absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-xl border border-line/80 bg-surface/95 shadow-xl shadow-black/40 backdrop-blur-xl"
        >
          <div className="border-b border-line px-3.5 py-2.5 sm:hidden">
            <p className="text-xs font-medium leading-tight">{userName}</p>
            <p className="text-[10px] leading-tight text-faint">{userRole}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push("/login");
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-xs text-muted transition-colors hover:bg-surface-2 hover:text-danger"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="size-4"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

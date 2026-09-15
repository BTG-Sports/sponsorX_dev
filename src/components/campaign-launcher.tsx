"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CampaignBuilder } from "@/components/campaign-builder";
import { CloseIcon } from "@/components/filter-kit";

/* --------------------------------------------------------------------------
   CampaignLauncher — the "Create New Campaign" button and the modal it opens
   (2026-09-15). The builder is a big five-step flow, so this is a spacious
   near-full-screen modal (max-w-6xl · 92vh · internal scroll), not a cramped
   centered dialog: the wizard + live projection rail keep the same two-column
   layout they'd have on a full page.

   Modal plumbing mirrors the applications desk's review drawer — portaled to
   <body>, Escape closes, background scroll locks, focus lands on the close
   button and returns to the trigger on close, click-away backdrop. Each open
   mounts a fresh builder (new campaign = clean slate); step state stays out of
   the URL here (syncUrl=false) so closing leaves no stale ?step.
   -------------------------------------------------------------------------- */

type BuilderProps = React.ComponentProps<typeof CampaignBuilder>;

export function CampaignLauncher({
  inventory,
  athletes,
  steps,
  draft,
  reward,
  label = "Create New Campaign",
  variant = "primary",
  className,
}: Pick<BuilderProps, "inventory" | "athletes" | "steps" | "draft" | "reward"> & {
  /** Trigger button text. */
  label?: string;
  variant?: "primary" | "secondary";
  /** Fully overrides the trigger classes when set. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const requestClose = () => setClosing(true);
  const finishClose = () => {
    setClosing(false);
    setOpen(false);
    triggerRef.current?.focus();
  };

  /* Escape closes, page scroll locks behind the modal, focus moves in. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* Unmount rides the fade-out; a fallback timer guarantees close either way. */
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(finishClose, 200);
    return () => clearTimeout(t);
  }, [closing]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setClosing(false);
          setOpen(true);
        }}
        className={
          className ??
          [
            "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
            variant === "primary"
              ? "bg-primary text-cta-ink hover:bg-primary-soft"
              : "border border-line text-text hover:bg-surface-2",
          ].join(" ")
        }
      >
        {variant === "primary" && (
          <span aria-hidden="true" className="text-sm leading-none">
            +
          </span>
        )}
        {label}
      </button>

      {open &&
        createPortal(
          <div
            className={["fixed inset-0 z-50", closing ? "pointer-events-none" : ""].join(" ")}
            role="dialog"
            aria-modal="true"
            aria-label="Create campaign"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={requestClose}
              className={[
                closing ? "sx-backdrop-out" : "sx-backdrop",
                "absolute inset-0 cursor-default bg-black/55",
              ].join(" ")}
            />

            <div className="absolute inset-0 flex items-stretch justify-center sm:items-center sm:p-4">
              <div
                className={[
                  "relative flex max-h-full w-full max-w-6xl flex-col overflow-hidden bg-bg shadow-2xl transition-all duration-200 sm:max-h-[92vh] sm:rounded-2xl sm:border sm:border-line",
                  closing ? "scale-[0.98] opacity-0" : "sx-pop",
                ].join(" ")}
              >
                {/* header — pinned */}
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line-soft bg-surface px-5 py-3.5">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold tracking-tight">
                      Create Campaign
                    </h2>
                    <p className="truncate text-[11px] text-muted">
                      Managed workflow · §13 — nothing sends until counsel clears
                      the template (§08)
                    </p>
                  </div>
                  <button
                    ref={closeBtnRef}
                    type="button"
                    onClick={requestClose}
                    aria-label="Close"
                    className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-2 hover:text-text"
                  >
                    <CloseIcon />
                  </button>
                </div>

                {/* scroll body */}
                <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
                  <CampaignBuilder
                    inventory={inventory}
                    athletes={athletes}
                    steps={steps}
                    draft={draft}
                    reward={reward}
                    initialStep={0}
                    syncUrl={false}
                    onCancel={requestClose}
                  />
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

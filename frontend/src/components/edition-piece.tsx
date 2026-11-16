"use client";

import { useRef, useState } from "react";

/* --------------------------------------------------------------------------
   POL-FE-77 — one piece in the public digital edition: its approved text
   opens in place ("Read"), and the first open is counted as a click on the
   article. Text, never HTML: it renders as written, line breaks kept.
   -------------------------------------------------------------------------- */

export function EditionPiece({ text, editionId, assetId, record }: {
  text: string;
  editionId: string;
  assetId: string;
  record: (editionId: string, assetId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const counted = useRef(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (!counted.current) {
            counted.current = true;
            void record(editionId, assetId);
          }
        }}
        className="text-xs font-semibold text-next hover:underline"
      >
        {open ? "Close" : "Read"}
      </button>
      {open && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text">{text}</p>}
    </div>
  );
}

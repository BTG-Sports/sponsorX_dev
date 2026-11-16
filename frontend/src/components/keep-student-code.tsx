"use client";

import { useEffect } from "react";

import { STUDENT_CODE_KEY } from "./brief-request-drawer";

/* POL-FE-58 (app review B7) — /s/<code> keeps the student's code in this
   browser, so the request form fills it in even after the business signs up
   or signs in first. A per-browser convenience: without storage, the link's
   ?code= still carries it. */
export function KeepStudentCode({ code }: { code: string }) {
  useEffect(() => {
    try {
      window.localStorage.setItem(STUDENT_CODE_KEY, JSON.stringify({ code, at: Date.now() }));
    } catch {
      /* private window or blocked storage: the link still carries the code */
    }
  }, [code]);
  return null;
}

/* --------------------------------------------------------------------------
   City asset guard (P1-ART-09).

   The kit GLBs and the environment HDR are produced by a separate pipeline
   (scripts/city-kit) and may be absent on a checkout, on a preview deploy, or
   while the pipeline is being rebuilt. The landing page must never break
   because of that, so every optional asset goes through two layers:

   1. `useAssetAvailable(url)` — a cheap HEAD probe before the loader runs. A
      404 (or a network error) resolves to `missing`, the caller renders
      nothing for that asset, and one warning is logged per URL. This keeps
      the expected-missing case out of React's error path entirely (no
      "uncaught error" noise in the dev overlay).
   2. `AssetErrorBoundary` — belt and braces for a file that exists but fails
      to parse (corrupt GLB, unsupported HDR): the drei loaders throw through
      Suspense, the boundary swallows it, logs once, and renders null.

   Both are per-URL memoised at module level, so a re-mount does not re-probe.
   -------------------------------------------------------------------------- */

import { Component, useEffect, useReducer, type ReactNode } from "react";

type Status = "checking" | "ok" | "missing";

const probe = new Map<string, Status>();
const logged = new Set<string>();

/** Log a message once per key, whatever the environment. */
export function warnOnce(key: string, ...msg: unknown[]) {
  if (logged.has(key)) return;
  logged.add(key);
  console.warn(...msg);
}

/** Dev-only variant of `warnOnce` for chatty diagnostics. */
export function devWarnOnce(key: string, ...msg: unknown[]) {
  if (process.env.NODE_ENV === "production") return;
  warnOnce(key, ...msg);
}

/** HEAD-probes `url` once and reports whether it is worth handing to a loader. */
export function useAssetAvailable(url: string): Status {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (probe.has(url)) return;
    let live = true;
    fetch(url, { method: "HEAD" })
      .then((r) => {
        probe.set(url, r.ok ? "ok" : "missing");
      })
      .catch(() => {
        probe.set(url, "missing");
      })
      .finally(() => {
        if (probe.get(url) === "missing") {
          warnOnce(`asset:${url}`, `[city] ${url} is not available — rendering without it.`);
        }
        if (live) bump();
      });
    return () => {
      live = false;
    };
  }, [url]);

  return probe.get(url) ?? "checking";
}

interface BoundaryProps {
  /** Names the asset in the one-time warning. */
  label: string;
  /** Called once when a child throws, after the warning. */
  onFail?: () => void;
  children: ReactNode;
}

interface BoundaryState {
  failed: boolean;
}

/** Renders nothing (and warns once) if a child loader throws. Works inside the
 *  R3F canvas: error boundaries are a React feature, not a DOM one. */
export class AssetErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    warnOnce(`boundary:${this.props.label}`, `[city] ${this.props.label} failed to load — rendering without it.`, error);
    this.props.onFail?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

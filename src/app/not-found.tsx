import Link from "next/link";
import { ErrorPanel } from "@/components/states";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-md">
        <ErrorPanel
          title="This page doesn't exist"
          hint="The link may be old, or the screen hasn't been built yet."
          action={
            <Link
              href="/"
              className="mt-1 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
            >
              Back to SponsorX
            </Link>
          }
        />
      </div>
    </main>
  );
}

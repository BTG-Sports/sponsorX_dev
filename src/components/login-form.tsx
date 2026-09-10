"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MOCK_ACCOUNTS, resolveMockAccount } from "@/lib/mock-auth";
import { Logo } from "@/components/logo";

/* --------------------------------------------------------------------------
   Sponsor login form — mockup screen 2.

   Signs in against the mock account list in src/lib/mock-auth.ts. This is not
   authentication — there is no session and no server check. It exists so the
   build is walkable, and it demonstrates §9.2's role-aware routing: the
   destination comes from the account's role.

   Replaced by Clerk plus the requireActor() lookup in guide §04.
   -------------------------------------------------------------------------- */

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("sponsor@example.com");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function signIn(candidate: string) {
    const account = resolveMockAccount(candidate);
    if (!account) {
      setError("No mock account for that address — pick one below.");
      return;
    }
    setError(null);
    setPending(true);
    router.push(account.destination);
  }

  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        signIn(email);
      }}
      aria-label="Sign in"
    >
      <div className="flex justify-center">
        <Logo className="h-10" />
      </div>

      <h1 className="mt-8 text-center text-xl font-semibold tracking-tight">
        Welcome Back!
      </h1>
      <p className="mt-1.5 text-center text-[11px] text-muted">
        Sign in to your SponsorX account
      </p>

      {/* ------------------------------------------------------------ email */}
      <label
        htmlFor="email"
        className="mt-7 block text-[11px] font-medium text-muted"
      >
        Email Address
      </label>
      <input
        id="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setError(null);
        }}
        placeholder="sponsor@example.com"
        className="mt-1.5 w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-xs text-text placeholder:text-faint focus:border-primary focus:outline-none"
      />

      {/* --------------------------------------------------------- password */}
      <div className="mt-4 flex items-baseline justify-between">
        <label htmlFor="password" className="text-[11px] font-medium text-muted">
          Password
        </label>
        <span
          className="cursor-default text-[11px] font-medium text-primary-soft"
          title="Not wired — Clerk handles password reset"
        >
          Forgot Password?
        </span>
      </div>
      <div className="relative mt-1.5">
        <input
          id="password"
          type={reveal ? "text" : "password"}
          autoComplete="current-password"
          defaultValue="anything"
          className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 pr-10 text-xs text-text placeholder:text-faint focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setReveal((r) => !r)}
          aria-label={reveal ? "Hide password" : "Show password"}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-text"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="size-4"
            aria-hidden="true"
          >
            <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
            <circle cx="12" cy="12" r="2.6" />
            {!reveal && <path d="M4 20 20 4" />}
          </svg>
        </button>
      </div>

      {/* ----------------------------------------------------- remember me */}
      <label className="mt-4 flex w-fit cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          defaultChecked
          className="size-3.5 accent-[var(--sx-primary)]"
        />
        <span className="text-[11px] text-muted">Remember Me</span>
      </label>

      {error && (
        <p className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
          {error}
        </p>
      )}

      {/* -------------------------------------------------------- sign in */}
      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-lg bg-primary py-2.5 text-xs font-medium text-white transition-colors hover:bg-primary-soft disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign In"}
      </button>

      <p className="mt-5 text-center text-[11px] text-muted">
        Don&rsquo;t have an account?{" "}
        <Link
          href="/packages"
          className="font-medium text-primary-soft hover:underline"
        >
          Sign Up
        </Link>
      </p>

      {/* ------------------------------------------------- mock accounts */}
      <div className="mt-7 border-t border-line pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-warn">
          Mock accounts · any password
        </p>
        <ul className="mt-2 space-y-1">
          {MOCK_ACCOUNTS.map((a) => (
            <li key={a.email}>
              <button
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  signIn(a.email);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                  {a.email}
                </span>
                <span className="shrink-0 text-[9px] font-medium text-faint">
                  {a.role}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 px-2 text-[10px] leading-relaxed text-faint">
          Role-aware routing (§9.2): the destination comes from the role, not
          from this page.
        </p>
      </div>
    </form>
  );
}

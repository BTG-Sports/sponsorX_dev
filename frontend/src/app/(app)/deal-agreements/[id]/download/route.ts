import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S4-FE-07 / -08 / -09 — the deal agreement's PDF, downloadable at any time
   by both sides and by BTG (owner, 2026-11-17).

   The API serves it at /api/v1/deal-agreements/:id/download behind the
   caller's Clerk token, which a plain link in the browser cannot carry. So
   this handler asks for it as the signed-in person and passes the file on.
   It adds no authority: the API decides who may read the agreement, and
   anyone else gets its refusal as a plain 404 here.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const plain = (text: string, status: number) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let res: Response;
  try {
    res = await apiFetch(`/deal-agreements/${encodeURIComponent(id)}/download`);
  } catch {
    return plain("Sign in to download this agreement.", 401);
  }
  if (res.status === 403 || res.status === 404) return plain("This agreement can't be found.", 404);
  if (!res.ok || !res.body) return plain("The agreement couldn't be downloaded just now. Try again in a minute.", 502);
  return new Response(res.body, {
    status: 200,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/pdf",
      "content-disposition": res.headers.get("content-disposition") ?? 'attachment; filename="deal-agreement.pdf"',
      "cache-control": "private, no-store",
    },
  });
}

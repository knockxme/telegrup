import { NextResponse } from "next/server";
import { authorize } from "@/lib/apiKeyAuth";
import { db } from "@/lib/db";
import { serializeFile } from "@/lib/serialize";

// Response is per-session private data (varies by cookie/API key), but that's
// invisible to a CDN's default cache-key (URL only) — without this header a
// proxy in front (e.g. Cloudflare) can serve one session's cached list to
// another, or an older cached snapshot at all, both indistinguishable from a
// file randomly "disappearing" client-side.
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  const auth = await authorize(req, "read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });

  const files = await db.file.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ files: files.map(serializeFile) }, { headers: NO_STORE });
}

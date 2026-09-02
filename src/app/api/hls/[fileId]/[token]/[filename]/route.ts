import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { buildMasterPlaylist, ensureSegmentGenerated, parseSegmentFilename } from "@/lib/hls";
import { authorizeHlsRequest } from "@/lib/hlsAuth";

export const runtime = "nodejs";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

// Public endpoint — gated by the per-file share token (+ optional Origin/Referer
// host allowlist) instead of the site's login cookie, since this is meant to be
// embedded on other sites whose players won't carry that cookie.
export async function GET(req: Request, { params }: { params: Promise<{ fileId: string; token: string; filename: string }> }) {
  const { fileId, token, filename } = await params;

  const auth = await authorizeHlsRequest(fileId, token, req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: CORS_HEADERS });

  if (filename === "master.m3u8") {
    // Pure arithmetic from the stored duration — no Telegram/ffmpeg work, so
    // this is instant regardless of file size.
    const playlist = await buildMasterPlaylist(fileId).catch((err) => {
      console.error(`Master playlist build failed for ${fileId}:`, err);
      return null;
    });
    if (playlist === null) {
      return NextResponse.json({ error: "Failed to build playlist" }, { status: 500, headers: CORS_HEADERS });
    }
    return new Response(playlist, {
      headers: { ...CORS_HEADERS, "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "no-store" },
    });
  }

  const segIndex = parseSegmentFilename(filename);
  if (segIndex !== null) {
    const segPath = await ensureSegmentGenerated(fileId, segIndex).catch((err) => {
      console.error(`Segment ${segIndex} generation failed for ${fileId}:`, err);
      return null;
    });
    if (!segPath) {
      return NextResponse.json({ error: "Failed to generate segment" }, { status: 500, headers: CORS_HEADERS });
    }
    const body = await readFile(segPath);
    return new Response(body, {
      headers: { ...CORS_HEADERS, "Content-Type": "video/mp2t", "Cache-Control": "private, max-age=3600" },
    });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
}

import { NextResponse } from "next/server";
import { authorizeHlsRequest } from "@/lib/hlsAuth";
import { safeContentType } from "@/lib/safeContentType";
import { FileNotFoundError, FileNotReadyError, openFileRangeStream, RangeNotSatisfiableError } from "@/lib/telegram/stream";

export const runtime = "nodejs";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

/** Public, range-streamed raw file access — same share token (and optional
 * Origin/Referer host-lock) as the HLS link, gated the same way, but serves
 * the original file directly instead of remuxed HLS segments. Useful for
 * direct-download / non-video files, or players that don't need HLS. */
export async function GET(req: Request, { params }: { params: Promise<{ fileId: string; token: string }> }) {
  const { fileId, token } = await params;

  const auth = await authorizeHlsRequest(fileId, token, req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: CORS_HEADERS });

  try {
    const result = await openFileRangeStream(fileId, req.headers.get("range"));
    const headers = new Headers({
      ...CORS_HEADERS,
      "Content-Type": safeContentType(result.contentType),
      "Content-Disposition": `inline; filename="${encodeURIComponent(result.filename)}"`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(result.end - result.start + 1),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    });
    if (result.status === 206) {
      headers.set("Content-Range", `bytes ${result.start}-${result.end}/${result.totalSize}`);
    }
    return new Response(result.body, { status: result.status, headers });
  } catch (err) {
    if (err instanceof RangeNotSatisfiableError) {
      return new Response(null, {
        status: 416,
        headers: { ...CORS_HEADERS, "Content-Range": `bytes */${err.totalSize}` },
      });
    }
    if (err instanceof FileNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
    if (err instanceof FileNotReadyError) {
      return NextResponse.json({ error: "File is not ready" }, { status: 409, headers: CORS_HEADERS });
    }
    console.error(`Public stream error for file ${fileId}:`, err);
    return NextResponse.json({ error: "Stream failed" }, { status: 500, headers: CORS_HEADERS });
  }
}

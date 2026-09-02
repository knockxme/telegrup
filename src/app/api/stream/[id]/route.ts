import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { safeContentType } from "@/lib/safeContentType";
import { FileNotFoundError, FileNotReadyError, openFileRangeStream, RangeNotSatisfiableError } from "@/lib/telegram/stream";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rangeHeader = req.headers.get("range");

  try {
    const result = await openFileRangeStream(id, rangeHeader);
    const headers = new Headers({
      "Content-Type": safeContentType(result.contentType),
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
        headers: { "Content-Range": `bytes */${err.totalSize}` },
      });
    }
    if (err instanceof FileNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (err instanceof FileNotReadyError) return NextResponse.json({ error: "File is not ready" }, { status: 409 });
    console.error(`Stream error for file ${id}:`, err);
    return NextResponse.json({ error: "Stream failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { serveHeaderRegion } from "@/lib/hlsHeaderCache";
import { isValidInternalSecret } from "@/lib/internalAuth";
import {
  FileNotFoundError,
  FileNotReadyError,
  getFileStreamMeta,
  openFileRangeStream,
  parseRange,
  RangeNotSatisfiableError,
} from "@/lib/telegram/stream";

export const runtime = "nodejs";

/** Internal-only — used exclusively by our own ffmpeg subprocesses (HLS segment
 * generation points its -i at this URL so ffmpeg can do its own byte-range
 * seeking). Never exposed to browsers or users: gated by a process-local secret
 * generated at startup, not a user-facing share token. */
export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const key = new URL(req.url).searchParams.get("key");
  if (!isValidInternalSecret(key)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rangeHeader = req.headers.get("range");

  try {
    const meta = await getFileStreamMeta(fileId);
    const { start, end: requestedEnd } = parseRange(rangeHeader, meta.totalSize);

    const headerResponse = await serveHeaderRegion(fileId, start, requestedEnd, meta.mimeType, meta.totalSize);
    if (headerResponse) return headerResponse;

    const result = await openFileRangeStream(fileId, rangeHeader);
    const headers = new Headers({
      "Content-Type": result.contentType,
      "Accept-Ranges": "bytes",
      "Content-Length": String(result.end - result.start + 1),
    });
    if (result.status === 206) {
      headers.set("Content-Range", `bytes ${result.start}-${result.end}/${result.totalSize}`);
    }
    return new Response(result.body, { status: result.status, headers });
  } catch (err) {
    if (err instanceof RangeNotSatisfiableError) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${err.totalSize}` } });
    }
    if (err instanceof FileNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (err instanceof FileNotReadyError) return NextResponse.json({ error: "File is not ready" }, { status: 409 });
    console.error(`Internal stream error for file ${fileId}:`, err);
    return NextResponse.json({ error: "Stream failed" }, { status: 500 });
  }
}

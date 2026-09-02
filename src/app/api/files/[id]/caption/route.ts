import { NextResponse } from "next/server";
import { authorize } from "@/lib/apiKeyAuth";
import { db } from "@/lib/db";
import { saveCaption } from "@/lib/caption";

// WebVTT files are plain text and small — this cap just stops an oversized/wrong upload.
const MAX_CAPTION_BYTES = 2 * 1024 * 1024;

/** Attaches a WebVTT caption file to a video (raw .vtt text as the body). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "upload");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const file = await db.file.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contentLength = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > MAX_CAPTION_BYTES) {
    return NextResponse.json({ error: `Caption exceeds maximum size of ${MAX_CAPTION_BYTES} bytes` }, { status: 413 });
  }

  const vttText = await req.text();
  if (vttText.length === 0) {
    return NextResponse.json({ error: "Request body is empty" }, { status: 400 });
  }
  if (vttText.length > MAX_CAPTION_BYTES) {
    return NextResponse.json({ error: `Caption exceeds maximum size of ${MAX_CAPTION_BYTES} bytes` }, { status: 413 });
  }
  if (!vttText.trimStart().startsWith("WEBVTT")) {
    return NextResponse.json({ error: "File must be a WebVTT (.vtt) caption file" }, { status: 400 });
  }

  const captionPath = await saveCaption(id, vttText);
  return NextResponse.json({ captionPath });
}

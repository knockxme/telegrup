import { NextResponse } from "next/server";
import { authorize } from "@/lib/apiKeyAuth";
import { db } from "@/lib/db";
import { saveManualThumbnail } from "@/lib/thumbnail";

// Thumbnails are small JPEGs — req.arrayBuffer() below buffers the whole body in
// memory, so without a cap here anyone with an "upload" role key (or a buggy
// client) could PUT a multi-GB body and pressure the process into OOM. 15MB is
// generous for a captured video frame.
const MAX_THUMBNAIL_BYTES = 15 * 1024 * 1024;

/** Replaces a file's thumbnail with a browser-captured frame (raw image bytes as the body). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "upload");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const file = await db.file.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contentLength = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > MAX_THUMBNAIL_BYTES) {
    return NextResponse.json({ error: `Thumbnail exceeds maximum size of ${MAX_THUMBNAIL_BYTES} bytes` }, { status: 413 });
  }

  const arrayBuffer = await req.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    return NextResponse.json({ error: "Request body is empty" }, { status: 400 });
  }
  if (arrayBuffer.byteLength > MAX_THUMBNAIL_BYTES) {
    return NextResponse.json({ error: `Thumbnail exceeds maximum size of ${MAX_THUMBNAIL_BYTES} bytes` }, { status: 413 });
  }

  const thumbnailPath = await saveManualThumbnail(id, Buffer.from(arrayBuffer));
  return NextResponse.json({ thumbnailPath });
}

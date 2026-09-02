import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { NextRequest, NextResponse } from "next/server";
import { authorize, roleAllows } from "@/lib/apiKeyAuth";
import { db } from "@/lib/db";
import { safeIntEnv } from "@/lib/env";
import { serializeFile } from "@/lib/serialize";
import { processUpload } from "@/lib/telegram/upload";
import type { File as DbFile, FileKind } from "@/generated/prisma/client";

// Route Handlers stream the request body straight through to a Node fs write
// stream below — nothing here buffers the whole upload in memory, which is
// what makes multi-GB uploads viable.
export const runtime = "nodejs";

// Hard ceiling on the temp file staged to local disk before it's split and sent
// to Telegram. Without this, an "upload" role key (or a misbehaving client) could
// stream an arbitrarily large body and exhaust the VPS's disk before any
// per-account size logic ever runs. Default 10GB — comfortably above the largest
// single-account cap (~4GB Premium) since one upload can still legitimately be
// close to that; raise via MAX_UPLOAD_BYTES if your disk has more headroom.
const MAX_UPLOAD_BYTES = safeIntEnv("MAX_UPLOAD_BYTES", 10 * 1024 ** 3);

class MaxUploadSizeExceededError extends Error {
  constructor() {
    super("Upload exceeds maximum allowed size");
  }
}

/** Aborts the pipeline the moment the running byte count crosses the cap —
 * catches oversized uploads even when Content-Length is absent or lied about
 * (e.g. chunked transfer encoding), not just via the header pre-check below. */
function createSizeLimiter(maxBytes: number): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, callback) {
      total += chunk.length;
      if (total > maxBytes) {
        callback(new MaxUploadSizeExceededError());
        return;
      }
      callback(null, chunk);
    },
  });
}

function uploadTmpDir(): string {
  return process.env.UPLOAD_TMP_DIR ?? "./tmp/uploads";
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "upload");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");
  const filename = url.searchParams.get("filename");
  const mimeType = url.searchParams.get("mimeType") ?? "application/octet-stream";
  const folderId = url.searchParams.get("folderId") || null;
  const wantsPublic = ["1", "true"].includes(url.searchParams.get("public") ?? "");

  if (!accountId || !filename) {
    return NextResponse.json({ error: "accountId and filename query params are required" }, { status: 400 });
  }
  if (wantsPublic && !roleAllows(auth.role, "full")) {
    return NextResponse.json({ error: "public=1 requires a 'full' role API key (or the site login)" }, { status: 403 });
  }
  if (!req.body) {
    return NextResponse.json({ error: "Request body is empty" }, { status: 400 });
  }
  const contentLength = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `File exceeds maximum upload size of ${MAX_UPLOAD_BYTES} bytes` }, { status: 413 });
  }

  const account = await db.telegramAccount.findUnique({ where: { id: accountId } });
  if (!account) return NextResponse.json({ error: "Unknown accountId" }, { status: 404 });

  const dir = uploadTmpDir();
  await mkdir(dir, { recursive: true });
  const tempFilePath = path.join(dir, `${randomUUID()}-${path.basename(filename)}`);

  try {
    await pipeline(
      Readable.fromWeb(req.body as NodeWebReadableStream<Uint8Array>),
      createSizeLimiter(MAX_UPLOAD_BYTES),
      createWriteStream(tempFilePath)
    );
  } catch (err) {
    await unlink(tempFilePath).catch(() => {});
    if (err instanceof MaxUploadSizeExceededError) {
      return NextResponse.json({ error: `File exceeds maximum upload size of ${MAX_UPLOAD_BYTES} bytes` }, { status: 413 });
    }
    console.error(`Failed to receive upload "${filename}":`, err);
    return NextResponse.json({ error: "Failed to receive upload" }, { status: 500 });
  }

  const { size: sizeBytes } = await stat(tempFilePath);
  const kind: FileKind = mimeType.startsWith("video/") ? "video" : "other";

  let resolveCreated!: (file: DbFile) => void;
  const created = new Promise<DbFile>((resolve) => {
    resolveCreated = resolve;
  });

  processUpload({
    accountId,
    tempFilePath,
    filename,
    mimeType,
    sizeBytes,
    kind,
    folderId,
    makePublic: wantsPublic,
    onCreated: resolveCreated,
  }).catch((err) => {
    console.error(`Background upload failed for "${filename}":`, err);
  });

  // The File row is created synchronously before the (potentially long) Telegram
  // send starts, so we can hand back its id right away — including publicUrl/hlsUrl
  // if `public=1` was requested — and let the send continue in the background.
  // thumbnailUrl stays null until processing finishes; poll GET /api/files/:id.
  const file = await created;
  return NextResponse.json({ fileId: file.id, status: file.status, file: serializeFile(file) }, { status: 202 });
}

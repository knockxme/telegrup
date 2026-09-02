import { unlink } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/apiKeyAuth";
import { db } from "@/lib/db";
import { evictHlsCache } from "@/lib/hls";
import { isNotFoundError } from "@/lib/prismaErrors";
import { serializeFile } from "@/lib/serialize";
import { thumbnailAbsPathFor } from "@/lib/thumbnail";
import { captionAbsPathFor } from "@/lib/caption";
import { getConnectedClient } from "@/lib/telegram/client";
import { parseStorageChannel } from "@/lib/telegram/peer";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const file = await db.file.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ file: serializeFile(file) });
}

const patchSchema = z.object({
  filename: z.string().min(1).max(255).optional(),
  folderId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "upload");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  if (parsed.data.filename === undefined && parsed.data.folderId === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const file = await db.file.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ file: serializeFile(file) });
  } catch (err) {
    if (isNotFoundError(err)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Also covers an invalid folderId (FK violation) — either way, the caller sent something bad.
    return NextResponse.json({ error: "Invalid filename or folderId" }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "full");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const file = await db.file.findUnique({ where: { id }, include: { parts: true, account: true } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (file.parts.length > 0 && file.account.storageChannelId) {
    try {
      const peer = parseStorageChannel(file.account.storageChannelId);
      const client = await getConnectedClient(file.accountId);
      await client.deleteMessages(
        peer,
        file.parts.map((p: (typeof file.parts)[number]) => Number(p.telegramMessageId)),
        { revoke: true }
      );
    } catch (err) {
      console.error(`Failed to delete Telegram messages for file ${id}:`, err);
    }
  }

  if (file.thumbnailPath) {
    await unlink(thumbnailAbsPathFor(file.id)).catch(() => {});
  }
  if (file.captionPath) {
    await unlink(captionAbsPathFor(file.id)).catch(() => {});
  }
  await evictHlsCache(file.id);

  await db.file.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

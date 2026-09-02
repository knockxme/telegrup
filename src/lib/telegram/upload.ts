import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { CustomFile } from "telegram/client/uploads";
import { asyncPool } from "@/lib/asyncPool";
import { db } from "@/lib/db";
import { safeIntEnv } from "@/lib/env";
import { autoGenerateThumbnail, probeDurationSeconds, saveManualThumbnail } from "@/lib/thumbnail";
import { generateShareToken } from "@/lib/hlsAuth";
import { getConnectedClient } from "@/lib/telegram/client";
import { maxPartSizeBytes, planParts } from "@/lib/telegram/limits";
import { parseStorageChannel } from "@/lib/telegram/peer";
import { clearUploadedBytes, setUploadedBytes } from "@/lib/telegram/uploadProgress";
import type { File, FileKind } from "@/generated/prisma/client";

const PART_UPLOAD_CONCURRENCY = safeIntEnv("PART_UPLOAD_CONCURRENCY", 3);
const WORKERS_PER_PART = safeIntEnv("UPLOAD_WORKERS_PER_PART", 8);

export interface ProcessUploadParams {
  accountId: string;
  tempFilePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  kind: FileKind;
  folderId?: string | null;
  /** Generates the file's HLS/public share token immediately at creation, instead
   * of requiring a separate POST /api/files/:id/share call once it's ready. */
  makePublic?: boolean;
  manualThumbnail?: Buffer;
  /** Fired the moment the File row exists, before the (potentially long) Telegram send. */
  onCreated?: (file: File) => void;
}

function sliceFile(srcPath: string, destPath: string, offset: number, size: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const read = createReadStream(srcPath, { start: offset, end: offset + size - 1 });
    const write = createWriteStream(destPath);
    read.on("error", reject);
    write.on("error", reject);
    write.on("finish", resolve);
    read.pipe(write);
  });
}

export async function processUpload(params: ProcessUploadParams) {
  const account = await db.telegramAccount.findUniqueOrThrow({ where: { id: params.accountId } });
  if (account.status !== "active") {
    throw new Error(`Telegram account "${account.label}" is not active (status: ${account.status})`);
  }
  if (!account.storageChannelId) {
    throw new Error(`Telegram account "${account.label}" has no storage channel yet — re-open Accounts to retry setup`);
  }

  const file = await db.file.create({
    data: {
      filename: params.filename,
      mimeType: params.mimeType,
      sizeBytes: BigInt(params.sizeBytes),
      kind: params.kind,
      status: "processing",
      accountId: account.id,
      folderId: params.folderId ?? null,
      shareToken: params.makePublic ? generateShareToken() : null,
    },
  });
  params.onCreated?.(file);

  const partsDir = path.join(path.dirname(params.tempFilePath), `${file.id}-parts`);

  try {
    if (params.manualThumbnail) {
      await saveManualThumbnail(file.id, params.manualThumbnail);
    } else if (params.kind === "video") {
      const durationSeconds = await probeDurationSeconds(params.tempFilePath);
      if (durationSeconds) await db.file.update({ where: { id: file.id }, data: { durationSeconds } });
      await autoGenerateThumbnail(params.tempFilePath, file.id, durationSeconds);
    }

    const peer = parseStorageChannel(account.storageChannelId);
    const client = await getConnectedClient(account.id);
    const maxPart = maxPartSizeBytes(account.isPremium);
    const parts = planParts(params.sizeBytes, maxPart);
    if (parts.length > 1) await mkdir(partsDir, { recursive: true });

    const sentBytesByPart = new Map<number, number>();
    function reportPartProgress(partIndex: number, bytes: number) {
      sentBytesByPart.set(partIndex, bytes);
      let total = 0;
      for (const b of sentBytesByPart.values()) total += b;
      setUploadedBytes(file.id, total);
    }

    await asyncPool(PART_UPLOAD_CONCURRENCY, parts, async (part) => {
      const isSinglePart = parts.length === 1;
      const partPath = isSinglePart ? params.tempFilePath : path.join(partsDir, `part-${part.index}`);
      const partName = isSinglePart ? params.filename : `${params.filename}.part${String(part.index).padStart(3, "0")}`;

      if (!isSinglePart) {
        await sliceFile(params.tempFilePath, partPath, part.byteOffsetStart, part.size);
      }

      try {
        const customFile = new CustomFile(partName, part.size, partPath);
        const message = await client.sendFile(peer, {
          file: customFile,
          workers: WORKERS_PER_PART,
          forceDocument: true,
          progressCallback: (fraction: number) => reportPartProgress(part.index, Math.round(fraction * part.size)),
        });
        reportPartProgress(part.index, part.size);

        await db.filePart.create({
          data: {
            fileId: file.id,
            partIndex: part.index,
            telegramMessageId: BigInt(message.id),
            partSizeBytes: BigInt(part.size),
            byteOffsetStart: BigInt(part.byteOffsetStart),
          },
        });
      } finally {
        if (!isSinglePart) await unlink(partPath).catch(() => {});
      }
    });

    return await db.file.update({ where: { id: file.id }, data: { status: "ready" }, include: { parts: true } });
  } catch (err) {
    await cleanupFailedUpload(file.id, account.storageChannelId, account.id);
    throw err;
  } finally {
    clearUploadedBytes(file.id);
    await rm(partsDir, { recursive: true, force: true }).catch(() => {});
    await unlink(params.tempFilePath).catch(() => {});
  }
}

async function cleanupFailedUpload(fileId: string, storageChannelId: string, accountId: string) {
  const uploadedParts = await db.filePart.findMany({ where: { fileId } });
  if (uploadedParts.length > 0) {
    try {
      const peer = parseStorageChannel(storageChannelId);
      const client = await getConnectedClient(accountId);
      await client.deleteMessages(
        peer,
        uploadedParts.map((p: (typeof uploadedParts)[number]) => Number(p.telegramMessageId)),
        { revoke: true }
      );
    } catch {
      // Best-effort — an orphaned Telegram message is a minor cost next to losing the failure signal.
    }
  }
  await db.file.update({ where: { id: fileId }, data: { status: "failed" } }).catch(() => {});
}

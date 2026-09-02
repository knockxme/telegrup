import bigInt from "big-integer";
import { Api } from "telegram";
import { db } from "@/lib/db";
import { getConnectedClient } from "@/lib/telegram/client";
import { parseStorageChannel } from "@/lib/telegram/peer";

export interface RangeStreamResult {
  status: 200 | 206;
  start: number;
  end: number; // inclusive
  totalSize: number;
  contentType: string;
  filename: string;
  body: ReadableStream<Uint8Array>;
}

export class RangeNotSatisfiableError extends Error {
  constructor(public readonly totalSize: number) {
    super("Requested range not satisfiable");
  }
}

export class FileNotFoundError extends Error {
  constructor() {
    super("File not found");
  }
}

export class FileNotReadyError extends Error {
  constructor(public readonly fileStatus: string) {
    super(`File is not ready (status: ${fileStatus})`);
  }
}

/**
 * Streams an arbitrary byte range of a stored file straight from Telegram,
 * spanning multiple split parts if the range crosses a part boundary.
 * Never downloads more than what's requested — this is what makes seeking
 * to the end of a large video instant instead of waiting on a full download.
 */
async function loadReadyFile(fileId: string) {
  const file = await db.file.findUnique({
    where: { id: fileId },
    include: { parts: { orderBy: { partIndex: "asc" } }, account: true },
  });
  if (!file) throw new FileNotFoundError();
  if (file.status !== "ready") throw new FileNotReadyError(file.status);
  if (!file.account.storageChannelId) throw new Error("Account is missing its storage channel");
  return file as typeof file & { account: typeof file.account & { storageChannelId: string } };
}

/** Cheap metadata lookup (no Telegram calls) — used to decide whether a
 * request can be served from the local header cache before touching
 * Telegram at all. */
export async function getFileStreamMeta(
  fileId: string
): Promise<{ totalSize: number; mimeType: string; filename: string }> {
  const file = await loadReadyFile(fileId);
  return { totalSize: Number(file.sizeBytes), mimeType: file.mimeType, filename: file.filename };
}

export async function openFileRangeStream(fileId: string, rangeHeader: string | null): Promise<RangeStreamResult> {
  const file = await loadReadyFile(fileId);

  const totalSize = Number(file.sizeBytes);
  const { start, end, status } = parseRange(rangeHeader, totalSize);

  const peer = parseStorageChannel(file.account.storageChannelId);
  const client = await getConnectedClient(file.accountId);

  const overlappingParts = file.parts.filter((p: (typeof file.parts)[number]) => {
    const partStart = Number(p.byteOffsetStart);
    const partEnd = partStart + Number(p.partSizeBytes) - 1;
    return partStart <= end && partEnd >= start;
  });

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const part of overlappingParts) {
          const partStart = Number(part.byteOffsetStart);
          const partSize = Number(part.partSizeBytes);
          const partEnd = partStart + partSize - 1;

          const localStart = Math.max(start, partStart) - partStart;
          const localEnd = Math.min(end, partEnd) - partStart; // inclusive
          const length = localEnd - localStart + 1;

          const location = await resolvePartLocation(client, peer, Number(part.telegramMessageId));

          // Enforce `length` ourselves rather than trusting iterDownload's own
          // `limit` to stop the generator — relying solely on the consumer
          // disconnecting (which normally aborts the fetch) turned into an
          // unbounded download the moment a caller's consumption pattern
          // didn't propagate that cancellation (found via the HLS header
          // cache: it keeps draining after enqueue fails, and without this
          // guard that meant streaming the rest of the file from Telegram).
          let emitted = 0;
          for await (const chunk of client.iterDownload({
            file: location,
            offset: bigInt(localStart),
            limit: length,
            requestSize: 1024 * 1024,
          })) {
            if (emitted >= length) break;
            const remaining = length - emitted;
            const piece = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
            controller.enqueue(new Uint8Array(piece));
            emitted += piece.length;
            if (emitted >= length) break;
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return { status, start, end, totalSize, contentType: file.mimeType, filename: file.filename, body };
}

export async function resolvePartLocation(
  client: Awaited<ReturnType<typeof getConnectedClient>>,
  peer: ReturnType<typeof parseStorageChannel>,
  telegramMessageId: number
): Promise<Api.InputDocumentFileLocation> {
  const messages = await client.getMessages(peer, { ids: [telegramMessageId] });
  const message = messages[0];
  const media = message?.media;
  if (!(media instanceof Api.MessageMediaDocument) || !(media.document instanceof Api.Document)) {
    throw new Error(`Telegram message ${telegramMessageId} has no downloadable document`);
  }
  const document = media.document;
  // Fetching the message fresh each call also refreshes its file_reference,
  // which Telegram expires roughly hourly — avoids stale-reference download errors.
  return new Api.InputDocumentFileLocation({
    id: document.id,
    accessHash: document.accessHash,
    fileReference: document.fileReference,
    thumbSize: "",
  });
}

export function parseRange(rangeHeader: string | null, totalSize: number): { start: number; end: number; status: 200 | 206 } {
  if (!rangeHeader) return { start: 0, end: totalSize - 1, status: 200 };

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return { start: 0, end: totalSize - 1, status: 200 };

  const [, startStr, endStr] = match;
  let start: number;
  let end: number;

  if (startStr === "" && endStr !== "") {
    // Suffix range: last N bytes.
    const suffixLength = Number(endStr);
    start = Math.max(totalSize - suffixLength, 0);
    end = totalSize - 1;
  } else {
    start = startStr === "" ? 0 : Number(startStr);
    end = endStr === "" ? totalSize - 1 : Number(endStr);
  }

  end = Math.min(end, totalSize - 1);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start < 0) {
    throw new RangeNotSatisfiableError(totalSize);
  }
  return { start, end, status: 206 };
}

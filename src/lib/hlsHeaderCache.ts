import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeIntEnv } from "@/lib/env";
import { dirFor } from "@/lib/hls";
import { openFileRangeStream } from "@/lib/telegram/stream";

// A fresh ffmpeg process is spawned per HLS segment (no state carried across
// segments), so for the mov/mp4 demuxer it must re-read the whole moov atom
// on every single segment just to translate -ss into an accurate byte
// position — even though moov is static for the file's lifetime. For a
// multi-MB moov (long/high-bitrate videos), that roughly doubles the
// Telegram traffic needed per segment. Caching that header region on local
// disk after the first fetch turns it into a one-time cost per file.
//
// ffmpeg always probes with an open-ended "Range: bytes=0-" (verified
// empirically), so we only need to handle start === 0 here — anything else
// falls through to the normal passthrough, unaffected.
export const HEADER_CACHE_BYTES = safeIntEnv("HLS_HEADER_CACHE_BYTES", 4 * 1024 * 1024);

function headerPath(fileId: string): string {
  return path.join(dirFor(fileId), "header.bin");
}

/** Returns a ready-to-send Response for a request that starts at byte 0 and
 * falls (at least partly) within the cached header window, or null if the
 * caller should fall through to the normal Telegram passthrough. On a cache
 * miss this still streams live from Telegram — the client gets bytes exactly
 * as fast as the old passthrough did — but tees them to disk in the
 * background so the *next* file's-header request is instant. */
export async function serveHeaderRegion(
  fileId: string,
  start: number,
  end: number,
  mimeType: string,
  totalSize: number
): Promise<Response | null> {
  if (start !== 0 || start >= HEADER_CACHE_BYTES) return null;
  const cappedEnd = Math.min(end, HEADER_CACHE_BYTES - 1);

  const hp = headerPath(fileId);
  const existing = await readFile(hp).catch(() => null);
  if (existing && existing.length > cappedEnd) {
    const body = existing.subarray(0, cappedEnd + 1);
    return new Response(new Uint8Array(body), {
      status: 206,
      headers: {
        "Content-Type": mimeType,
        "Accept-Ranges": "bytes",
        "Content-Length": String(body.length),
        "Content-Range": `bytes 0-${cappedEnd}/${totalSize}`,
      },
    });
  }

  const result = await openFileRangeStream(fileId, `bytes=0-${cappedEnd}`);
  const chunks: Uint8Array[] = [];
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let clientGone = false;
      try {
        for await (const chunk of result.body as unknown as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
          // Keep draining Telegram to completion for the cache even if the
          // client (ffmpeg) disconnects early once it has what it needs —
          // otherwise the cache would rarely finish filling in practice.
          // Safe to do unconditionally now that openFileRangeStream enforces
          // its own byte limit instead of relying on us to stop pulling.
          if (!clientGone) {
            try {
              controller.enqueue(chunk);
            } catch {
              clientGone = true;
            }
          }
        }
        if (!clientGone) controller.close();
        void persistHeader(hp, Buffer.concat(chunks));
      } catch (err) {
        if (!clientGone) controller.error(err);
      }
    },
  });

  return new Response(body, {
    status: 206,
    headers: {
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
      "Content-Length": String(cappedEnd + 1),
      "Content-Range": `bytes 0-${cappedEnd}/${totalSize}`,
    },
  });
}

async function persistHeader(hp: string, buf: Buffer): Promise<void> {
  const tmpPath = `${hp}.${process.pid}.tmp`;
  try {
    await mkdir(path.dirname(hp), { recursive: true });
    await writeFile(tmpPath, buf);
    await rename(tmpPath, hp);
  } catch {
    await unlink(tmpPath).catch(() => {});
  }
}

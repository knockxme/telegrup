import { execFile } from "node:child_process";
import { mkdir, readdir, rename, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { db } from "@/lib/db";
import { safeIntEnv } from "@/lib/env";
import { internalStreamSecret } from "@/lib/internalAuth";

const execFileAsync = promisify(execFile);

const CACHE_DIR = process.env.HLS_CACHE_DIR ?? "./tmp/hls";
const MAX_CACHE_BYTES = safeIntEnv("HLS_CACHE_MAX_BYTES", 5 * 1024 ** 3); // 5GB default
const IDLE_TTL_MS = safeIntEnv("HLS_CACHE_TTL_MS", 30 * 60 * 1000); // 30 min
const SEGMENT_SECONDS = safeIntEnv("HLS_SEGMENT_SECONDS", 6);
const MAX_CONCURRENT_JOBS = safeIntEnv("HLS_MAX_CONCURRENT_JOBS", 2);
const SEGMENT_TIMEOUT_MS = safeIntEnv("HLS_SEGMENT_TIMEOUT_MS", 60 * 1000);
const INTERNAL_APP_URL = process.env.INTERNAL_APP_URL ?? "http://127.0.0.1:3000";

// Each segment is generated independently on first request — ffmpeg seeks
// straight to the needed byte range against our own range-streaming endpoint
// (verified: it does real HTTP Range seeking, not a sequential read from byte
// 0) instead of downloading the whole source file up front. Per-request cost
// is now bounded by segment length, not file length, regardless of whether
// the file is 35MB or 4GB — which is also what keeps a burst of concurrent
// viewers on different large files from piling up unboundedly.

class Semaphore {
  private available: number;
  private waiters: Array<() => void> = [];

  constructor(count: number) {
    this.available = count;
  }

  async acquire(): Promise<() => void> {
    if (this.available <= 0) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.available--;
    return () => {
      this.available++;
      const next = this.waiters.shift();
      if (next) next();
    };
  }
}

const jobSlots = new Semaphore(MAX_CONCURRENT_JOBS);

interface ProbeResult {
  videoCodec: string | null;
  audioCodec: string | null;
}

// One ffprobe per file, cached for the process lifetime (source codec never
// changes) — lets segment generation skip re-encoding for the common case of
// an already h264/aac source, which is a stream copy instead of a real-time
// x264 encode.
const probeCache = new Map<string, Promise<ProbeResult>>();

async function probeCodecs(fileId: string, sourceUrl: string): Promise<ProbeResult> {
  const cached = probeCache.get(fileId);
  if (cached) return cached;

  // probesize/analyzeduration cap how much of the source ffprobe reads before
  // giving up — without a cap it can end up scanning toward the end of the
  // file hunting for stream info (e.g. a moov atom that isn't at the front),
  // which over the Telegram-backed range endpoint is minutes, not seconds.
  // A capped, failed probe just falls through to the safe re-encode path.
  const promise = execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-probesize",
      "5000000",
      "-analyzeduration",
      "5000000",
      "-show_entries",
      "stream=codec_type,codec_name",
      "-of",
      "csv=p=0",
      sourceUrl,
    ],
    { timeout: 15_000, killSignal: "SIGKILL" }
  )
    .then(({ stdout }) => {
      let videoCodec: string | null = null;
      let audioCodec: string | null = null;
      for (const line of stdout.trim().split("\n")) {
        const [type, codec] = line.split(",");
        if (type === "video" && !videoCodec) videoCodec = codec ?? null;
        if (type === "audio" && !audioCodec) audioCodec = codec ?? null;
      }
      return { videoCodec, audioCodec };
    })
    .catch(() => ({ videoCodec: null, audioCodec: null }));

  probeCache.set(fileId, promise);
  return promise;
}

interface CacheEntry {
  fileId: string;
  lastAccess: number;
  bytes: number;
}

// In-memory index of what's on disk — rebuilt from nothing on process start
// (the on-disk dirs from a prior run get swept by the first eviction pass since
// they're absent from this map and therefore look "never accessed").
const entries = new Map<string, CacheEntry>();
const generatingSegment = new Map<string, Promise<void>>();

export function dirFor(fileId: string): string {
  return path.join(/*turbopackIgnore: true*/ CACHE_DIR, fileId);
}

function segmentFilename(index: number): string {
  return `seg${String(index).padStart(5, "0")}.ts`;
}

async function dirSizeBytes(dir: string): Promise<number> {
  let total = 0;
  const files = await readdir(dir).catch(() => []);
  for (const f of files) {
    const s = await stat(path.join(dir, f)).catch(() => null);
    if (s) total += s.size;
  }
  return total;
}

async function evictIfNeeded(): Promise<void> {
  let total = 0;
  for (const e of entries.values()) total += e.bytes;
  if (total <= MAX_CACHE_BYTES) return;

  const byOldest = [...entries.values()].sort((a, b) => a.lastAccess - b.lastAccess);
  for (const entry of byOldest) {
    if (total <= MAX_CACHE_BYTES) break;
    await rm(dirFor(entry.fileId), { recursive: true, force: true }).catch(() => {});
    total -= entry.bytes;
    entries.delete(entry.fileId);
  }
}

async function sweepIdle(): Promise<void> {
  const now = Date.now();
  for (const entry of [...entries.values()]) {
    if (now - entry.lastAccess > IDLE_TTL_MS) {
      await rm(dirFor(entry.fileId), { recursive: true, force: true }).catch(() => {});
      entries.delete(entry.fileId);
    }
  }
}

if (process.env.NODE_ENV !== "test") {
  setInterval(() => void sweepIdle(), 5 * 60 * 1000).unref();
}

async function touch(fileId: string): Promise<void> {
  const bytes = await dirSizeBytes(dirFor(fileId));
  entries.set(fileId, { fileId, lastAccess: Date.now(), bytes });
  await evictIfNeeded();
}

/** Pure arithmetic from the file's stored duration — no Telegram/ffmpeg work at
 * all, so the master playlist is available instantly regardless of file size. */
export async function buildMasterPlaylist(fileId: string): Promise<string> {
  const file = await db.file.findUniqueOrThrow({ where: { id: fileId }, select: { durationSeconds: true } });
  const duration = file.durationSeconds ?? 0;
  const segCount = Math.max(1, Math.ceil(duration / SEGMENT_SECONDS));

  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${SEGMENT_SECONDS}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:VOD",
  ];
  for (let i = 0; i < segCount; i++) {
    const segDur = Math.min(SEGMENT_SECONDS, duration - i * SEGMENT_SECONDS);
    lines.push(`#EXTINF:${segDur.toFixed(6)},`, segmentFilename(i));
  }
  lines.push("#EXT-X-ENDLIST");
  return lines.join("\n") + "\n";
}

/** Parses "segNNNNN.ts" back to its index, or null if it doesn't match. */
export function parseSegmentFilename(filename: string): number | null {
  const match = /^seg(\d{5})\.ts$/.exec(filename);
  return match ? parseInt(match[1], 10) : null;
}

/** Ensures one segment exists in the local cache, generating it on a miss by
 * pointing ffmpeg at our own internal range-streaming endpoint for just that
 * time window. Concurrent requests for the same segment share one generation;
 * a global semaphore caps how many generations run at once app-wide. */
export async function ensureSegmentGenerated(fileId: string, segIndex: number): Promise<string> {
  const dir = dirFor(fileId);
  const finalPath = path.join(dir, segmentFilename(segIndex));

  if (await stat(finalPath).catch(() => null)) {
    void touch(fileId);
    return finalPath;
  }

  const lockKey = `${fileId}:${segIndex}`;
  const inFlight = generatingSegment.get(lockKey);
  if (inFlight) {
    await inFlight;
    return finalPath;
  }

  const task = generateSegment(fileId, segIndex, dir, finalPath).finally(() => generatingSegment.delete(lockKey));
  generatingSegment.set(lockKey, task);
  await task;
  void touch(fileId);
  return finalPath;
}

async function generateSegment(fileId: string, segIndex: number, dir: string, finalPath: string): Promise<void> {
  const file = await db.file.findUniqueOrThrow({ where: { id: fileId }, select: { durationSeconds: true } });
  const duration = file.durationSeconds ?? 0;
  const segStart = segIndex * SEGMENT_SECONDS;
  const segDur = Math.min(SEGMENT_SECONDS, duration - segStart);
  if (segDur <= 0) throw new Error(`Segment ${segIndex} is past the end of file ${fileId}`);

  await mkdir(dir, { recursive: true });
  const tmpPath = finalPath + ".tmp";
  const sourceUrl = `${INTERNAL_APP_URL}/api/internal/stream/${fileId}?key=${internalStreamSecret()}`;

  const { videoCodec, audioCodec } = await probeCodecs(fileId, sourceUrl);
  // mpegts can carry h264/aac as-is — copy instead of re-encoding when the
  // source already matches, which is the common case for uploaded mp4s.
  // This was previously avoided outright ("copied segments could fail to
  // decode standalone on a cold seek") because mp4 stores h264 SPS/PPS
  // out-of-band (AVCC) while mpegts needs them repeated in-stream (Annex B)
  // for a segment to decode on its own — a plain -c copy segment is missing
  // them. The bitstream filters below convert the framing on the fly, so a
  // segment stays independently decodable without paying for a re-encode.
  // (aac_adtstoasc is likewise required for AAC: mp4 stores it as raw LATM,
  // mpegts needs ADTS framing — it's a no-op if there's no audio stream.)
  const canCopy = videoCodec === "h264" && (audioCodec === null || audioCodec === "aac");

  const encodeArgs = canCopy
    ? ["-c", "copy", "-bsf:v", "h264_mp4toannexb", "-bsf:a", "aac_adtstoasc"]
    : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-b:a", "128k"];

  const release = await jobSlots.acquire();
  try {
    await execFileAsync(
      "ffmpeg",
      ["-y", "-ss", segStart.toFixed(3), "-i", sourceUrl, "-t", segDur.toFixed(3), ...encodeArgs, "-f", "mpegts", tmpPath],
      { timeout: SEGMENT_TIMEOUT_MS, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 * 32 }
    );
    await rename(tmpPath, finalPath);
  } finally {
    release();
    await unlink(tmpPath).catch(() => {});
  }
}

/** Immediately drops a file's cached HLS segments — call this on file delete. */
export async function evictHlsCache(fileId: string): Promise<void> {
  entries.delete(fileId);
  await rm(dirFor(fileId), { recursive: true, force: true }).catch(() => {});
}

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { db } from "@/lib/db";

const execFileAsync = promisify(execFile);

function thumbnailDir(): string {
  return process.env.THUMBNAIL_DIR ?? "./public/thumbnails";
}

function thumbnailPathFor(fileId: string): { absPath: string; publicPath: string } {
  const publicPath = `/thumbnails/${fileId}.jpg`;
  return { absPath: path.join(thumbnailDir(), `${fileId}.jpg`), publicPath };
}

/** Resolves a fileId to its on-disk thumbnail path, honoring THUMBNAIL_DIR. */
export function thumbnailAbsPathFor(fileId: string): string {
  return thumbnailPathFor(fileId).absPath;
}

/** Probes a local video file's duration in seconds via ffprobe. Returns null if it fails. */
export async function probeDurationSeconds(localPath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      localPath,
    ]);
    const seconds = Number(stdout.trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}

/**
 * Grabs a single frame from the still-local temp copy of an uploaded video,
 * before it's split/sent to Telegram. Avoids re-downloading from Telegram
 * just to make a thumbnail.
 */
export async function autoGenerateThumbnail(
  localPath: string,
  fileId: string,
  durationSeconds: number | null
): Promise<string | null> {
  const { absPath, publicPath } = thumbnailPathFor(fileId);
  await mkdir(thumbnailDir(), { recursive: true });

  const seekTo = durationSeconds ? Math.min(durationSeconds * 0.1, durationSeconds - 0.5) : 1;

  try {
    await execFileAsync("ffmpeg", [
      "-ss",
      Math.max(seekTo, 0).toFixed(2),
      "-i",
      localPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=640:-2",
      "-q:v",
      "3",
      "-y",
      absPath,
    ]);
  } catch (err) {
    console.error(`ffmpeg thumbnail extraction failed for file ${fileId}:`, err);
    return null;
  }

  await db.file.update({ where: { id: fileId }, data: { thumbnailPath: publicPath } });
  return publicPath;
}

/** Saves a browser-captured (canvas snapshot) thumbnail for a file. */
export async function saveManualThumbnail(fileId: string, imageBuffer: Buffer): Promise<string> {
  const { absPath, publicPath } = thumbnailPathFor(fileId);
  await mkdir(thumbnailDir(), { recursive: true });
  await writeFile(absPath, imageBuffer);
  await db.file.update({ where: { id: fileId }, data: { thumbnailPath: publicPath } });
  return publicPath;
}

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";

function captionDir(): string {
  return process.env.CAPTION_DIR ?? "./public/captions";
}

function captionPathFor(fileId: string): { absPath: string; publicPath: string } {
  const publicPath = `/captions/${fileId}.vtt`;
  return { absPath: path.join(captionDir(), `${fileId}.vtt`), publicPath };
}

/** Resolves a fileId to its on-disk caption path, honoring CAPTION_DIR. */
export function captionAbsPathFor(fileId: string): string {
  return captionPathFor(fileId).absPath;
}

/** Saves a user-uploaded WebVTT caption file for a video. */
export async function saveCaption(fileId: string, vttText: string): Promise<string> {
  const { absPath, publicPath } = captionPathFor(fileId);
  await mkdir(captionDir(), { recursive: true });
  await writeFile(absPath, vttText, "utf-8");
  await db.file.update({ where: { id: fileId }, data: { captionPath: publicPath } });
  return publicPath;
}

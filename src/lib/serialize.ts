import type { File } from "@/generated/prisma/client";
import { getUploadedBytes } from "@/lib/telegram/uploadProgress";

/** BigInt fields aren't JSON-serializable as-is, so send sizeBytes as a string. */
export function serializeFile(file: File) {
  const isPublic = file.shareToken !== null;
  return {
    id: file.id,
    filename: file.filename,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes.toString(),
    kind: file.kind,
    status: file.status,
    thumbnailPath: file.thumbnailPath,
    thumbnailUrl: file.thumbnailPath, // same value — alias kept for API response clarity
    captionPath: file.captionPath,
    durationSeconds: file.durationSeconds,
    accountId: file.accountId,
    folderId: file.folderId,
    // Every route serving this already requires the site login cookie, so returning
    // the actual token here (not just a boolean) is fine — it's how the owner copies
    // their own share link.
    shareToken: file.shareToken,
    hlsAllowedHosts: file.hlsAllowedHosts,
    // Relative paths — the caller already knows its own host. streamUrl needs the
    // site's login cookie; publicUrl/hlsUrl are only present once shared (token-gated,
    // no cookie needed) and only meaningful once status is "ready".
    streamUrl: `/api/stream/${file.id}`,
    publicUrl: isPublic ? `/api/public/${file.id}/${file.shareToken}` : null,
    hlsUrl: isPublic ? `/api/hls/${file.id}/${file.shareToken}/master.m3u8` : null,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
    // Live bytes-sent-to-Telegram while status is "processing" — transient,
    // in-memory only (see telegram/uploadProgress.ts), null once settled.
    uploadedBytes: file.status === "processing" ? getUploadedBytes(file.id) : null,
  };
}

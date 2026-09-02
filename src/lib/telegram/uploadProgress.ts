// Transient, in-memory only — tracks bytes sent to Telegram so far per fileId while
// a background upload is in flight. Not persisted; a process restart mid-upload just
// means the progress bar resets (the DB status/rows are still correct either way).
const progressByFileId = new Map<string, number>();

export function setUploadedBytes(fileId: string, bytes: number): void {
  progressByFileId.set(fileId, bytes);
}

export function getUploadedBytes(fileId: string): number | null {
  return progressByFileId.get(fileId) ?? null;
}

export function clearUploadedBytes(fileId: string): void {
  progressByFileId.delete(fileId);
}

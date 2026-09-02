import { randomBytes, timingSafeEqual } from "node:crypto";

// Generated once per process, held only in memory — only this process's own
// ffmpeg subprocesses (HLS segment generation) ever need it, so it doesn't need
// to survive a restart or live in .env. Never sent to a browser or client.
const SECRET = randomBytes(32).toString("hex");

export function internalStreamSecret(): string {
  return SECRET;
}

export function isValidInternalSecret(candidate: string | null): boolean {
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

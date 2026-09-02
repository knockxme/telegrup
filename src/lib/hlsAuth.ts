import { randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import type { File } from "@/generated/prisma/client";

export function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type HlsAuthResult = { ok: true; file: File } | { ok: false; status: number; error: string };

/** Token-only check (no host allowlist) — used by routes/pages that don't
 * need the embed hotlink protection, e.g. the public watch page. */
export async function verifyShareToken(fileId: string, token: string): Promise<File | null> {
  const file = await db.file.findUnique({ where: { id: fileId } });
  if (!file || !file.shareToken) return null;
  if (!timingSafeEqualStr(file.shareToken, token)) return null;
  if (file.status !== "ready") return null;
  return file;
}

/** Validates a public HLS request: token must match the file's shareToken, and if
 * the file has an allowed-hosts list, the request's Origin/Referer must match one. */
export async function authorizeHlsRequest(fileId: string, token: string, req: Request): Promise<HlsAuthResult> {
  const file = await db.file.findUnique({ where: { id: fileId } });
  if (!file || !file.shareToken) return { ok: false, status: 404, error: "Not found" };
  if (!timingSafeEqualStr(file.shareToken, token)) return { ok: false, status: 403, error: "Invalid token" };
  if (file.status !== "ready") return { ok: false, status: 409, error: "File is not ready" };

  if (file.hlsAllowedHosts.length > 0) {
    const originHeader = req.headers.get("origin") ?? req.headers.get("referer");
    const host = originHeader ? safeHostname(originHeader) : null;
    if (!host || !file.hlsAllowedHosts.includes(host)) {
      return { ok: false, status: 403, error: "Host not allowed" };
    }
  }

  return { ok: true, file };
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

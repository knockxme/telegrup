import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import type { ApiKeyRole } from "@/generated/prisma/client";

const ROLE_RANK: Record<ApiKeyRole, number> = { read: 0, upload: 1, full: 2 };

export function roleAllows(role: ApiKeyRole, need: ApiKeyRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[need];
}

/** Generates a new key: returns the id (stored, shown again) and the full
 * bearer token `${keyId}.${secret}` (shown ONCE, only the hash is kept). */
export async function issueApiKey(label: string, role: ApiKeyRole) {
  const keyId = randomBytes(6).toString("hex");
  const secret = randomBytes(24).toString("hex");
  const secretHash = await bcrypt.hash(secret, 10);
  const key = await db.apiKey.create({ data: { label, role, keyId, secretHash } });
  return { key, token: `${keyId}.${secret}` };
}

async function verifyApiKey(req: Request): Promise<ApiKeyRole | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const keyId = token.slice(0, dot);
  const secret = token.slice(dot + 1);

  const key = await db.apiKey.findUnique({ where: { keyId } });
  if (!key) return null;
  const ok = await bcrypt.compare(secret, key.secretHash);
  if (!ok) return null;

  db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return key.role;
}

export type AuthResult = { ok: true; role: ApiKeyRole } | { ok: false; status: 401; error: string };

/** Accepts either the site login cookie (always full access) or an API key
 * bearer token meeting at least `minRole`. Used by every management API route.
 * The resolved role is returned too, for routes that gate a sub-feature at a
 * higher tier than the route's own minimum (e.g. upload's `public` flag). */
export async function authorize(req: Request, minRole: ApiKeyRole): Promise<AuthResult> {
  const userId = await getSessionUserId();
  if (userId) return { ok: true, role: "full" };

  const role = await verifyApiKey(req);
  if (role && roleAllows(role, minRole)) return { ok: true, role };

  return { ok: false, status: 401, error: "Unauthorized" };
}

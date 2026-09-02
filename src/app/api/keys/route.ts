import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { issueApiKey } from "@/lib/apiKeyAuth";

// Key minting/listing is intentionally cookie-only — never delegated to an API
// key itself, so a leaked key can't be used to mint more keys.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await db.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, keyId: true, role: true, createdAt: true, lastUsedAt: true },
  });
  return NextResponse.json({ keys });
}

const bodySchema = z.object({
  label: z.string().min(1).max(100),
  role: z.enum(["read", "upload", "full"]),
});

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "label and role are required" }, { status: 400 });

  const { key, token } = await issueApiKey(parsed.data.label, parsed.data.role);
  // `token` is the only time the secret is ever readable — only the hash is stored.
  return NextResponse.json(
    { id: key.id, label: key.label, role: key.role, createdAt: key.createdAt, token },
    { status: 201 }
  );
}

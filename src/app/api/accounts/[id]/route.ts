import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { isNotFoundError } from "@/lib/prismaErrors";
import { disconnectAccountClient } from "@/lib/telegram/client";

const patchSchema = z.object({ isPremium: z.boolean().optional(), label: z.string().min(1).optional() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const account = await db.telegramAccount.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ id: account.id, isPremium: account.isPremium, label: account.label });
  } catch (err) {
    if (isNotFoundError(err)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await disconnectAccountClient(id);
  try {
    await db.telegramAccount.delete({ where: { id } });
  } catch (err) {
    if (isNotFoundError(err)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Most likely the FK constraint from File.accountId (no cascade by design —
    // deleting an account shouldn't silently orphan/delete stored files).
    return NextResponse.json(
      { error: "Account still has files stored on it — move or delete those first" },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}

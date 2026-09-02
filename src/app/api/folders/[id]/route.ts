import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/apiKeyAuth";
import { db } from "@/lib/db";
import { isNotFoundError } from "@/lib/prismaErrors";

const patchSchema = z.object({ name: z.string().min(1).max(100) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "upload");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "name is required" }, { status: 400 });

  try {
    const folder = await db.folder.update({ where: { id }, data: { name: parsed.data.name } });
    return NextResponse.json({ folder });
  } catch (err) {
    if (isNotFoundError(err)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw err;
  }
}

// Files inside get folderId set to null (schema: onDelete SetNull) — they survive unfiled.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "full");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  try {
    await db.folder.delete({ where: { id } });
  } catch (err) {
    if (isNotFoundError(err)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}

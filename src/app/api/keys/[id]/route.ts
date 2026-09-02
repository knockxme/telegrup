import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { isNotFoundError } from "@/lib/prismaErrors";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await db.apiKey.delete({ where: { id } });
  } catch (err) {
    if (isNotFoundError(err)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}

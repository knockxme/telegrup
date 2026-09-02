import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/apiKeyAuth";
import { db } from "@/lib/db";
import { generateShareToken } from "@/lib/hlsAuth";
import { isNotFoundError } from "@/lib/prismaErrors";

const patchSchema = z.object({ allowedHosts: z.array(z.string().min(1)) });

/** (Re)generates the file's share token — invalidates any previously issued HLS links. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "full");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const file = await db.file.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.file.update({ where: { id }, data: { shareToken: generateShareToken() } });
  return NextResponse.json({ shareToken: updated.shareToken, hlsAllowedHosts: updated.hlsAllowedHosts });
}

/** Updates the allowed-hosts list for an existing share link. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "full");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "allowedHosts must be an array of strings" }, { status: 400 });

  const normalized = parsed.data.allowedHosts.map((h) => h.trim().toLowerCase()).filter(Boolean);
  try {
    const updated = await db.file.update({ where: { id }, data: { hlsAllowedHosts: normalized } });
    return NextResponse.json({ shareToken: updated.shareToken, hlsAllowedHosts: updated.hlsAllowedHosts });
  } catch (err) {
    if (isNotFoundError(err)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw err;
  }
}

/** Revokes the share link entirely. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, "full");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  try {
    await db.file.update({ where: { id }, data: { shareToken: null, hlsAllowedHosts: [] } });
  } catch (err) {
    if (isNotFoundError(err)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}

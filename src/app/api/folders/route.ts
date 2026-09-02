import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/apiKeyAuth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await authorize(req, "read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const folders = await db.folder.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ folders });
}

const bodySchema = z.object({ name: z.string().min(1).max(100) });

export async function POST(req: Request) {
  const auth = await authorize(req, "upload");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const folder = await db.folder.create({ data: { name: parsed.data.name } });
  return NextResponse.json({ folder }, { status: 201 });
}

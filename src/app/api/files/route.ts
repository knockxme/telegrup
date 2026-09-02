import { NextResponse } from "next/server";
import { authorize } from "@/lib/apiKeyAuth";
import { db } from "@/lib/db";
import { serializeFile } from "@/lib/serialize";

export async function GET(req: Request) {
  const auth = await authorize(req, "read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const files = await db.file.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ files: files.map(serializeFile) });
}

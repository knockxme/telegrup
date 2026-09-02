import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth";
import { startLogin } from "@/lib/telegram/login";

const bodySchema = z.object({
  label: z.string().min(1),
  phone: z.string().min(5),
});

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "label and phone are required" }, { status: 400 });

  try {
    const attempt = await startLogin(parsed.data.label, parsed.data.phone);
    return NextResponse.json({ attemptId: attempt.id, status: attempt.status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to start login" }, { status: 500 });
  }
}

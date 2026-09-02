import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth";
import { submitLoginPassword } from "@/lib/telegram/login";

const bodySchema = z.object({ attemptId: z.string().min(1), password: z.string().min(1) });

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "attemptId and password are required" }, { status: 400 });

  try {
    const attempt = submitLoginPassword(parsed.data.attemptId, parsed.data.password);
    await attempt.waitForChange("awaiting_password");
    return NextResponse.json({ status: attempt.status, error: attempt.error, accountId: attempt.accountId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to submit password" }, { status: 400 });
  }
}

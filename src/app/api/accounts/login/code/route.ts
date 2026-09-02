import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth";
import { getAttempt, submitLoginCode } from "@/lib/telegram/login";

const bodySchema = z.object({ attemptId: z.string().min(1), code: z.string().min(1) });

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "attemptId and code are required" }, { status: 400 });

  try {
    const attempt = submitLoginCode(parsed.data.attemptId, parsed.data.code);
    await attempt.waitForChange("awaiting_code");
    return NextResponse.json({ status: attempt.status, error: attempt.error, accountId: attempt.accountId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to submit code" }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const attemptId = new URL(req.url).searchParams.get("attemptId");
  const attempt = attemptId ? getAttempt(attemptId) : undefined;
  if (!attempt) return NextResponse.json({ error: "Unknown or expired login attempt" }, { status: 404 });

  return NextResponse.json({ status: attempt.status, error: attempt.error, accountId: attempt.accountId });
}

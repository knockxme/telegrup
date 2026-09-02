import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionCookie, verifyPasswordAgainstUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clearFailedLogins, clientIp, isLoginRateLimited, recordFailedLogin } from "@/lib/loginRateLimit";

const bodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (isLoginRateLimited(ip)) {
    return NextResponse.json({ error: "Too many failed attempts — try again later" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { username: parsed.data.username } });
  const ok = await verifyPasswordAgainstUser(parsed.data.password, user?.passwordHash);
  if (!user || !ok) {
    recordFailedLogin(ip);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  clearFailedLogins(ip);
  await createSessionCookie(user.id);
  return NextResponse.json({ ok: true });
}

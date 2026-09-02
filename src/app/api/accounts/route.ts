import { NextResponse } from "next/server";
import { authorize } from "@/lib/apiKeyAuth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await authorize(req, "read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const accounts = await db.telegramAccount.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      phone: true,
      isPremium: true,
      status: true,
      storageChannelId: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    accounts: accounts.map((a: (typeof accounts)[number]) => ({
      ...a,
      hasStorageChannel: a.storageChannelId !== null,
      storageChannelId: undefined,
    })),
  });
}

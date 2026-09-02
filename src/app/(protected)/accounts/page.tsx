import { db } from "@/lib/db";
import { AccountsManager } from "@/components/AccountsManager";
import type { ApiAccount } from "@/lib/types";

export default async function AccountsPage() {
  const accounts = await db.telegramAccount.findMany({ orderBy: { createdAt: "asc" } });

  const apiAccounts: ApiAccount[] = accounts.map((a) => ({
    id: a.id,
    label: a.label,
    phone: a.phone,
    isPremium: a.isPremium,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    hasStorageChannel: a.storageChannelId !== null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Telegram accounts</h1>
      <AccountsManager initialAccounts={apiAccounts} />
    </div>
  );
}

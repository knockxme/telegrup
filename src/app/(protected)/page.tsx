import { db } from "@/lib/db";
import { serializeFile } from "@/lib/serialize";
import { Dashboard } from "@/components/Dashboard";
import type { ApiAccount, ApiFolder } from "@/lib/types";

export default async function DashboardPage() {
  const [accounts, files, folders] = await Promise.all([
    db.telegramAccount.findMany({ orderBy: { createdAt: "asc" } }),
    db.file.findMany({ orderBy: { createdAt: "desc" } }),
    db.folder.findMany({ orderBy: { name: "asc" } }),
  ]);

  const apiAccounts: ApiAccount[] = accounts.map((a) => ({
    id: a.id,
    label: a.label,
    phone: a.phone,
    isPremium: a.isPremium,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    hasStorageChannel: a.storageChannelId !== null,
  }));

  const apiFolders: ApiFolder[] = folders.map((f) => ({ id: f.id, name: f.name, createdAt: f.createdAt.toISOString() }));
  const apiFiles = files.map(serializeFile);

  return <Dashboard accounts={apiAccounts} initialFiles={apiFiles} initialFolders={apiFolders} />;
}

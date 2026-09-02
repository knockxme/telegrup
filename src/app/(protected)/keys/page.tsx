import { db } from "@/lib/db";
import { ApiKeysManager } from "@/components/ApiKeysManager";
import type { ApiKey } from "@/lib/types";

export default async function KeysPage() {
  const keys = await db.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, keyId: true, role: true, createdAt: true, lastUsedAt: true },
  });

  const apiKeys: ApiKey[] = keys.map((k) => ({
    id: k.id,
    label: k.label,
    keyId: k.keyId,
    role: k.role,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">API keys</h1>
        <p className="text-sm text-[var(--text-dim)]">
          Use a key to call the API from scripts or other sites — see{" "}
          <a href="/docs" className="text-[var(--accent)] hover:underline">
            the docs
          </a>{" "}
          for endpoints and examples.
        </p>
      </div>
      <ApiKeysManager initialKeys={apiKeys} />
    </div>
  );
}

"use client";

import { useState } from "react";
import type { ApiKey, ApiKeyRole } from "@/lib/types";

const ROLE_LABEL: Record<ApiKeyRole, string> = {
  read: "Read-only",
  upload: "Upload",
  full: "Full access",
};

const ROLE_DESC: Record<ApiKeyRole, string> = {
  read: "List and view files, folders, accounts.",
  upload: "Read + upload files, rename/move, create folders.",
  full: "Upload + delete files/folders, manage share links.",
};

export function ApiKeysManager({ initialKeys }: { initialKeys: ApiKey[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<ApiKeyRole>("read");
  const [busy, setBusy] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function createKey() {
    if (!label.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), role }),
      });
      const data = await res.json();
      if (res.ok) {
        setKeys((prev) => [
          { id: data.id, label: data.label, keyId: data.token.split(".")[0], role: data.role, createdAt: data.createdAt, lastUsedAt: null },
          ...prev,
        ]);
        setFreshToken(data.token);
        setLabel("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Anything using it will stop working immediately.")) return;
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    setKeys((prev) => prev.filter((k) => k.id !== id));
  }

  function copyToken() {
    if (!freshToken) return;
    navigator.clipboard.writeText(freshToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-6">
      {freshToken && (
        <div className="flex flex-col gap-2 rounded border border-[var(--ok)] bg-[var(--bg-elevated)] p-4">
          <p className="text-sm font-medium text-[var(--ok)]">Key created — copy it now, it won&apos;t be shown again.</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={freshToken}
              className="flex-1 truncate rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs"
            />
            <button onClick={copyToken} className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button onClick={() => setFreshToken(null)} className="w-fit text-xs text-[var(--text-dim)] hover:text-[var(--text)]">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-[var(--text-dim)]">Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. upload-script"
            className="rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-[var(--text-dim)]">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as ApiKeyRole)}
            className="rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm"
          >
            {(["read", "upload", "full"] as const).map((r) => (
              <option key={r} value={r} className="bg-[var(--bg-elevated)]">
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={createKey}
          disabled={busy || !label.trim()}
          className="rounded bg-[var(--accent)] px-4 py-1.5 text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          Create key
        </button>
        <p className="w-full text-xs text-[var(--text-dim)]">{ROLE_DESC[role]}</p>
      </div>

      <div className="flex flex-col gap-2">
        {keys.length === 0 && <p className="text-[var(--text-dim)]">No keys yet.</p>}
        {keys.map((k) => (
          <div
            key={k.id}
            className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3"
          >
            <div>
              <p className="font-medium">
                {k.label} <span className="text-[var(--text-dim)]">· {ROLE_LABEL[k.role]}</span>
              </p>
              <p className="text-xs text-[var(--text-dim)]">
                {k.keyId}… · {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleString()}` : "never used"}
              </p>
            </div>
            <button onClick={() => revoke(k.id)} className="text-sm text-[var(--danger)] hover:underline">
              Revoke
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

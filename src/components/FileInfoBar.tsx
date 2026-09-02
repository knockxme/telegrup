"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApiFile, ApiFolder } from "@/lib/types";
import { formatBytes } from "@/lib/format";

export function FileInfoBar({ file, folders }: { file: ApiFile; folders: ApiFolder[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(file.filename);
  const [folderId, setFolderId] = useState(file.folderId ?? "");

  async function saveName() {
    setEditing(false);
    if (name.trim() && name.trim() !== file.filename) {
      await fetch(`/api/files/${file.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: name.trim() }),
      });
      router.refresh();
    } else {
      setName(file.filename);
    }
  }

  async function saveFolder(next: string) {
    setFolderId(next);
    await fetch(`/api/files/${file.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: next || null }),
    });
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setName(file.filename);
                  setEditing(false);
                }
              }}
              className="rounded border border-[var(--accent)] bg-transparent px-2 py-1 text-lg font-semibold outline-none"
            />
            <button
              onClick={saveName}
              className="rounded bg-[var(--accent)] px-2 py-1 text-xs font-medium hover:bg-[var(--accent-hover)]"
            >
              Save
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{file.filename}</h1>
            <button
              onClick={() => setEditing(true)}
              className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-dim)] hover:border-[var(--accent)] hover:text-[var(--text)]"
            >
              ✎ Rename
            </button>
          </div>
        )}
        <p className="text-sm text-[var(--text-dim)]">{formatBytes(file.sizeBytes)}</p>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-[var(--text-dim)]">Folder</label>
        <select
          value={folderId}
          onChange={(e) => saveFolder(e.target.value)}
          className="rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm"
        >
          <option value="" className="bg-[var(--bg-elevated)]">
            No folder
          </option>
          {folders.map((f) => (
            <option key={f.id} value={f.id} className="bg-[var(--bg-elevated)]">
              {f.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

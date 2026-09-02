"use client";

import { useState } from "react";
import type { ApiFolder } from "@/lib/types";

interface FolderBarProps {
  folders: ApiFolder[];
  onFoldersChange: (folders: ApiFolder[]) => void;
  selectedFolderId: string | null;
  onSelect: (id: string | null) => void;
}

export function FolderBar({ folders, onFoldersChange, selectedFolderId, onSelect }: FolderBarProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function createFolder() {
    if (!name.trim()) return;
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      onFoldersChange([...folders, data.folder].sort((a, b) => a.name.localeCompare(b.name)));
    }
    setName("");
    setCreating(false);
  }

  async function renameFolder(id: string) {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    const res = await fetch(`/api/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      onFoldersChange(folders.map((f) => (f.id === id ? data.folder : f)).sort((a, b) => a.name.localeCompare(b.name)));
    }
    setRenamingId(null);
  }

  async function deleteFolder(id: string) {
    if (!confirm("Delete this folder? Files inside stay, just unfiled.")) return;
    await fetch(`/api/folders/${id}`, { method: "DELETE" });
    onFoldersChange(folders.filter((f) => f.id !== id));
    if (selectedFolderId === id) onSelect(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => onSelect(null)}
        className={`rounded-full px-3 py-1 text-sm ${
          selectedFolderId === null ? "bg-[var(--accent)]" : "border border-[var(--border)] text-[var(--text-dim)]"
        }`}
      >
        All
      </button>
      {folders.map((f) =>
        renamingId === f.id ? (
          <input
            key={f.id}
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => renameFolder(f.id)}
            onKeyDown={(e) => e.key === "Enter" && renameFolder(f.id)}
            className="rounded-full border border-[var(--accent)] bg-transparent px-3 py-1 text-sm outline-none"
          />
        ) : (
          <div
            key={f.id}
            className={`group flex items-center gap-1 rounded-full px-3 py-1 text-sm ${
              selectedFolderId === f.id ? "bg-[var(--accent)]" : "border border-[var(--border)] text-[var(--text-dim)]"
            }`}
          >
            <button onClick={() => onSelect(f.id)}>{f.name}</button>
            <button
              onClick={() => {
                setRenamingId(f.id);
                setRenameValue(f.name);
              }}
              className="hidden text-xs opacity-70 hover:opacity-100 group-hover:inline"
              title="Rename"
            >
              ✎
            </button>
            <button
              onClick={() => deleteFolder(f.id)}
              className="hidden text-xs opacity-70 hover:opacity-100 group-hover:inline"
              title="Delete"
            >
              ✕
            </button>
          </div>
        )
      )}
      {creating ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={createFolder}
          onKeyDown={(e) => e.key === "Enter" && createFolder()}
          placeholder="Folder name"
          className="rounded-full border border-[var(--accent)] bg-transparent px-3 py-1 text-sm outline-none"
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="rounded-full border border-dashed border-[var(--border)] px-3 py-1 text-sm text-[var(--text-dim)] hover:border-[var(--accent)]"
        >
          + New folder
        </button>
      )}
    </div>
  );
}

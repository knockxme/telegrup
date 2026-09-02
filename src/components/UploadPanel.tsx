"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ApiAccount, ApiFolder } from "@/lib/types";
import { ThumbnailCapture } from "@/components/ThumbnailCapture";

interface UploadPanelProps {
  accounts: ApiAccount[];
  folders: ApiFolder[];
}

const CONCURRENCY = 2;

interface QueueItem {
  localId: string;
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  percent: number;
  error?: string;
  thumbBlob?: Blob | null;
}

function uploadOne(
  item: QueueItem,
  accountId: string,
  folderId: string,
  makePublic: boolean,
  onPercent: (p: number) => void
): Promise<string> {
  const params = new URLSearchParams({
    accountId,
    filename: item.file.name,
    mimeType: item.file.type || "application/octet-stream",
  });
  if (folderId) params.set("folderId", folderId);
  if (makePublic) params.set("public", "1");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/files/upload?${params.toString()}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onPercent(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 202) resolve(JSON.parse(xhr.responseText).fileId);
      else reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(item.file);
  });
}

export function UploadPanel({ accounts, folders }: UploadPanelProps) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [folderId, setFolderId] = useState("");
  const [makePublic, setMakePublic] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const items: QueueItem[] = Array.from(fileList).map((file) => ({
      localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      status: "queued",
      percent: 0,
    }));
    setQueue((prev) => [...prev, ...items]);
  }

  function updateItem(localId: string, patch: Partial<QueueItem>) {
    setQueue((prev) => prev.map((it) => (it.localId === localId ? { ...it, ...patch } : it)));
  }

  async function startUpload() {
    if (!accountId || queue.length === 0 || running) return;
    setRunning(true);

    const pending = queue.filter((it) => it.status === "queued");
    let cursor = 0;
    async function worker() {
      while (cursor < pending.length) {
        const item = pending[cursor++];
        updateItem(item.localId, { status: "uploading", percent: 0 });
        try {
          const fileId = await uploadOne(item, accountId, folderId, makePublic, (percent) =>
            updateItem(item.localId, { percent })
          );
          if (item.thumbBlob) {
            await fetch(`/api/files/${fileId}/thumbnail`, { method: "PUT", body: item.thumbBlob });
          }
          updateItem(item.localId, { status: "done", percent: 100 });
        } catch (err) {
          updateItem(item.localId, { status: "error", error: err instanceof Error ? err.message : "Upload failed" });
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
    setRunning(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function clearFinished() {
    setQueue((prev) => prev.filter((it) => it.status !== "done"));
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-6 text-center">
        <p className="text-[var(--text-dim)]">
          No Telegram account connected yet.{" "}
          <Link href="/accounts" className="text-[var(--accent)] hover:underline">
            Add one
          </Link>{" "}
          before uploading.
        </p>
      </div>
    );
  }

  const singleVideo = queue.length === 1 && queue[0].file.type.startsWith("video/") && queue[0].status === "queued";

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-[var(--text-dim)]">Account</label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id} className="bg-[var(--bg-elevated)]">
              {a.label} ({a.isPremium ? "Premium, ~4GB cap" : "Free, ~2GB cap"})
            </option>
          ))}
        </select>

        <label className="text-sm text-[var(--text-dim)]">Folder</label>
        <select
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
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

        <label className="flex items-center gap-1.5 text-sm text-[var(--text-dim)]">
          <input type="checkbox" checked={makePublic} onChange={(e) => setMakePublic(e.target.checked)} />
          Create public link (HLS + direct)
        </label>
      </div>

      <div
        className="rounded border border-dashed border-[var(--border)] p-6 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pickFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          id="file-input"
          onChange={(e) => pickFiles(e.target.files)}
        />
        <label htmlFor="file-input" className="cursor-pointer text-[var(--text-dim)]">
          Drop files here, or <span className="text-[var(--accent)]">browse</span> (multiple allowed)
        </label>
      </div>

      {singleVideo && (
        <ThumbnailCapture
          file={queue[0].file}
          onCapture={(blob) => updateItem(queue[0].localId, { thumbBlob: blob })}
        />
      )}

      {queue.length > 0 && (
        <div className="flex flex-col gap-2">
          {queue.map((item) => (
            <div key={item.localId} className="flex items-center gap-3 text-sm">
              <span className="w-40 truncate" title={item.file.name}>
                {item.file.name}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-[var(--border)]">
                <div
                  className={`h-full ${item.status === "error" ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`}
                  style={{ width: `${item.percent}%` }}
                />
              </div>
              <span className="w-24 text-[var(--text-dim)]">
                {item.status === "error" ? item.error : item.status}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={startUpload}
          disabled={running || queue.every((it) => it.status !== "queued")}
          className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {running ? "Uploading…" : `Upload ${queue.filter((it) => it.status === "queued").length || ""}`.trim()}
        </button>
        {queue.some((it) => it.status === "done") && (
          <button onClick={clearFinished} className="text-sm text-[var(--text-dim)] hover:text-[var(--text)]">
            Clear finished
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ApiFile, ApiFolder } from "@/lib/types";
import { formatBytes, formatDuration } from "@/lib/format";

const POLL_MS = 3000;

const STATUS_STYLE: Record<ApiFile["status"], string> = {
  uploading: "text-[var(--text-dim)]",
  processing: "text-[var(--accent)]",
  ready: "text-[var(--ok)]",
  failed: "text-[var(--danger)]",
};

interface FileGridProps {
  initialFiles: ApiFile[];
  folders: ApiFolder[];
  selectedFolderId: string | null;
}

export function FileGrid({ initialFiles, folders, selectedFolderId }: FileGridProps) {
  const [files, setFiles] = useState(initialFiles);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/files");
        if (!res.ok) return;
        const body = await res.json();
        setFiles(body.files);
      } catch {
        // transient network hiccup — next tick retries
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  function moveFile(fileId: string, folderId: string) {
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, folderId: folderId || null } : f)));
    fetch(`/api/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: folderId || null }),
    });
  }

  const visible = selectedFolderId === null ? files : files.filter((f) => f.folderId === selectedFolderId);

  if (visible.length === 0) {
    return <p className="text-[var(--text-dim)]">No files here yet.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {visible.map((f) => (
        <FileCard key={f.id} file={f} folders={folders} onMove={moveFile} />
      ))}
    </div>
  );
}

function FileCard({
  file,
  folders,
  onMove,
}: {
  file: ApiFile;
  folders: ApiFolder[];
  onMove: (fileId: string, folderId: string) => void;
}) {
  const thumb = (
    <div className="relative aspect-video overflow-hidden rounded bg-black/40">
      {file.thumbnailPath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.thumbnailPath} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-2xl text-[var(--text-dim)]">
          {file.kind === "video" ? "🎬" : "📄"}
        </div>
      )}
      {file.durationSeconds != null && (
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-xs">
          {formatDuration(file.durationSeconds)}
        </span>
      )}
    </div>
  );

  return (
    <div className={file.status !== "ready" ? "opacity-70" : ""}>
      {file.status === "ready" ? (
        <Link href={`/files/${file.id}`} className="block hover:opacity-90">
          {thumb}
        </Link>
      ) : (
        thumb
      )}
      <p className="mt-2 truncate text-sm" title={file.filename}>
        {file.filename}
      </p>
      <p className="text-xs text-[var(--text-dim)]">
        {formatBytes(file.sizeBytes)} · <span className={STATUS_STYLE[file.status]}>{file.status}</span>
      </p>
      {file.status === "processing" && file.uploadedBytes != null && (
        <div className="mt-1 h-1 w-full overflow-hidden rounded bg-[var(--border)]">
          <div
            className="h-full bg-[var(--accent)]"
            style={{ width: `${Math.min(100, Math.round((file.uploadedBytes / Number(file.sizeBytes)) * 100))}%` }}
          />
        </div>
      )}
      <select
        value={file.folderId ?? ""}
        onChange={(e) => onMove(file.id, e.target.value)}
        className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs text-[var(--text-dim)]"
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
  );
}

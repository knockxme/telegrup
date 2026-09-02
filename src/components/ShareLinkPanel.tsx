"use client";

import { useState } from "react";
import type { ApiFile } from "@/lib/types";

function LinkRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <p className="text-xs text-[var(--text-dim)]">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="flex-1 truncate rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs text-[var(--text-dim)]"
        />
        <button onClick={copy} className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function ShareLinkPanel({ file: initialFile }: { file: ApiFile }) {
  const [file, setFile] = useState(initialFile);
  const [busy, setBusy] = useState(false);
  const [hostInput, setHostInput] = useState("");

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const watchUrl = file.shareToken && file.kind === "video" ? `${origin}/watch/${file.id}/${file.shareToken}` : null;
  const fileUrl = file.shareToken ? `${origin}/api/public/${file.id}/${file.shareToken}` : null;
  // Thumbnails live under /public — served statically with no auth or token,
  // so this link works regardless of whether a share link has been generated.
  const thumbnailUrl = file.thumbnailPath ? `${origin}${file.thumbnailPath}` : null;

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/files/${file.id}/share`, { method: "POST" });
      const data = await res.json();
      setFile((f) => ({ ...f, shareToken: data.shareToken, hlsAllowedHosts: data.hlsAllowedHosts }));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm("Revoke this link? Anywhere it's shared will stop working.")) return;
    setBusy(true);
    try {
      await fetch(`/api/files/${file.id}/share`, { method: "DELETE" });
      setFile((f) => ({ ...f, shareToken: null, hlsAllowedHosts: [] }));
    } finally {
      setBusy(false);
    }
  }

  async function saveHosts(hosts: string[]) {
    setBusy(true);
    try {
      const res = await fetch(`/api/files/${file.id}/share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedHosts: hosts }),
      });
      const data = await res.json();
      setFile((f) => ({ ...f, hlsAllowedHosts: data.hlsAllowedHosts }));
    } finally {
      setBusy(false);
    }
  }

  function addHost() {
    const host = hostInput.trim().toLowerCase();
    if (!host || file.hlsAllowedHosts.includes(host)) return;
    saveHosts([...file.hlsAllowedHosts, host]);
    setHostInput("");
  }

  function removeHost(host: string) {
    saveHosts(file.hlsAllowedHosts.filter((h) => h !== host));
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
      <p className="text-sm font-medium">Share with anyone (no login needed)</p>

      {thumbnailUrl && <LinkRow label="Thumbnail image link" url={thumbnailUrl} />}

      {!file.shareToken ? (
        <button
          onClick={generate}
          disabled={busy}
          className="w-fit rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          Get share link
        </button>
      ) : (
        <>
          {watchUrl && <LinkRow label="Watch page — send this to friends" url={watchUrl} />}
          {fileUrl && <LinkRow label={file.kind === "video" ? "Direct file link (for downloading / other players)" : "File link"} url={fileUrl} />}

          {file.kind === "video" && (
            <div>
              <p className="text-xs text-[var(--text-dim)]">
                Allowed embed hosts (leave empty to allow any site with this link)
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {file.hlsAllowedHosts.map((h) => (
                  <span key={h} className="flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                    {h}
                    <button onClick={() => removeHost(h)} className="opacity-70 hover:opacity-100">
                      ✕
                    </button>
                  </span>
                ))}
                <input
                  value={hostInput}
                  onChange={(e) => setHostInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addHost()}
                  placeholder="example.com"
                  className="w-32 rounded border border-[var(--border)] bg-transparent px-2 py-0.5 text-xs outline-none focus:border-[var(--accent)]"
                />
                <button onClick={addHost} className="text-xs text-[var(--accent)] hover:underline">
                  Add
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={generate} disabled={busy} className="text-xs text-[var(--text-dim)] hover:text-[var(--text)]">
              Rotate link
            </button>
            <button onClick={revoke} disabled={busy} className="text-xs text-[var(--danger)] hover:underline">
              Revoke
            </button>
          </div>
        </>
      )}
    </div>
  );
}

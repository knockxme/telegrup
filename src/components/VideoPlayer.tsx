"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { loadJwPlayer, type JwPlayerInstance } from "@/lib/jwplayerLoader";
import { addForwardButton } from "@/lib/jwForwardButton";
import type { ApiFile } from "@/lib/types";

export function VideoPlayer({ file }: { file: ApiFile }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<JwPlayerInstance | null>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [thumbMessage, setThumbMessage] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [captionBusy, setCaptionBusy] = useState(false);
  const [captionMessage, setCaptionMessage] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    loadJwPlayer().then((jwplayer) => {
      if (cancelled || !containerRef.current) return;
      const player = jwplayer(containerRef.current).setup({
        file: `/api/stream/${file.id}`,
        type: file.mimeType,
        image: file.thumbnailPath ?? undefined,
        width: "100%",
        aspectratio: "16:9",
        preload: "metadata",
        playbackRateControls: true,
        tracks: file.captionPath
          ? [{ file: file.captionPath, kind: "captions", label: "English", default: true }]
          : undefined,
      });
      addForwardButton(player);
      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      playerRef.current?.remove();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);

  async function snapCurrentFrame() {
    const player = playerRef.current;
    const canvas = canvasRef.current;
    if (!player || !canvas) return;
    const video = player.getContainer().querySelector("video");
    if (!video) return;
    setThumbBusy(true);
    setThumbMessage(null);
    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (!blob) throw new Error("Capture failed");
      const res = await fetch(`/api/files/${file.id}/thumbnail`, { method: "PUT", body: blob });
      if (!res.ok) throw new Error("Failed to save thumbnail");
      setThumbMessage("Thumbnail updated.");
      router.refresh();
    } catch (err) {
      setThumbMessage(err instanceof Error ? err.message : "Failed to snap thumbnail");
    } finally {
      setThumbBusy(false);
    }
  }

  async function uploadThumbnailPhoto(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const imgFile = input.files?.[0];
    if (!imgFile) return;
    setThumbBusy(true);
    setThumbMessage(null);
    try {
      const bytes = await imgFile.arrayBuffer();
      const res = await fetch(`/api/files/${file.id}/thumbnail`, { method: "PUT", body: bytes });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to upload thumbnail");
      }
      setThumbMessage("Thumbnail updated.");
      router.refresh();
    } catch (err) {
      setThumbMessage(err instanceof Error ? err.message : "Failed to upload thumbnail");
    } finally {
      setThumbBusy(false);
      input.value = "";
    }
  }

  async function uploadCaption(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const vttFile = input.files?.[0];
    if (!vttFile) return;
    setCaptionBusy(true);
    setCaptionMessage(null);
    try {
      const text = await vttFile.text();
      const res = await fetch(`/api/files/${file.id}/caption`, { method: "PUT", body: text });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save caption");
      }
      setCaptionMessage("Captions updated.");
      router.refresh();
    } catch (err) {
      setCaptionMessage(err instanceof Error ? err.message : "Failed to save caption");
    } finally {
      setCaptionBusy(false);
      input.value = "";
    }
  }

  async function deleteFile() {
    if (!confirm(`Delete "${file.filename}"? This removes it from Telegram too.`)) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      router.push("/");
      router.refresh();
    } catch {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* crossOrigin unset: same-origin stream, cookies ride along automatically */}
      <div ref={containerRef} className="w-full" />
      <div className="flex items-center gap-3">
        <button
          onClick={snapCurrentFrame}
          disabled={thumbBusy}
          className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--accent)] disabled:opacity-50"
        >
          {thumbBusy ? "Saving…" : "Use current frame as thumbnail"}
        </button>
        <button
          onClick={() => thumbInputRef.current?.click()}
          disabled={thumbBusy}
          className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--accent)] disabled:opacity-50"
        >
          {thumbBusy ? "Saving…" : "Upload photo as thumbnail"}
        </button>
        <input ref={thumbInputRef} type="file" accept="image/*" onChange={uploadThumbnailPhoto} className="hidden" />
        <button
          onClick={() => captionInputRef.current?.click()}
          disabled={captionBusy}
          className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--accent)] disabled:opacity-50"
        >
          {captionBusy ? "Uploading…" : file.captionPath ? "Replace captions (.vtt)" : "Add captions (.vtt)"}
        </button>
        <input ref={captionInputRef} type="file" accept=".vtt" onChange={uploadCaption} className="hidden" />
        <button
          onClick={deleteFile}
          disabled={deleteBusy}
          className="rounded border border-[var(--danger)] px-3 py-1.5 text-sm text-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:opacity-50"
        >
          {deleteBusy ? "Deleting…" : "Delete"}
        </button>
        {thumbMessage && <span className="text-sm text-[var(--text-dim)]">{thumbMessage}</span>}
        {captionMessage && <span className="text-sm text-[var(--text-dim)]">{captionMessage}</span>}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

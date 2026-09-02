"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface ThumbnailCaptureProps {
  file: File;
  onCapture: (blob: Blob | null) => void;
}

/** Lets the user scrub a locally-selected video and snap a frame as the thumbnail,
 * before it's ever uploaded. If they never snap, `onCapture(null)` stays in effect
 * and the server falls back to an auto-extracted frame after upload. */
export function ThumbnailCapture({ file, onCapture }: ThumbnailCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  function snap() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedUrl(URL.createObjectURL(blob));
        onCapture(blob);
      },
      "image/jpeg",
      0.85
    );
  }

  function clearCapture() {
    setCapturedUrl(null);
    onCapture(null);
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-[var(--border)] p-3">
      <p className="text-xs text-[var(--text-dim)]">
        Thumbnail — scrub to a frame and snap it, or leave it and one gets picked
        automatically after upload.
      </p>
      <video
        ref={videoRef}
        src={objectUrl}
        className="max-h-48 w-full rounded bg-black"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        muted
        playsInline
      />
      {duration > 0 && (
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={time}
          onChange={(e) => {
            const t = Number(e.target.value);
            setTime(t);
            if (videoRef.current) videoRef.current.currentTime = t;
          }}
        />
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={snap}
          className="rounded border border-[var(--border)] px-3 py-1 text-sm hover:border-[var(--accent)]"
        >
          Snap this frame
        </button>
        {capturedUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- blob: preview, next/image can't load it */}
            <img src={capturedUrl} alt="Captured thumbnail" className="h-12 w-20 rounded object-cover" />
            <button
              type="button"
              onClick={clearCapture}
              className="text-sm text-[var(--text-dim)] hover:text-[var(--text)]"
            >
              Use auto instead
            </button>
          </>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

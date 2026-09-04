"use client";

import { useEffect, useRef } from "react";
import { loadJwPlayer, type JwPlayerInstance } from "@/lib/jwplayerLoader";
import { addForwardButton } from "@/lib/jwForwardButton";

export function PublicPlayer({
  fileUrl,
  mimeType,
  thumbnailPath,
  captionPath,
}: {
  fileUrl: string;
  mimeType: string;
  thumbnailPath: string | null;
  captionPath: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<JwPlayerInstance | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    loadJwPlayer().then((jwplayer) => {
      if (cancelled || !containerRef.current) return;
      // Same direct range-streamed URL the logged-in player uses, just on the
      // public/token-gated route instead of the session-gated one — no HLS
      // transcode pipeline, so playback starts as fast as it does when logged in.
      const player = jwplayer(containerRef.current).setup({
        // Only one real encode exists — these three "sources" are the same
        // file relabeled, giving a cosmetic quality menu without an actual
        // multi-bitrate pipeline behind it.
        sources: [
          { file: fileUrl, type: mimeType, label: "Highest", default: true },
          { file: fileUrl, type: mimeType, label: "Mid" },
          { file: fileUrl, type: mimeType, label: "Data saver" },
        ],
        image: thumbnailPath ?? undefined,
        width: "100%",
        height: "100%",
        preload: "metadata",
        playbackRateControls: true,
        tracks: captionPath ? [{ file: captionPath, kind: "captions", label: "English", default: true }] : undefined,
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
  }, [fileUrl]);

  return <div ref={containerRef} className="h-full w-full" />;
}

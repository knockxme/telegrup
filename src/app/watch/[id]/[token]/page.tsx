import { notFound } from "next/navigation";
import { verifyShareToken } from "@/lib/hlsAuth";
import { PublicPlayer } from "@/components/PublicPlayer";

// Public route — no login cookie required. Access is gated purely by the
// share token in the URL (same token the HLS/download links use).
export default async function WatchPage({ params }: { params: Promise<{ id: string; token: string }> }) {
  const { id, token } = await params;
  const file = await verifyShareToken(id, token);
  if (!file || file.kind !== "video") notFound();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col justify-center gap-3 px-6 py-8">
      <h1 className="truncate text-sm text-[var(--text-dim)]">{file.filename}</h1>
      <PublicPlayer
        fileUrl={`/api/public/${id}/${token}`}
        mimeType={file.mimeType}
        thumbnailPath={file.thumbnailPath}
        captionPath={file.captionPath}
      />
    </div>
  );
}

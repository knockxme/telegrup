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
    <div className="flex h-screen w-full flex-col p-3">
      <div className="min-h-0 flex-1">
        <PublicPlayer
          fileUrl={`/api/public/${id}/${token}`}
          mimeType={file.mimeType}
          thumbnailPath={file.thumbnailPath}
          captionPath={file.captionPath}
        />
      </div>
    </div>
  );
}

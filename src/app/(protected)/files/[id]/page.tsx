import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { serializeFile } from "@/lib/serialize";
import { VideoPlayer } from "@/components/VideoPlayer";
import { FileInfoBar } from "@/components/FileInfoBar";
import { ShareLinkPanel } from "@/components/ShareLinkPanel";
import type { ApiFolder } from "@/lib/types";

export default async function FilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [file, folders] = await Promise.all([
    db.file.findUnique({ where: { id } }),
    db.folder.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!file || file.status !== "ready") notFound();

  const apiFile = serializeFile(file);
  const apiFolders: ApiFolder[] = folders.map((f) => ({ id: f.id, name: f.name, createdAt: f.createdAt.toISOString() }));

  return (
    <div className="flex flex-col gap-4">
      <FileInfoBar file={apiFile} folders={apiFolders} />
      {apiFile.kind === "video" ? (
        <VideoPlayer file={apiFile} />
      ) : (
        <a
          href={`/api/stream/${apiFile.id}`}
          className="w-fit rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent-hover)]"
        >
          Download
        </a>
      )}
      <ShareLinkPanel file={apiFile} />
    </div>
  );
}

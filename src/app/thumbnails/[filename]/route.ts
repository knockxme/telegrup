import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { thumbnailAbsPathFor } from "@/lib/thumbnail";

// Next's production static file server snapshots public/ once at boot and
// only matches requests against that snapshot — files written after the
// process started (i.e. every thumbnail, since they're generated at upload
// time) 404 on their real /thumbnails/<id>.jpg URL even though they exist
// on disk. Intercepting the same path with a route handler reads the file
// live on every request instead, so no restart is needed to "pick it up".
export async function GET(_req: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const id = filename.endsWith(".jpg") ? filename.slice(0, -4) : filename;

  // Ids are Prisma cuids (alphanumeric only) — reject anything else outright
  // so a crafted filename (e.g. containing "..") can't escape THUMBNAIL_DIR
  // via thumbnailAbsPathFor's path.join.
  if (!/^[a-z0-9]+$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const data = await readFile(thumbnailAbsPathFor(id));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

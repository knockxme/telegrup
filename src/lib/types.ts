// Client-safe shapes matching the JSON the API routes actually return
// (BigInt fields pre-stringified, no Prisma types leaking into client code).

export interface ApiFile {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: string;
  kind: "video" | "other";
  status: "uploading" | "processing" | "ready" | "failed";
  thumbnailPath: string | null;
  thumbnailUrl: string | null;
  captionPath: string | null;
  durationSeconds: number | null;
  accountId: string;
  folderId: string | null;
  shareToken: string | null;
  hlsAllowedHosts: string[];
  streamUrl: string;
  publicUrl: string | null;
  hlsUrl: string | null;
  createdAt: string;
  updatedAt: string;
  /** Bytes sent to Telegram so far, while status is "processing"; null otherwise. */
  uploadedBytes: number | null;
}

export interface ApiAccount {
  id: string;
  label: string;
  phone: string;
  isPremium: boolean;
  status: "active" | "needs_reauth" | "disabled";
  createdAt: string;
  hasStorageChannel: boolean;
}

export interface ApiFolder {
  id: string;
  name: string;
  createdAt: string;
}

export type ApiKeyRole = "read" | "upload" | "full";

export interface ApiKey {
  id: string;
  label: string;
  keyId: string;
  role: ApiKeyRole;
  createdAt: string;
  lastUsedAt: string | null;
}

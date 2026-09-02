"use client";

import { useState } from "react";
import type { ApiAccount, ApiFile, ApiFolder } from "@/lib/types";
import { UploadPanel } from "@/components/UploadPanel";
import { FolderBar } from "@/components/FolderBar";
import { FileGrid } from "@/components/FileGrid";

interface DashboardProps {
  accounts: ApiAccount[];
  initialFiles: ApiFile[];
  initialFolders: ApiFolder[];
}

export function Dashboard({ accounts, initialFiles, initialFolders }: DashboardProps) {
  const [folders, setFolders] = useState(initialFolders);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <UploadPanel accounts={accounts} folders={folders} />
      <FolderBar
        folders={folders}
        onFoldersChange={setFolders}
        selectedFolderId={selectedFolderId}
        onSelect={setSelectedFolderId}
      />
      <FileGrid initialFiles={initialFiles} folders={folders} selectedFolderId={selectedFolderId} />
    </div>
  );
}

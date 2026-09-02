function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded border border-[var(--border)] bg-black/30 p-3 text-xs">
      <code>{children}</code>
    </pre>
  );
}

function Endpoint({
  method,
  path,
  role,
  desc,
  example,
}: {
  method: string;
  path: string;
  role: "read" | "upload" | "full" | "public";
  desc: string;
  example: string;
}) {
  const roleColor =
    role === "read"
      ? "text-[var(--ok)]"
      : role === "upload"
        ? "text-[var(--accent)]"
        : role === "full"
          ? "text-[var(--danger)]"
          : "text-[var(--text-dim)]";
  return (
    <div className="flex flex-col gap-2 rounded border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-[var(--border)] px-1.5 py-0.5 text-xs font-mono">{method}</span>
        <code className="text-sm">{path}</code>
        <span className={`ml-auto text-xs font-medium ${roleColor}`}>{role === "public" ? "public" : `requires: ${role}`}</span>
      </div>
      <p className="text-sm text-[var(--text-dim)]">{desc}</p>
      <Code>{example}</Code>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="flex flex-col gap-8 pb-16">
      <div>
        <h1 className="text-lg font-semibold">API docs</h1>
        <p className="text-sm text-[var(--text-dim)]">
          Everything below also works with the site&apos;s login cookie (that&apos;s what the dashboard itself uses) — API
          keys are for scripts and other tools. Manage keys on the{" "}
          <a href="/keys" className="text-[var(--accent)] hover:underline">
            API Keys
          </a>{" "}
          page.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Authentication</h2>
        <p className="text-sm text-[var(--text-dim)]">
          Send your key as a bearer token. A key looks like <code>keyId.secret</code> — the whole string is the token.
        </p>
        <Code>{`curl -H "Authorization: Bearer <keyId>.<secret>" https://your-host/api/files`}</Code>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[var(--text-dim)]">
              <th className="pb-1 pr-4">Role</th>
              <th className="pb-1">Can do</th>
            </tr>
          </thead>
          <tbody className="text-[var(--text-dim)]">
            <tr>
              <td className="pr-4 py-0.5 text-[var(--ok)]">read</td>
              <td>List/view files, folders, accounts</td>
            </tr>
            <tr>
              <td className="pr-4 py-0.5 text-[var(--accent)]">upload</td>
              <td>read + upload files, rename/move files, create/rename folders</td>
            </tr>
            <tr>
              <td className="pr-4 py-0.5 text-[var(--danger)]">full</td>
              <td>upload + delete files/folders, manage HLS share links</td>
            </tr>
          </tbody>
        </table>
        <p className="text-sm text-[var(--text-dim)]">
          Telegram account login (phone/2FA) and account edit/delete are dashboard-only — not exposed to API keys, since
          that flow handles live verification codes.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Accounts &amp; folders</h2>
        <Endpoint
          method="GET"
          path="/api/accounts"
          role="read"
          desc="List connected Telegram accounts — you need an accountId to upload."
          example={`curl -H "Authorization: Bearer $KEY" https://your-host/api/accounts`}
        />
        <Endpoint
          method="GET"
          path="/api/folders"
          role="read"
          desc="List folders."
          example={`curl -H "Authorization: Bearer $KEY" https://your-host/api/folders`}
        />
        <Endpoint
          method="POST"
          path="/api/folders"
          role="upload"
          desc="Create a folder. Body: { name }."
          example={`curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d '{"name":"Share"}' https://your-host/api/folders`}
        />
        <Endpoint
          method="PATCH"
          path="/api/folders/:id"
          role="upload"
          desc="Rename a folder. Body: { name }."
          example={`curl -X PATCH -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d '{"name":"New name"}' https://your-host/api/folders/FOLDER_ID`}
        />
        <Endpoint
          method="DELETE"
          path="/api/folders/:id"
          role="full"
          desc="Delete a folder. Files inside are unfiled, not deleted."
          example={`curl -X DELETE -H "Authorization: Bearer $KEY" https://your-host/api/folders/FOLDER_ID`}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Files</h2>
        <Endpoint
          method="GET"
          path="/api/files"
          role="read"
          desc="List all files."
          example={`curl -H "Authorization: Bearer $KEY" https://your-host/api/files`}
        />
        <Endpoint
          method="GET"
          path="/api/files/:id"
          role="read"
          desc="Get one file's metadata — status, size, thumbnailUrl, and (once ready) streamUrl/publicUrl/hlsUrl. publicUrl and hlsUrl are null until the file has a share link (see public=1 below, or the share endpoints)."
          example={`curl -H "Authorization: Bearer $KEY" https://your-host/api/files/FILE_ID`}
        />
        <Endpoint
          method="POST"
          path="/api/files/upload?accountId=&filename=&mimeType=&folderId=&public="
          role="upload"
          desc={`Upload a file. The request BODY is the raw file bytes (not multipart) — this is what lets multi-GB uploads stream straight through without buffering. folderId is optional. Responds 202 immediately with { fileId, status, file } — file already has streamUrl, and if public=1 was set, publicUrl and hlsUrl too (thumbnailUrl stays null until the background send finishes — poll GET /api/files/:id, or just re-check that same field). public=1 requires a 'full' role key (or the site login) since it immediately creates a share link — an 'upload' role key gets a 403 if it tries.`}
          example={`curl -X POST -H "Authorization: Bearer $FULL_KEY" \\
  --data-binary @video.mp4 \\
  "https://your-host/api/files/upload?accountId=ACCOUNT_ID&filename=video.mp4&mimeType=video/mp4&public=1"

# → 202 { "fileId": "...", "status": "processing", "file": {
#     "streamUrl": "/api/stream/...",
#     "publicUrl": "/api/public/FILE_ID/TOKEN",
#     "hlsUrl": "/api/hls/FILE_ID/TOKEN/master.m3u8",
#     "thumbnailUrl": null, ... } }`}
        />
        <Endpoint
          method="PATCH"
          path="/api/files/:id"
          role="upload"
          desc="Rename and/or move a file. Body: { filename?, folderId? } (folderId: null to unfile)."
          example={`curl -X PATCH -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d '{"filename":"new-name.mp4","folderId":null}' https://your-host/api/files/FILE_ID`}
        />
        <Endpoint
          method="DELETE"
          path="/api/files/:id"
          role="full"
          desc="Delete a file — removes it from Telegram too."
          example={`curl -X DELETE -H "Authorization: Bearer $KEY" https://your-host/api/files/FILE_ID`}
        />
        <Endpoint
          method="PUT"
          path="/api/files/:id/thumbnail"
          role="upload"
          desc="Replace a file's thumbnail. Body is the raw image bytes (JPEG)."
          example={`curl -X PUT -H "Authorization: Bearer $KEY" --data-binary @frame.jpg \\
  https://your-host/api/files/FILE_ID/thumbnail`}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">HLS share links</h2>
        <p className="text-sm text-[var(--text-dim)]">
          These manage the link — see below for the actual public playback URLs, which use their own token, not your API
          key.
        </p>
        <Endpoint
          method="POST"
          path="/api/files/:id/share"
          role="full"
          desc="(Re)generate the file's share token — invalidates any previously issued link."
          example={`curl -X POST -H "Authorization: Bearer $KEY" https://your-host/api/files/FILE_ID/share`}
        />
        <Endpoint
          method="PATCH"
          path="/api/files/:id/share"
          role="full"
          desc="Set the allowed-hosts list (Referer/Origin lock). Empty array = any site with the link can play it."
          example={`curl -X PATCH -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d '{"allowedHosts":["example.com"]}' https://your-host/api/files/FILE_ID/share`}
        />
        <Endpoint
          method="DELETE"
          path="/api/files/:id/share"
          role="full"
          desc="Revoke the share link."
          example={`curl -X DELETE -H "Authorization: Bearer $KEY" https://your-host/api/files/FILE_ID/share`}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Playback (not part of the key-authed API)</h2>
        <Endpoint
          method="GET"
          path="/api/stream/:id"
          role="public"
          desc="Range-streamed playback for the dashboard's own player. Requires the site login cookie — not usable with an API key or from another site."
          example={`# used by <video src="/api/stream/FILE_ID"> in the dashboard, with the login cookie`}
        />
        <Endpoint
          method="GET"
          path="/api/hls/:fileId/:token/master.m3u8"
          role="public"
          desc="Public HLS playlist — gated by the file's own share token (from the share endpoints above, or public=1 at upload time), not your API key. Point video.js/hls.js/Safari's native player at this URL from any site (respecting the allowed-hosts lock if set)."
          example={`<video src="https://your-host/api/hls/FILE_ID/SHARE_TOKEN/master.m3u8" controls></video>`}
        />
        <Endpoint
          method="GET"
          path="/api/public/:fileId/:token"
          role="public"
          desc="Public range-streamed access to the original file — same share token and host-lock as the HLS link above, just the raw file instead of HLS segments. Good for direct download links or non-video files. Also gets a 404 until the file has a share link."
          example={`curl "https://your-host/api/public/FILE_ID/SHARE_TOKEN" -o downloaded.mp4
# or:
<a href="https://your-host/api/public/FILE_ID/SHARE_TOKEN">Download</a>`}
        />
      </section>
    </div>
  );
}

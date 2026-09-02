// file.mimeType is uploader-supplied, unvalidated free text. Both file-serving
// routes send it back as Content-Type on the site's own origin — a stored
// "text/html" (or svg/xml/js) MIME would let arbitrary script run same-origin
// against whoever opens the link, including the logged-in owner (the httpOnly
// session cookie can't be read by that script, but it still rides along on
// same-origin fetch(), so the script could still act as the owner).
//
// This is an allowlist, not a denylist: a denylist of "known-dangerous" types
// is a losing game against a fully attacker-controlled string — e.g. an exact
// match on "text/html" is trivially bypassed by "text/html; charset=utf-8"
// (browsers still render it as HTML; the parameter just needs stripping before
// comparison, which a denylist has to remember to do and an allowlist doesn't
// need at all). Anything not explicitly known-benign here falls back to
// application/octet-stream — safe by construction, not by enumeration.
const BENIGN_PREFIXES = ["video/", "audio/", "image/"];

// Carved out of the image/ prefix allowance above: SVG is XML and can carry
// <script>, onload=, etc. — rendering it inline is exactly the same risk as HTML.
const DANGEROUS_ESSENCES = new Set(["image/svg+xml"]);

// Common non-media "other" file types worth letting preview/download as
// themselves rather than falling back to a generic octet-stream.
const BENIGN_EXACT_ESSENCES = new Set([
  "application/pdf",
  "application/octet-stream",
  "text/plain",
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
  "application/gzip",
  "application/x-tar",
  "application/x-7z-compressed",
  "application/vnd.rar",
]);

export function safeContentType(mimeType: string): string {
  // MIME type header syntax is `essence; parameters` (e.g. "text/html; charset=utf-8")
  // — only the essence (type/subtype) governs how a browser renders it.
  const essence = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";

  if (DANGEROUS_ESSENCES.has(essence)) return "application/octet-stream";
  if (BENIGN_EXACT_ESSENCES.has(essence)) return mimeType;
  if (BENIGN_PREFIXES.some((prefix) => essence.startsWith(prefix))) return mimeType;

  return "application/octet-stream";
}

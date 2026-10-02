// Google Drive share URLs (uc?export=view&id=…, /file/d/<id>/view) don't serve
// CORS headers and redirect to an HTML warning page, so browsers can't render
// them in <img>. Route them through the existing drive-proxy-image edge
// function, which streams the bytes with a proper image content-type + CORS.
// Non-Drive URLs (and already-proxied URLs) pass through unchanged.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

function extractDriveFileId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)drive\.google\.com$|googleusercontent\.com$/.test(u.hostname)) {
      return null;
    }
    const byParam = u.searchParams.get("id");
    if (byParam) return byParam;
    const byPath = u.pathname.match(/\/d\/([^/]+)/); // /file/d/<id>/...  or /d/<id>
    return byPath ? byPath[1] : null;
  } catch {
    return null;
  }
}

/** Thumbnail-resolution proxy src for <img>. */
export function driveProxySrc(url: string): string {
  if (!url || url.includes("/functions/v1/drive-proxy-image")) return url;
  const fileId = extractDriveFileId(url);
  return fileId
    ? `${SUPABASE_URL}/functions/v1/drive-proxy-image?fileId=${encodeURIComponent(fileId)}`
    : url;
}

/** Full-resolution proxy URL (for open-in-new-tab / download). */
export function driveProxyFull(url: string): string {
  if (!url) return url;
  if (url.includes("/functions/v1/drive-proxy-image")) {
    return url.includes("full=true") ? url : `${url}&full=true`;
  }
  const fileId = extractDriveFileId(url);
  return fileId
    ? `${SUPABASE_URL}/functions/v1/drive-proxy-image?fileId=${encodeURIComponent(fileId)}&full=true`
    : url;
}

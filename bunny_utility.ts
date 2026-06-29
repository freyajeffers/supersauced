/**
 * Resolves a full Bunny Optimizer / CDN URL for a given relative asset path.
 * 
 * @param path - The relative path to the asset in Bunny Storage (e.g., 'recipes/kale-pesto.jpg').
 * @param width - Optional width to trigger Bunny Optimizer transformations.
 * @returns The absolute URL pointing to the Bunny CDN/Optimizer.
 */
export function getBunnyImageUrl(path: string, width?: number): string {
  // Retrieve the Bunny Pull Zone URL from environment variables.
  // Supports Node.js (process.env), Deno (Deno.env), or a browser global fallback.
  let pullZoneUrl = "";
  
  if (typeof process !== "undefined" && process.env && process.env.NEXT_PUBLIC_BUNNY_URL) {
    pullZoneUrl = process.env.NEXT_PUBLIC_BUNNY_URL;
  } else if (typeof Deno !== "undefined" && typeof Deno.env !== "undefined") {
    pullZoneUrl = Deno.env.get("NEXT_PUBLIC_BUNNY_URL") || "";
  } else if (typeof globalThis !== "undefined" && (globalThis as any).NEXT_PUBLIC_BUNNY_URL) {
    pullZoneUrl = (globalThis as any).NEXT_PUBLIC_BUNNY_URL;
  }

  // Fallback to a production default CDN domain if no env var is configured
  if (!pullZoneUrl) {
    pullZoneUrl = "https://supersauced.b-cdn.net";
  }

  // Ensure clean URL assembly (avoid double slashes or missing slashes)
  const base = pullZoneUrl.endsWith("/") ? pullZoneUrl.slice(0, -1) : pullZoneUrl;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const fullUrl = `${base}${cleanPath}`;

  if (width !== undefined && width > 0) {
    // Bunny Optimizer parameters: width and aspect_ratio
    return `${fullUrl}?width=${width}&aspect_ratio=1:1`;
  }

  return fullUrl;
}

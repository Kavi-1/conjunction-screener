import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import {
  CATALOG_CACHE_SECONDS,
  type CatalogGroup,
  createCelestrakLoader,
  loadCatalogWithFallback,
} from "@/lib/celestrak";

export const dynamic = "force-dynamic";

const loadVisualFromCelestrak = createCelestrakLoader({ group: "visual" });
const loadActiveFromCelestrak = createCelestrakLoader({ group: "active" });
const loadCachedVisualCatalog = unstable_cache(
  () => loadVisualFromCelestrak(),
  ["celestrak-visual-catalog-v1"],
  { revalidate: CATALOG_CACHE_SECONDS },
);
const loadCachedActiveCatalog = unstable_cache(
  () => loadActiveFromCelestrak(),
  ["celestrak-active-catalog-v1"],
  { revalidate: CATALOG_CACHE_SECONDS },
);

function requestedGroup(request: Request): CatalogGroup | null {
  const value = new URL(request.url).searchParams.get("group") ?? "visual";
  return value === "visual" || value === "active" ? value : null;
}

export async function GET(request: Request) {
  const group = requestedGroup(request);
  if (!group) {
    return NextResponse.json(
      { error: "Catalog group must be visual or active." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const catalog = await loadCatalogWithFallback(group, {
      loadVisual: loadCachedVisualCatalog,
      loadActive: loadCachedActiveCatalog,
    });
    return NextResponse.json(catalog, {
      headers: {
        "Cache-Control": `public, max-age=300, s-maxage=${CATALOG_CACHE_SECONDS}, stale-while-revalidate=86400`,
        "X-Catalog-Scope": catalog.fallbackFor ? "visual-fallback" : catalog.group,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Live orbital elements are temporarily unavailable." },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

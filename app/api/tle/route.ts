import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import {
  CATALOG_CACHE_SECONDS,
  createCelestrakLoader,
} from "@/lib/celestrak";

export const dynamic = "force-dynamic";

const loadFromCelestrak = createCelestrakLoader();
const loadCachedCatalog = unstable_cache(
  () => loadFromCelestrak(),
  ["celestrak-visual-catalog-v1"],
  { revalidate: CATALOG_CACHE_SECONDS },
);

export async function GET() {
  try {
    const catalog = await loadCachedCatalog();
    return NextResponse.json(catalog, {
      headers: {
        "Cache-Control": `public, max-age=300, s-maxage=${CATALOG_CACHE_SECONDS}, stale-while-revalidate=86400`,
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

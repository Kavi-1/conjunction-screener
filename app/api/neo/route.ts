import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { createCneosLoader, NEO_CACHE_SECONDS } from "@/lib/cneos";

export const dynamic = "force-dynamic";

const loadFromJpl = createCneosLoader();
const loadCachedApproaches = unstable_cache(
  () => loadFromJpl(),
  ["jpl-cneos-earth-approaches-v1"],
  { revalidate: NEO_CACHE_SECONDS },
);

export async function GET() {
  try {
    return NextResponse.json(await loadCachedApproaches(), {
      headers: {
        "Cache-Control": `public, max-age=300, s-maxage=${NEO_CACHE_SECONDS}, stale-while-revalidate=86400`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "NASA JPL close-approach data is temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

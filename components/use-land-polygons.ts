"use client";

import { useEffect, useState } from "react";

/**
 * Coastlines for the globe, from Natural Earth 1:110m land (public domain).
 * Land only, no national borders: the silhouette is there to locate an object
 * over the Earth, and political boundaries would be noise on an instrument.
 *
 * Served from /public rather than imported so it stays out of the JS bundle,
 * and fetched once per session no matter how many globes ask for it.
 */

export interface LandFeature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
}

const LAND_URL = "/land-110m.geojson";

let cachedFeatures: LandFeature[] | null = null;
let inFlight: Promise<LandFeature[]> | null = null;

function loadLand(): Promise<LandFeature[]> {
  inFlight ??= fetch(LAND_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`Land outlines returned HTTP ${response.status}`);
      return response.json();
    })
    .then((collection: { features?: LandFeature[] }) => {
      cachedFeatures = collection.features ?? [];
      return cachedFeatures;
    });
  return inFlight;
}

/** Returns [] until the outlines arrive; the globe renders fine without them. */
export function useLandPolygons(): LandFeature[] {
  const [features, setFeatures] = useState<LandFeature[]>(cachedFeatures ?? []);

  useEffect(() => {
    if (cachedFeatures) return;
    let active = true;
    loadLand()
      .then((loaded) => {
        if (active) setFeatures(loaded);
      })
      .catch(() => {
        // A globe without coastlines is still a usable globe.
      });
    return () => {
      active = false;
    };
  }, []);

  return features;
}

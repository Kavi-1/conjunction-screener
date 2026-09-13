"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import fixture from "@/fixtures/satellites.json";
import type { SatelliteCatalogPayload } from "@/lib/celestrak";
import type { SatelliteRecord, TleRecord } from "@/lib/propagate";

type CatalogStatus = "loading" | "live" | "fallback";

interface CatalogContextValue {
  records: SatelliteRecord[];
  status: CatalogStatus;
  fetchedAtUtc: string | null;
  stale: boolean;
}

const fixtureRecords = fixture as TleRecord[];
const CatalogContext = createContext<CatalogContextValue | null>(null);
let catalogRequest: Promise<SatelliteCatalogPayload> | null = null;
let requestedAtMs = 0;
const REFRESH_MS = 2 * 60 * 60 * 1_000;

function requestCatalog(): Promise<SatelliteCatalogPayload> {
  if (!catalogRequest || Date.now() - requestedAtMs >= REFRESH_MS) {
    requestedAtMs = Date.now();
    catalogRequest = fetch("/api/tle", {
      headers: { Accept: "application/json" },
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Catalog route returned ${response.status}`);
      const payload = (await response.json()) as unknown;
      if (
        !payload ||
        typeof payload !== "object" ||
        (payload as { source?: unknown }).source !== "celestrak" ||
        !Array.isArray((payload as { satellites?: unknown }).satellites)
      ) {
        throw new Error("Catalog route returned an invalid response");
      }
      return payload as SatelliteCatalogPayload;
    });
    catalogRequest.catch(() => {
      catalogRequest = null;
    });
  }
  return catalogRequest;
}

export function CatalogProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [catalog, setCatalog] = useState<CatalogContextValue>({
    records: fixtureRecords,
    status: "loading",
    fetchedAtUtc: null,
    stale: false,
  });

  useEffect(() => {
    let active = true;
    const refresh = () => { void requestCatalog()
      .then((payload) => {
        if (!active || payload.satellites.length === 0) return;
        setCatalog({
          records: payload.satellites,
          status: payload.offlineFixture ? "fallback" : "live",
          fetchedAtUtc: payload.fetchedAtUtc,
          stale: payload.stale,
        });
      })
      .catch(() => {
        if (active) {
          setCatalog((current) => ({ ...current, stale: true, status: current.status === "live" ? "live" : "fallback" }));
        }
      }); };
    refresh();
    const intervalId = window.setInterval(refresh, REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const value = useMemo(() => catalog, [catalog]);
  return <CatalogContext value={value}>{children}</CatalogContext>;
}

export function useCatalog(): CatalogContextValue {
  const catalog = useContext(CatalogContext);
  if (!catalog) throw new Error("useCatalog must be used within CatalogProvider");
  return catalog;
}

export function CatalogStatus() {
  const { records, stale, status } = useCatalog();
  const label =
    status === "loading"
      ? "Connecting to Celestrak"
      : status === "live"
        ? `${records.length} Celestrak objects${stale ? ", cached" : ""}`
        : `${records.length} fixture objects, live feed unavailable`;

  return (
    <p className="feed-state" data-status={status} aria-live="polite">
      <span aria-hidden="true" /> {label}
    </p>
  );
}

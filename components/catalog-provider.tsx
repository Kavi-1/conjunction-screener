"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import fixture from "@/fixtures/satellites.json";
import type { SatelliteCatalogPayload } from "@/lib/celestrak";
import type { SatelliteRecord, TleRecord } from "@/lib/propagate";
import type { ObserverLocation, SatellitePass } from "@/lib/passes";
import { CATALOG_RETRY_MS, createCatalogClient } from "@/lib/catalog-client";

type CatalogStatus = "loading" | "live" | "fallback";

interface CatalogState {
  records: SatelliteRecord[];
  status: CatalogStatus;
  fetchedAtUtc: string | null;
  stale: boolean;
}

interface CatalogContextValue extends CatalogState {
  selectedCatalogNumber: string | null;
  selectSatellite: (catalogNumber: string) => void;
  preview: { atUtc: Date; observer: ObserverLocation } | null;
  previewPass: (pass: SatellitePass, observer: ObserverLocation) => void;
  returnToLive: () => void;
  refreshCatalog: () => void;
  refreshing: boolean;
}

const fixtureRecords = fixture as TleRecord[];
const CatalogContext = createContext<CatalogContextValue | null>(null);
const requestCatalog = createCatalogClient();

export function CatalogProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [catalog, setCatalog] = useState<CatalogState>({
    records: fixtureRecords,
    status: "loading",
    fetchedAtUtc: null,
    stale: false,
  });
  const [selectedCatalogNumber, setSelectedCatalogNumber] = useState<string | null>(null);
  const [preview, setPreview] = useState<CatalogContextValue["preview"]>(null);
  const [refreshing, setRefreshing] = useState(false);

  const applyCatalog = useCallback((payload: SatelliteCatalogPayload) => {
    setCatalog((current) => payload.offlineFixture && current.status === "live"
      ? { ...current, stale: true }
      : {
          records: payload.satellites,
          status: payload.offlineFixture ? "fallback" : "live",
          fetchedAtUtc: payload.fetchedAtUtc,
          stale: payload.stale,
        });
  }, []);
  const markUnavailable = useCallback(() => {
    setCatalog((current) => ({ ...current, stale: true, status: current.status === "live" ? "live" : "fallback" }));
  }, []);
  const refreshCatalog = useCallback(() => {
    setRefreshing(true);
    void requestCatalog(true).then(applyCatalog).catch(markUnavailable)
      .finally(() => setRefreshing(false));
  }, [applyCatalog, markUnavailable]);

  useEffect(() => {
    let active = true;
    const refresh = () => { void requestCatalog()
      .then((payload) => {
        if (!active || payload.satellites.length === 0) return;
        applyCatalog(payload);
      })
      .catch(() => {
        if (active) {
          markUnavailable();
        }
      }); };
    refresh();
    const intervalId = window.setInterval(refresh, CATALOG_RETRY_MS);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [applyCatalog, markUnavailable]);

  const selectSatellite = useCallback((catalogNumber: string) => {
    setSelectedCatalogNumber(catalogNumber);
    setPreview(null);
  }, []);
  const previewPass = useCallback((pass: SatellitePass, observer: ObserverLocation) => {
    setSelectedCatalogNumber(pass.catalogNumber);
    setPreview({ atUtc: pass.maxElevationAtUtc, observer });
  }, []);
  const returnToLive = useCallback(() => setPreview(null), []);
  const value = useMemo(
    () => ({ ...catalog, selectedCatalogNumber, selectSatellite, preview, previewPass, returnToLive, refreshCatalog, refreshing }),
    [catalog, selectedCatalogNumber, selectSatellite, preview, previewPass, returnToLive, refreshCatalog, refreshing],
  );
  return <CatalogContext value={value}>{children}</CatalogContext>;
}

export function useCatalog(): CatalogContextValue {
  const catalog = useContext(CatalogContext);
  if (!catalog) throw new Error("useCatalog must be used within CatalogProvider");
  return catalog;
}

export function CatalogStatus() {
  const { records, stale, status, refreshCatalog, refreshing } = useCatalog();
  const label =
    status === "loading"
      ? "Loading CelesTrak data…"
      : status === "live"
        ? `${records.length} CelesTrak objects${stale ? ", cached data" : ""}`
        : `${records.length} saved objects. Live data unavailable.`;

  return (
    <p className="feed-state" data-status={status} aria-live="polite">
      <span aria-hidden="true" /> {label}
      {(status === "fallback" || stale) && (
        <button className="catalog-retry" type="button" disabled={refreshing} onClick={refreshCatalog}>
          {refreshing ? "Retrying…" : "Retry"}
        </button>
      )}
    </p>
  );
}

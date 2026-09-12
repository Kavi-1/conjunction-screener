import type { ObserverLocation } from "@/lib/passes";

export const CITY_LOCATIONS: ObserverLocation[] = [
  { label: "Atlanta", latitudeDeg: 33.749, longitudeDeg: -84.388, heightKm: 0.32 },
  { label: "Chicago", latitudeDeg: 41.8781, longitudeDeg: -87.6298, heightKm: 0.18 },
  { label: "Houston", latitudeDeg: 29.7604, longitudeDeg: -95.3698, heightKm: 0.02 },
  { label: "London", latitudeDeg: 51.5072, longitudeDeg: -0.1276, heightKm: 0.02 },
  { label: "Los Angeles", latitudeDeg: 34.0522, longitudeDeg: -118.2437, heightKm: 0.09 },
  { label: "Mexico City", latitudeDeg: 19.4326, longitudeDeg: -99.1332, heightKm: 2.24 },
  { label: "New York", latitudeDeg: 40.7128, longitudeDeg: -74.006, heightKm: 0.01 },
  { label: "Paris", latitudeDeg: 48.8566, longitudeDeg: 2.3522, heightKm: 0.04 },
  { label: "San Francisco", latitudeDeg: 37.7749, longitudeDeg: -122.4194, heightKm: 0.02 },
  { label: "São Paulo", latitudeDeg: -23.5505, longitudeDeg: -46.6333, heightKm: 0.76 },
  { label: "Singapore", latitudeDeg: 1.3521, longitudeDeg: 103.8198, heightKm: 0.02 },
  { label: "Sydney", latitudeDeg: -33.8688, longitudeDeg: 151.2093, heightKm: 0.06 },
  { label: "Tokyo", latitudeDeg: 35.6762, longitudeDeg: 139.6503, heightKm: 0.04 },
];

export function findCityLocation(query: string): ObserverLocation | null {
  const normalized = query.trim().toLocaleLowerCase("en-US");
  return (
    CITY_LOCATIONS.find(
      (city) => city.label.toLocaleLowerCase("en-US") === normalized,
    ) ?? null
  );
}

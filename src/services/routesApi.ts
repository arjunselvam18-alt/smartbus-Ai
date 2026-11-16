/**
 * Google Maps Routes API Client & Polyline Decoder Service
 *
 * Interacts with the backend /api/routes/compute proxy to generate road-following
 * polylines using Google Maps Routes API (directions/v2:computeRoutes).
 *
 * Implements high-performance memory + localStorage caching to minimize redundant API calls.
 */

// In-memory cache for fast lookups during active session
const memoryCache = new Map<string, [number, number][]>();

const LOCAL_STORAGE_KEY = 'smartbus_road_routes_cache_v1';

function getStorageCache(): Record<string, [number, number][]> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStorageCache(key: string, points: [number, number][]) {
  try {
    const cache = getStorageCache();
    // Keep cache bounded to 100 routes to avoid localStorage quota issues
    const keys = Object.keys(cache);
    if (keys.length > 100) {
      delete cache[keys[0]];
    }
    cache[key] = points;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('Failed to persist road route in localStorage:', err);
  }
}

/**
 * Decodes an encoded polyline string into an array of [latitude, longitude] pairs.
 * Compatible with Google Maps Routes API and Directions API encodedPolyline format.
 */
export function decodePolyline(encoded: string): [number, number][] {
  if (!encoded) return [];

  // If google.maps.geometry.encoding is available, prefer official decoder
  if (
    typeof window !== 'undefined' &&
    (window as any).google?.maps?.geometry?.encoding?.decodePath
  ) {
    try {
      const path = (window as any).google.maps.geometry.encoding.decodePath(encoded);
      return path.map((latLng: any) => [latLng.lat(), latLng.lng()] as [number, number]);
    } catch {
      // Fall through to manual decoder
    }
  }

  // Pure JavaScript/TypeScript Google Polyline Decoding Algorithm
  const points: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

export interface ComputeRouteParams {
  origin: [number, number];
  destination: [number, number];
  intermediates?: [number, number][];
  apiKey?: string;
  cacheKey?: string;
  signal?: AbortSignal;
}

export interface ComputeRouteResult {
  success: boolean;
  points: [number, number][];
  distanceMeters?: number;
  duration?: string;
  encodedPolyline?: string;
  isFromCache?: boolean;
  error?: string;
}

/**
 * Computes a road-following route along actual streets using Google Maps Routes API.
 * Automatically checks memory and localStorage caches before calling the API.
 */
export async function computeRoadRoute({
  origin,
  destination,
  intermediates = [],
  apiKey,
  cacheKey,
  signal,
}: ComputeRouteParams): Promise<ComputeRouteResult> {
  const fallbackPoints: [number, number][] = [origin, ...intermediates, destination];

  const derivedKey =
    cacheKey ||
    `route_${origin[0].toFixed(4)}_${origin[1].toFixed(4)}_to_${destination[0].toFixed(4)}_${destination[1].toFixed(4)}_pts${intermediates.length}`;

  // 1. Check in-memory cache
  if (memoryCache.has(derivedKey)) {
    const points = memoryCache.get(derivedKey)!;
    return { success: true, points, isFromCache: true };
  }

  // 2. Check localStorage cache
  const storageCache = getStorageCache();
  if (storageCache[derivedKey] && storageCache[derivedKey].length > 0) {
    const points = storageCache[derivedKey];
    memoryCache.set(derivedKey, points);
    return { success: true, points, isFromCache: true };
  }

  // 3. Request from backend Routes API proxy
  try {
    const response = await fetch('/api/routes/compute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        origin,
        destination,
        intermediates,
        apiKey,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success || !data.encodedPolyline) {
      console.warn('Routes API compute returned non-OK status:', data.error);
      return {
        success: false,
        points: fallbackPoints,
        error: data.error || 'Failed to compute road route',
      };
    }

    // Decode polyline into road-following points
    const decodedPoints = decodePolyline(data.encodedPolyline);

    if (decodedPoints.length > 0) {
      memoryCache.set(derivedKey, decodedPoints);
      saveStorageCache(derivedKey, decodedPoints);

      return {
        success: true,
        points: decodedPoints,
        distanceMeters: data.distanceMeters,
        duration: data.duration,
        encodedPolyline: data.encodedPolyline,
        isFromCache: false,
      };
    }

    return {
      success: true,
      points: fallbackPoints,
    };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw error;
    }
    console.error('Failed to fetch road-following route from Routes API:', error);
    return {
      success: false,
      points: fallbackPoints,
      error: error.message || 'Network error fetching road route',
    };
  }
}

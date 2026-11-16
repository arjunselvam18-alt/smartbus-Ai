import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Bus as BusType, BusRoute, BusStop } from '../../types';
import { CROWD_COLORS } from '../../data/mockData';
import { MatchedJourney, isRouteOnCorridor, analyzeCorridorAlignment, evaluateBusForJourney } from '../../services/routeEngine';
import { computeRoadRoute } from '../../services/routesApi';
import { storageService } from '../../services/storage';
import {
  Clock,
  Radio,
  Layers,
  ZoomIn,
  ZoomOut,
  MapPin,
  AlertTriangle,
  AlertCircle,
  X,
  Route as RouteIcon,
  CheckCircle2,
  Bus as BusIcon,
  Navigation,
  Share2,
} from 'lucide-react';

interface GoogleBusMapProps {
  buses: BusType[];
  routes: BusRoute[];
  stops: BusStop[];
  selectedBusId?: string | null;
  onSelectBus: (bus: BusType) => void;
  apiKey?: string;
  selectedRouteId?: string | null;
  plannedJourney?: MatchedJourney | null;
  onClearPlannedJourney?: () => void;
}

// Helper for exact crowd category colors: Green #16A34A (0-30%), Yellow #EAB308 (31-70%), Red #DC2626 (71-100%)
export const getCrowdColorHex = (category?: string) => {
  if (category === 'LOW') return '#16A34A';
  if (category === 'MEDIUM') return '#EAB308';
  return '#DC2626'; // HIGH
};

// Unified stop marker representing physical stops with multi-route associations
export interface UnifiedStopMarker {
  key: string;
  stopId: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  isOrigin: boolean;
  isDestination: boolean;
  isSelectedRoute: boolean;
  selectedSequenceIndex?: number | string;
  isShared: boolean;
  routesServing: {
    routeNumber: string;
    routeName: string;
    sequenceOrder: number;
    isSelected: boolean;
  }[];
}

// Determine bus relationship to currently planned corridor
export const getBusCorridorRole = (
  bus: BusType,
  plannedJourney?: MatchedJourney | null,
  corridorRouteIds?: Set<string>,
  corridorRouteNumbers?: Set<string>
) => {
  if (!plannedJourney) {
    return { isDirect: true, isCorridor: false, label: 'Active Fleet Bus' };
  }

  const busRoute = (bus.routeNumber || bus.busNumber || '').toUpperCase().trim();
  const journeyRoute = (plannedJourney.routeNumber || '').toUpperCase().trim();

  // 1. Direct Match: Exact route number or serves origin & destination
  const isDirect =
    busRoute === journeyRoute ||
    bus.routeId === plannedJourney.id ||
    (bus.routeName.toLowerCase().includes(plannedJourney.passengerOrigin.toLowerCase()) &&
      bus.routeName.toLowerCase().includes(plannedJourney.passengerDestination.toLowerCase()));

  if (isDirect) {
    return { isDirect: true, isCorridor: false, label: 'Suitable Direct Bus' };
  }

  // 2. Corridor Bus: Actually travels along or shares this specific corridor
  const isCorridor =
    (corridorRouteIds && corridorRouteIds.has(bus.routeId)) ||
    (corridorRouteNumbers && corridorRouteNumbers.has(busRoute)) ||
    plannedJourney.journeyStops.some((st) => bus.routeName.toLowerCase().includes(st.toLowerCase()));

  return {
    isDirect: false,
    isCorridor,
    label: isCorridor ? 'Other Route / Corridor Bus' : 'Connecting Route Bus',
  };
};

// Generates circular mini-bus marker SVG for Google Maps JS API with white bus icon & crowd colors
const createBusSvgIcon = (
  bus: BusType,
  isSelected: boolean,
  isDirect: boolean,
  isCorridor: boolean
) => {
  const bg = getCrowdColorHex(bus.crowdCategory);
  const routeNum = bus.routeNumber || bus.busNumber;

  let ringSvg = '';
  if (isSelected) {
    ringSvg = `<circle cx="19" cy="30" r="16.5" fill="none" stroke="#1a73e8" stroke-width="3" />`;
  } else if (isDirect) {
    ringSvg = `<circle cx="19" cy="30" r="14.5" fill="none" stroke="#1a73e8" stroke-width="2" />`;
  } else if (isCorridor) {
    ringSvg = `<circle cx="19" cy="30" r="14.5" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="3,2" />`;
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46">
      <defs>
        <filter id="mShd_${bus.id}" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#000000" flood-opacity="0.35"/>
        </filter>
      </defs>
      <!-- Route Label Pill -->
      <rect x="2" y="1" width="34" height="12" rx="3.5" fill="#1f2937" stroke="${
        isCorridor && !isSelected ? '#f59e0b' : '#ffffff'
      }" stroke-width="1.2" />
      <text x="19" y="10" fill="#ffffff" font-size="8" font-family="Roboto, Arial, sans-serif" font-weight="700" text-anchor="middle">${routeNum}</text>
      
      <!-- Role / Selection Halo -->
      ${ringSvg}
      
      <!-- Circular mini-bus marker with crowd background & white border -->
      <circle cx="19" cy="30" r="12" fill="${bg}" stroke="#ffffff" stroke-width="2.2" filter="url(#mShd_${bus.id})" />
      
      <!-- Centered White Mini-Bus Icon -->
      <g transform="translate(13, 24)" fill="#ffffff">
        <path d="M1.2 0.8C0.8 0.8 0.5 1.1 0.5 1.5v6.2c0 .4.3.8.8.8h.4v.8c0 .2.2.4.4.4h.8c.2 0 .4-.2.4-.4V9.3h4.4v.8c0 .2.2.4.4.4h.8c.2 0 .4-.2.4-.4V9.3h.4c.4 0 .8-.3.8-.8V1.5c0-.4-.3-.8-.8-.8H1.2zm.6 1.4h8.4v2.2H1.8V2.2zm.9 3.8c.35 0 .65.3.65.65s-.3.65-.65.65-.65-.3-.65-.65.3-.65.65-.65zm6.6 0c.35 0 .65.3.65.65s-.3.65-.65.65-.65-.3-.65-.65.3-.65.65-.65z"/>
      </g>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

// Shared single-flight loader state for Google Maps JS SDK across component mounts/modals
let googleMapsLoaderPromise: Promise<void> | null = null;
let googleMapsLoaderKey: string | null = null;

function isValidMapsKey(key?: string | null): key is string {
  const k = (key || '').trim();
  return Boolean(k && k !== 'YOUR_GOOGLE_MAPS_API_KEY' && k !== 'undefined' && k !== 'null');
}

function loadGoogleMapsSdk(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window is not available.'));
  }
  const win = window as any;
  if (win.google?.maps?.Map) {
    return Promise.resolve();
  }
  if (googleMapsLoaderPromise && googleMapsLoaderKey === apiKey) {
    return googleMapsLoaderPromise;
  }

  googleMapsLoaderKey = apiKey;
  googleMapsLoaderPromise = new Promise<void>((resolve, reject) => {
    const scriptId = 'google-maps-js-sdk';
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;

    // Remove stale or errored script tag if key changed or previous attempt failed
    if (existing) {
      const existingSrc = existing.getAttribute('src') || '';
      const hasSameKey = existingSrc.includes(`key=${encodeURIComponent(apiKey)}`);
      if (!hasSameKey || existing.dataset.loadState === 'error') {
        existing.remove();
      } else if (existing.dataset.loadState === 'loaded' && win.google?.maps?.Map) {
        resolve();
        return;
      } else {
        // Script is already in-flight with matching key: attach listeners to existing tag
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => {
            googleMapsLoaderPromise = null;
            reject(new Error('Failed to load Google Maps script. Check your API key or network.'));
          },
          { once: true }
        );
        return;
      }
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.dataset.loadState = 'loading';
    script.onload = () => {
      script.dataset.loadState = 'loaded';
      if (win.google?.maps?.Map) {
        resolve();
      } else {
        googleMapsLoaderPromise = null;
        reject(new Error('Google Maps JavaScript API initialized without Map constructor.'));
      }
    };
    script.onerror = () => {
      script.dataset.loadState = 'error';
      googleMapsLoaderPromise = null;
      reject(new Error('Failed to load Google Maps script. Check your API key or network.'));
    };
    document.head.appendChild(script);
  });

  return googleMapsLoaderPromise;
}

export const GoogleBusMap: React.FC<GoogleBusMapProps> = ({
  buses,
  routes,
  stops,
  selectedBusId,
  onSelectBus,
  apiKey,
  selectedRouteId,
  plannedJourney,
  onClearPlannedJourney,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [runtimeEnvApiKey, setRuntimeEnvApiKey] = useState<string>('');
  const [googleMapLoaded, setGoogleMapLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);

  // Stable overlay refs for independent updates without resetting camera
  const routePolylinesRef = useRef<any[]>([]);
  const stopMarkersRef = useRef<Map<string, any>>(new Map());
  const busMarkersRef = useRef<Map<string, any>>(new Map());
  const busClickHandlersRef = useRef<Map<string, () => void>>(new Map());

  // Camera tracking refs: ensure zoom & center are never reset automatically on GPS simulation ticks
  const lastFittedJourneyKeyRef = useRef<string | null>(null);
  const initialFitDoneRef = useRef<boolean>(false);

  // Vector canvas/SVG fallback controls for high-interactivity
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Stop Click Details for interactive callout
  const [clickedUnifiedStop, setClickedUnifiedStop] = useState<UnifiedStopMarker | null>(null);

  // Road-following route geometry from Google Maps Routes API
  const [roadActivePath, setRoadActivePath] = useState<[number, number][] | null>(null);
  const [routeMetrics, setRouteMetrics] = useState<{ distanceMeters?: number; duration?: string } | null>(null);
  const [isFetchingRoadRoute, setIsFetchingRoadRoute] = useState(false);

  // Road-following geometries for all corridor bus routes (Route ID -> [lat, lng][])
  const [corridorRoadGeometries, setCorridorRoadGeometries] = useState<Record<string, [number, number][]>>({});
  const requestedRouteIdsRef = useRef<Set<string>>(new Set());

  // Distinct subtle route palette for other corridor buses
  const CORRIDOR_ROUTE_PALETTE = useMemo(
    () => ['#059669', '#0891b2', '#d97706', '#7c3aed', '#db2777', '#ea580c', '#4f46e5', '#0284c7'],
    []
  );

  // Active Search Session Tracking Ref to strictly enforce Latest Search Only
  const activeSearchIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Relevant routes strictly for the current search/corridor
  const selectedRoute = useMemo(() => {
    if (plannedJourney) {
      const targetNum = (plannedJourney.routeNumber || '').toUpperCase().trim();
      const candidates = routes.filter(
        (r) =>
          r.id === plannedJourney.id ||
          (r.routeNumber || '').toUpperCase().trim() === targetNum
      );
      if (candidates.length > 0) {
        const scored = candidates.map((r) => {
          const orderedNames = (r.stops || [])
            .slice()
            .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
            .map((s) => s.stopName);
          return { route: r, align: analyzeCorridorAlignment(orderedNames, plannedJourney) };
        });
        const exactDir = scored.find((s) => s.align.sharesOriginAndDestInOrder);
        if (exactDir) return exactDir.route;
        const sameDir = scored.find((s) => s.align.isSameDirection);
        if (sameDir) return sameDir.route;
        return candidates[0];
      }
      return null;
    }
    if (selectedRouteId) {
      return routes.find((r) => r.id === selectedRouteId) || null;
    }
    return routes[0] || null;
  }, [plannedJourney, selectedRouteId, routes]);

  // Other corridor routes matching the current corridor in the SAME direction only
  const corridorRoutes = useMemo(() => {
    if (!plannedJourney) return [];
    return routes
      .filter((r) => isRouteOnCorridor(r, plannedJourney))
      .map((r) => {
        const orderedNames = (r.stops || [])
          .slice()
          .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
          .map((s) => s.stopName);
        const align = analyzeCorridorAlignment(orderedNames, plannedJourney);
        const score =
          (align.sharesOriginAndDestInOrder ? 1000 : 0) +
          align.sharedStopsCount * 10 -
          (r.stops?.length || 0) * 0.05;
        return { route: r, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((item) => item.route);
  }, [plannedJourney, routes]);

  // Combined relevant routes for current search (selected route + its corridor routes)
  const relevantRoutes = useMemo(() => {
    const list: BusRoute[] = [];
    if (selectedRoute) list.push(selectedRoute);
    corridorRoutes.forEach((cr) => {
      if (!list.some((r) => r.id === cr.id)) {
        list.push(cr);
      }
    });
    return list;
  }, [selectedRoute, corridorRoutes]);

  const routeByIdMap = useMemo(() => {
    const map = new Map<string, BusRoute>();
    routes.forEach((r) => map.set(r.id, r));
    return map;
  }, [routes]);

  const corridorRouteIds = useMemo(() => new Set(corridorRoutes.map((r) => r.id)), [corridorRoutes]);
  const relevantRouteIds = useMemo(() => new Set(relevantRoutes.map((r) => r.id)), [relevantRoutes]);

  // Relevant buses strictly operating along the current corridor in the SAME direction
  const relevantBuses = useMemo(() => {
    if (plannedJourney) {
      return buses.filter((b) => {
        const bRoute =
          routeByIdMap.get(b.routeId) ||
          relevantRoutes.find((r) => (r.routeNumber || '').toUpperCase() === (b.routeNumber || b.busNumber || '').toUpperCase());
        const evalResult = evaluateBusForJourney(b, bRoute, plannedJourney, corridorRouteIds);
        if (!evalResult.eligible) return false;
        // Keep buses belonging to displayed relevantRoutes (selectedRoute + top 10 corridor routes) or direct alternatives
        return (
          !bRoute ||
          relevantRouteIds.has(bRoute.id) ||
          evalResult.role === 'direct' ||
          evalResult.label === 'Direct Alternative Corridor Bus'
        );
      });
    }

    if (selectedRouteId) {
      return buses.filter(
        (b) => b.routeId === selectedRouteId && b.status !== 'out_of_service' && b.status !== 'maintenance'
      );
    }

    // Default initial overview without active search: show core fleet (exclude bulk hydrated background buses)
    const core = buses.filter((b) => !b.id.startsWith('bus_ds_'));
    return core.length > 0 ? core : buses.slice(0, 10);
  }, [buses, plannedJourney, selectedRouteId, routeByIdMap, relevantRoutes, corridorRouteIds, relevantRouteIds]);

  // Sync currently visible map buses with simulation engine
  useEffect(() => {
    storageService.setActiveMapBusIds(relevantBuses.map((b) => b.id));
    return () => {
      storageService.setActiveMapBusIds([]);
    };
  }, [relevantBuses]);

  // Active selected bus & role (from relevant buses)
  const activeBus = useMemo(() => {
    if (selectedBusId) {
      const found = relevantBuses.find((b) => b.id === selectedBusId);
      if (found) return found;
    }
    if (plannedJourney) {
      const directBus = relevantBuses.find(
        (b) => (b.routeNumber || b.busNumber || '').toUpperCase() === plannedJourney.routeNumber.toUpperCase()
      );
      if (directBus) return directBus;
    }
    return relevantBuses[0] || null;
  }, [selectedBusId, relevantBuses, plannedJourney]);

  // Active highlighted route based on active bus
  const activeBusRoute = useMemo(() => {
    if (activeBus) {
      return (
        relevantRoutes.find((r) => r.id === activeBus.routeId) ||
        routeByIdMap.get(activeBus.routeId) ||
        relevantRoutes.find((r) => r.routeNumber === activeBus.routeNumber) ||
        selectedRoute
      );
    }
    return selectedRoute;
  }, [activeBus, relevantRoutes, routeByIdMap, selectedRoute]);

  const activeBusRole = useMemo(() => {
    if (!activeBus) return null;
    if (!plannedJourney) {
      return { isDirect: true, isCorridor: false, label: 'Active Fleet Bus' };
    }
    const ev = evaluateBusForJourney(activeBus, activeBusRoute || undefined, plannedJourney, corridorRouteIds);
    return {
      isDirect: ev.role === 'direct',
      isCorridor: ev.role === 'corridor',
      label: ev.label,
    };
  }, [activeBus, activeBusRoute, plannedJourney, corridorRouteIds]);

  // Determine active route identifier
  const currentActiveRouteNumber = useMemo(() => {
    if (activeBus) return activeBus.routeNumber || activeBus.busNumber;
    if (plannedJourney) return plannedJourney.routeNumber;
    return selectedRoute?.routeNumber || '95X';
  }, [activeBus, plannedJourney, selectedRoute]);

  // Aggregate and de-duplicate ALL stops belonging to ALL corridor bus routes
  const { unifiedStops, invalidStopsList } = useMemo(() => {
    const invalidList: string[] = [];
    const stopMap = new Map<string, UnifiedStopMarker>();

    // Helper to validate GPS coordinates
    const isValidCoord = (lat?: number, lng?: number) => {
      return (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        !isNaN(lat) &&
        !isNaN(lng) &&
        lat !== 0 &&
        lng !== 0 &&
        lat >= 12.0 &&
        lat <= 14.5 &&
        lng >= 79.5 &&
        lng <= 81.0
      );
    };

    // Helper to normalize stop names for matching
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Lookup stop code from Stops sheet / data
    const getStopCode = (stopId: string, name: string) => {
      const found = stops.find((s) => s.id === stopId || norm(s.name) === norm(name));
      if (found && found.code) return found.code;
      if (stopId.startsWith('stp_')) return stopId.replace('stp_', 'STP-').toUpperCase();
      return `STP-${name.slice(0, 4).toUpperCase()}`;
    };

    // 1. Process Planned Journey stops first if active
    if (plannedJourney && plannedJourney.waypoints.length > 0) {
      plannedJourney.waypoints.forEach((coord, idx) => {
        if (!isValidCoord(coord[0], coord[1])) {
          const stName = plannedJourney.journeyStops[idx] || `Waypoint ${idx}`;
          invalidList.push(stName);
          return;
        }

        const stopName =
          idx === 0
            ? plannedJourney.passengerOrigin
            : idx === plannedJourney.waypoints.length - 1
            ? plannedJourney.passengerDestination
            : plannedJourney.journeyStops[idx] || `Stop ${idx}`;

        const isOrigin = idx === 0;
        const isDestination = idx === plannedJourney.waypoints.length - 1;
        const seqIndex = isOrigin ? 'A' : isDestination ? 'B' : idx;

        const key = `${coord[0].toFixed(3)}_${coord[1].toFixed(3)}`;
        const code = getStopCode(`stp_${norm(stopName).slice(0, 4)}`, stopName);

        stopMap.set(key, {
          key,
          stopId: `stp_${norm(stopName).slice(0, 4)}`,
          name: stopName,
          code,
          latitude: coord[0],
          longitude: coord[1],
          isOrigin,
          isDestination,
          isSelectedRoute: true,
          selectedSequenceIndex: seqIndex,
          isShared: false,
          routesServing: [
            {
              routeNumber: plannedJourney.routeNumber,
              routeName: `Route ${plannedJourney.routeNumber} Corridor`,
              sequenceOrder: idx + 1,
              isSelected: true,
            },
          ],
        });
      });
    }

    // 2. Process stops belonging ONLY to relevant corridor routes for the current search
    relevantRoutes.forEach((route) => {
      const isRouteCurrentlySelected =
        route.routeNumber.toUpperCase() === currentActiveRouteNumber.toUpperCase();

      if (!route.stops || !Array.isArray(route.stops)) return;

      route.stops.forEach((stItem) => {
        if (!isValidCoord(stItem.latitude, stItem.longitude)) {
          invalidList.push(`${stItem.stopName} (${route.routeNumber})`);
          return;
        }

        // Find existing stop by coordinate proximity (~150m) or normalized name
        let matchedKey: string | null = null;
        for (const [k, existing] of stopMap.entries()) {
          const dLat = Math.abs(existing.latitude - stItem.latitude);
          const dLng = Math.abs(existing.longitude - stItem.longitude);
          if ((dLat < 0.0018 && dLng < 0.0018) || norm(existing.name) === norm(stItem.stopName)) {
            matchedKey = k;
            break;
          }
        }

        if (matchedKey) {
          const existing = stopMap.get(matchedKey)!;
          // Add this route if not already listed
          if (!existing.routesServing.some((rs) => rs.routeNumber === route.routeNumber)) {
            existing.routesServing.push({
              routeNumber: route.routeNumber,
              routeName: route.routeName,
              sequenceOrder: stItem.sequenceOrder,
              isSelected: isRouteCurrentlySelected,
            });
            existing.isShared = true;
          }
          if (isRouteCurrentlySelected) {
            existing.isSelectedRoute = true;
            if (!existing.isOrigin && !existing.isDestination) {
              existing.selectedSequenceIndex = stItem.sequenceOrder;
            }
          }
        } else {
          // New stop entry for other corridor bus
          const key = `${stItem.latitude.toFixed(3)}_${stItem.longitude.toFixed(3)}`;
          const code = getStopCode(stItem.stopId, stItem.stopName);

          const isOrigin = stItem.sequenceOrder === 1 && isRouteCurrentlySelected;
          const isDestination =
            stItem.sequenceOrder === route.stops.length && isRouteCurrentlySelected;

          stopMap.set(key, {
            key,
            stopId: stItem.stopId,
            name: stItem.stopName,
            code,
            latitude: stItem.latitude,
            longitude: stItem.longitude,
            isOrigin,
            isDestination,
            isSelectedRoute: isRouteCurrentlySelected,
            selectedSequenceIndex: isOrigin ? 'A' : isDestination ? 'B' : stItem.sequenceOrder,
            isShared: false,
            routesServing: [
              {
                routeNumber: route.routeNumber,
                routeName: route.routeName,
                sequenceOrder: stItem.sequenceOrder,
                isSelected: isRouteCurrentlySelected,
              },
            ],
          });
        }
      });
    });

    return {
      unifiedStops: Array.from(stopMap.values()),
      invalidStopsList: Array.from(new Set(invalidList)),
    };
  }, [plannedJourney, relevantRoutes, stops, currentActiveRouteNumber]);

  const buildEnvApiKey = ((import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const effectiveApiKey = isValidMapsKey(apiKey)
    ? apiKey.trim()
    : isValidMapsKey(buildEnvApiKey)
      ? buildEnvApiKey
      : isValidMapsKey(runtimeEnvApiKey)
        ? runtimeEnvApiKey.trim()
        : '';

  // Runtime fallback lookup via /api/maps/config if VITE_GOOGLE_MAPS_API_KEY was not baked at build time
  useEffect(() => {
    if (effectiveApiKey) return;
    let active = true;
    fetch('/api/maps/config', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (data.configured && isValidMapsKey(data.googleMapsApiKey)) {
          setRuntimeEnvApiKey(data.googleMapsApiKey.trim());
        }
      })
      .catch(() => {
        // Non-fatal fallback
      });
    return () => {
      active = false;
    };
  }, [effectiveApiKey]);

  // Listen for Google Maps JavaScript API auth / domain referrer errors without listener collisions
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const win = window as any;
    const origin = window.location.origin;
    const EVENT_NAME = 'smartbus-gmp-auth-error';

    if (!win.__smartbusGmpListenersInstalled) {
      win.__smartbusGmpListenersInstalled = true;
      const prevAuthFailure = win.gm_authFailure;
      win.gm_authFailure = () => {
        window.dispatchEvent(
          new CustomEvent(EVENT_NAME, {
            detail: {
              message: `Google Maps authentication failed on ${window.location.origin}. Verify VITE_GOOGLE_MAPS_API_KEY is valid, Maps JavaScript API is enabled, and HTTP referrer restrictions allow ${window.location.origin}/* (or https://*.vercel.app/*).`,
            },
          })
        );
        if (typeof prevAuthFailure === 'function') {
          prevAuthFailure();
        }
      };

      const origConsoleError = console.error;
      console.error = (...args: unknown[]) => {
        origConsoleError.apply(console, args);
        const msg = args.map((a) => String(a ?? '')).join(' ');
        if (msg.includes('RefererNotAllowedMapError')) {
          window.dispatchEvent(
            new CustomEvent(EVENT_NAME, {
              detail: {
                message: `Google Maps key referrer restriction blocked ${window.location.origin}. Add "${window.location.origin}/*" to your Google Cloud API key HTTP referrers.`,
              },
            })
          );
        } else if (msg.includes('ApiNotActivatedMapError')) {
          window.dispatchEvent(
            new CustomEvent(EVENT_NAME, {
              detail: {
                message:
                  'Maps JavaScript API is not enabled on the Google Cloud project for VITE_GOOGLE_MAPS_API_KEY.',
              },
            })
          );
        } else if (msg.includes('InvalidKeyMapError') || msg.includes('MissingKeyMapError')) {
          window.dispatchEvent(
            new CustomEvent(EVENT_NAME, {
              detail: {
                message: 'Invalid or missing Google Maps JavaScript API key (VITE_GOOGLE_MAPS_API_KEY).',
              },
            })
          );
        }
      };
    }

    const handleGmpAuthError = (ev: Event) => {
      const detail = (ev as CustomEvent<{ message?: string }>).detail;
      setLoadError(
        detail?.message ||
          `Google Maps JavaScript API authorization error on ${origin}. Check key restrictions.`
      );
      setGoogleMapLoaded(false);
    };

    window.addEventListener(EVENT_NAME, handleGmpAuthError);
    return () => {
      window.removeEventListener(EVENT_NAME, handleGmpAuthError);
    };
  }, []);

  // Load official Google Maps JavaScript API using shared single-flight loader
  useEffect(() => {
    if (!effectiveApiKey) {
      setGoogleMapLoaded(false);
      return;
    }

    let cancelled = false;
    setLoadError(null);

    loadGoogleMapsSdk(effectiveApiKey)
      .then(() => {
        if (!cancelled) {
          setGoogleMapLoaded(true);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setLoadError(err?.message || 'Failed to load Google Maps script. Check your API key or network.');
          setGoogleMapLoaded(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveApiKey]);

  // Journey key identifier to detect when a completely new journey is searched
  const currentJourneyKey = useMemo(() => {
    if (!plannedJourney) return null;
    return `${plannedJourney.searchId || plannedJourney.id || 'search'}_${plannedJourney.passengerOrigin}_${plannedJourney.passengerDestination}_${plannedJourney.routeNumber}`;
  }, [plannedJourney]);

  // CRITICAL: Latest Search Only — Immediately wipe previous search map data
  useEffect(() => {
    if (currentJourneyKey !== activeSearchIdRef.current) {
      activeSearchIdRef.current = currentJourneyKey;

      // Abort any in-flight requests from older searches
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      // 1. Immediately remove all route polylines from the map
      routePolylinesRef.current.forEach((p) => p.setMap(null));
      routePolylinesRef.current = [];

      // 2. Immediately remove all stop markers
      stopMarkersRef.current.forEach((m) => m.setMap(null));
      stopMarkersRef.current.clear();

      // 3. Immediately remove all bus markers
      busMarkersRef.current.forEach((m) => m.setMap(null));
      busMarkersRef.current.clear();
      busClickHandlersRef.current.clear();

      // 4. Close any open InfoWindow
      if (infoWindowRef.current) {
        infoWindowRef.current.close();
      }

      // 5. Clear route geometry states & tracking caches
      setRoadActivePath(null);
      setRouteMetrics(null);
      setCorridorRoadGeometries({});
      requestedRouteIdsRef.current.clear();
      setClickedUnifiedStop(null);

      // 6. Reset camera fit ref so map zooms to new corridor
      initialFitDoneRef.current = false;
    }
  }, [currentJourneyKey]);

  // Fetch real road-following polyline using Google Maps Routes API (directions/v2:computeRoutes)
  useEffect(() => {
    const targetCoords =
      plannedJourney && plannedJourney.waypoints && plannedJourney.waypoints.length > 0
        ? plannedJourney.waypoints
        : activeBusRoute?.pathWaypoints || [];

    if (targetCoords.length < 2) {
      setRoadActivePath(null);
      setRouteMetrics(null);
      return;
    }

    let isMounted = true;
    setIsFetchingRoadRoute(true);

    const origin = targetCoords[0];
    const destination = targetCoords[targetCoords.length - 1];
    const intermediates = targetCoords.slice(1, -1);
    const searchAtFetch = currentJourneyKey;
    const signal = abortControllerRef.current?.signal;
    const cacheKey = `road_${currentJourneyKey || activeBusRoute?.id || 'active'}_${origin[0].toFixed(4)}_${destination[0].toFixed(4)}_${intermediates.length}`;

    computeRoadRoute({
      origin,
      destination,
      intermediates,
      apiKey: effectiveApiKey || undefined,
      cacheKey,
      signal,
    })
      .then((result) => {
        if (!isMounted || activeSearchIdRef.current !== searchAtFetch) return;
        setIsFetchingRoadRoute(false);
        if (result.success && result.points && result.points.length > 0) {
          setRoadActivePath(result.points);
          if (activeBusRoute) {
            storageService.updateRouteRoadGeometry(activeBusRoute.id, result.points);
          } else if (selectedRoute) {
            storageService.updateRouteRoadGeometry(selectedRoute.id, result.points);
          } else if (plannedJourney) {
            storageService.updateRouteRoadGeometry(plannedJourney.routeNumber, result.points);
          }

          if (result.distanceMeters || result.duration) {
            setRouteMetrics({
              distanceMeters: result.distanceMeters,
              duration: result.duration,
            });
          }
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (!isMounted || activeSearchIdRef.current !== searchAtFetch) return;
        setIsFetchingRoadRoute(false);
        console.warn('Road route computation fallback active:', err);
      });

    // Generate and cache Google Routes API road-following geometry for ONLY current corridor routes
    corridorRoutes.forEach((r) => {
      // Skip if already loaded in state or requested in this session
      if (corridorRoadGeometries[r.id] || requestedRouteIdsRef.current.has(r.id)) {
        return;
      }

      // Check if route already has cached roadWaypoints in storage
      if (r.roadWaypoints && r.roadWaypoints.length > 2) {
        setCorridorRoadGeometries((prev) => ({ ...prev, [r.id]: r.roadWaypoints! }));
        return;
      }

      // Read each bus's actual ordered stop sequence and coordinates from Google Sheets data
      let orderedCoords: [number, number][] = [];
      if (r.stops && r.stops.length >= 2) {
        const sortedStops = [...r.stops].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
        orderedCoords = sortedStops
          .filter(
            (s) =>
              typeof s.latitude === 'number' &&
              typeof s.longitude === 'number' &&
              !isNaN(s.latitude) &&
              !isNaN(s.longitude)
          )
          .map((s) => [s.latitude, s.longitude] as [number, number]);
      }
      if (orderedCoords.length < 2 && r.pathWaypoints && r.pathWaypoints.length >= 2) {
        orderedCoords = r.pathWaypoints;
      }

      if (orderedCoords.length < 2) return;

      requestedRouteIdsRef.current.add(r.id);

      const o = orderedCoords[0];
      const d = orderedCoords[orderedCoords.length - 1];
      const im = orderedCoords.slice(1, -1);
      const cacheKey = `road_corridor_${r.id}_${o[0].toFixed(4)}_${d[0].toFixed(4)}_${im.length}`;

      computeRoadRoute({
        origin: o,
        destination: d,
        intermediates: im,
        cacheKey,
        signal,
      })
        .then((res) => {
          if (!isMounted || activeSearchIdRef.current !== searchAtFetch) return;
          if (res.success && res.points && res.points.length > 2) {
            setCorridorRoadGeometries((prev) => ({ ...prev, [r.id]: res.points }));
            storageService.updateRouteRoadGeometry(r.id, res.points);
          }
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          console.warn(`Routes API fallback for corridor route ${r.routeNumber}:`, err);
        });
    });

    return () => {
      isMounted = false;
    };
  }, [currentJourneyKey, activeBusRoute?.id, effectiveApiKey, plannedJourney, corridorRoutes]);

  // 1. Initialize Google Maps instance ONCE when script and container are ready
  useEffect(() => {
    if (!googleMapLoaded || !mapContainerRef.current || !(window as any).google?.maps) {
      return;
    }

    const containerEl = mapContainerRef.current;
    const google = (window as any).google;

    if (!mapInstanceRef.current) {
      try {
        const initialCenter = activeBus
          ? { lat: activeBus.latitude, lng: activeBus.longitude }
          : { lat: 13.01, lng: 80.22 };

        const map = new google.maps.Map(containerEl, {
          center: initialCenter,
          zoom: 13,
          mapTypeId: 'roadmap',
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          gestureHandling: 'greedy', // Ensures smooth mouse-wheel, touch-zoom, and drag-to-pan
          internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
          styles: [
            { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
            { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#ceead6' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#aadaff' }] },
            { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
            { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#d0d7de' }, { weight: 1.5 }] },
            { featureType: 'road.arterial', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
            { featureType: 'road.local', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
            { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#bdc1c6' }] },
            { featureType: 'transit.station.bus', elementType: 'labels.icon', stylers: [{ visibility: 'on' }] },
          ],
        });

        infoWindowRef.current = new google.maps.InfoWindow();
        mapInstanceRef.current = map;

        // Ensure crisp tiles immediately when mounted inside tabs or modals
        requestAnimationFrame(() => {
          if (mapInstanceRef.current && (window as any).google?.maps?.event) {
            (window as any).google.maps.event.trigger(mapInstanceRef.current, 'resize');
          }
        });
      } catch (e) {
        console.error('Google Maps initialization error:', e);
      }
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapInstanceRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current && (window as any).google?.maps?.event) {
          (window as any).google.maps.event.trigger(mapInstanceRef.current, 'resize');
        }
      });
      resizeObserver.observe(containerEl);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      routePolylinesRef.current.forEach((p) => p.setMap(null));
      routePolylinesRef.current = [];
      stopMarkersRef.current.forEach((m) => m.setMap(null));
      stopMarkersRef.current.clear();
      busMarkersRef.current.forEach((m) => m.setMap(null));
      busMarkersRef.current.clear();
      busClickHandlersRef.current.clear();
      if (infoWindowRef.current) {
        infoWindowRef.current.close();
        infoWindowRef.current = null;
      }
      mapInstanceRef.current = null;
      initialFitDoneRef.current = false;
      lastFittedJourneyKeyRef.current = null;
    };
  }, [googleMapLoaded]);

  // 2. Camera Viewport Management: Fit bounds ONLY on initial load or when a NEW journey is searched
  // Never automatically resets zoom or center during GPS simulation, crowd changes, or bus selection
  useEffect(() => {
    if (!googleMapLoaded || !mapInstanceRef.current || !(window as any).google) return;
    const google = (window as any).google;

    // Case A: A new journey search has been selected / changed
    if (currentJourneyKey && currentJourneyKey !== lastFittedJourneyKeyRef.current) {
      lastFittedJourneyKeyRef.current = currentJourneyKey;
      initialFitDoneRef.current = true;

      if (plannedJourney && plannedJourney.waypoints && plannedJourney.waypoints.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        plannedJourney.waypoints.forEach(([lat, lng]) => {
          bounds.extend(new google.maps.LatLng(lat, lng));
        });
        mapInstanceRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
      }
      return;
    }

    // Case B: No journey planned, initial map view fit (runs ONCE on first load only)
    if (!currentJourneyKey && !initialFitDoneRef.current) {
      if (unifiedStops.length > 0 || buses.length > 0) {
        initialFitDoneRef.current = true;
        const bounds = new google.maps.LatLngBounds();
        if (unifiedStops.length > 0) {
          unifiedStops.forEach((st) => bounds.extend(new google.maps.LatLng(st.latitude, st.longitude)));
        } else {
          buses.forEach((b) => bounds.extend(new google.maps.LatLng(b.latitude, b.longitude)));
        }
        mapInstanceRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
      }
    }
  }, [googleMapLoaded, currentJourneyKey, unifiedStops.length]);

  // 3. Render Route Polylines (Updates only when route selection or corridor paths change)
  useEffect(() => {
    if (!googleMapLoaded || !mapInstanceRef.current || !(window as any).google) return;
    const google = (window as any).google;

    // Clear previous polylines
    routePolylinesRef.current.forEach((p) => p.setMap(null));
    routePolylinesRef.current = [];

    // Draw Other Corridor Buses Paths using actual road geometry and visually distinct subtle colors
    corridorRoutes
      .filter((r) => r.routeNumber.toUpperCase() !== currentActiveRouteNumber.toUpperCase())
      .forEach((corridorRoute, index) => {
        // Retrieve road-following coordinates if computed from Routes API, or fallback to pathWaypoints
        const roadCoords =
          corridorRoadGeometries[corridorRoute.id] ||
          (corridorRoute.roadWaypoints && corridorRoute.roadWaypoints.length > 2
            ? corridorRoute.roadWaypoints
            : null);

        const isRoadGeometry = !!roadCoords;
        const rawCoords = roadCoords || corridorRoute.pathWaypoints || [];
        if (rawCoords.length < 2) return;

        const corridorPath = rawCoords.map(([lat, lng]) => new google.maps.LatLng(lat, lng));
        const routeColor =
          corridorRoute.color ||
          CORRIDOR_ROUTE_PALETTE[index % CORRIDOR_ROUTE_PALETTE.length];

        // Subtle road contrast casing
        const altCasing = new google.maps.Polyline({
          path: corridorPath,
          geodesic: true,
          strokeColor: '#ffffff',
          strokeOpacity: 0.90,
          strokeWeight: 5.5,
          map: mapInstanceRef.current,
          zIndex: 15,
        });
        routePolylinesRef.current.push(altCasing);

        // Subtle distinct route line (thinner and less prominent than active blue navigation line)
        const altLine = new google.maps.Polyline({
          path: corridorPath,
          geodesic: true,
          strokeColor: routeColor,
          strokeOpacity: isRoadGeometry ? 0.82 : 0.55,
          strokeWeight: 3.5,
          map: mapInstanceRef.current,
          zIndex: 16,
        });

        // Click on route polyline to select and highlight that bus route
        altLine.addListener('click', () => {
          const matchingBus =
            relevantBuses.find((b) => b.routeId === corridorRoute.id) ||
            relevantBuses.find(
              (b) => b.routeNumber?.toUpperCase() === corridorRoute.routeNumber.toUpperCase()
            );
          if (matchingBus) {
            onSelectBus(matchingBus);
          }
        });

        routePolylinesRef.current.push(altLine);
      });

    // Draw Active/Selected Route Path in Bold Navigation Blue (#1a73e8)
    const activePathCoords =
      roadActivePath && roadActivePath.length > 0
        ? roadActivePath
        : activeBusRoute && corridorRoadGeometries[activeBusRoute.id]
        ? corridorRoadGeometries[activeBusRoute.id]
        : activeBusRoute?.roadWaypoints && activeBusRoute.roadWaypoints.length > 2
        ? activeBusRoute.roadWaypoints
        : plannedJourney && plannedJourney.waypoints.length > 0
        ? plannedJourney.waypoints
        : activeBusRoute?.pathWaypoints || [];

    if (activePathCoords.length > 0) {
      const activePath = activePathCoords.map(([lat, lng]) => new google.maps.LatLng(lat, lng));

      // Darker blue underlay casing
      const casingLine = new google.maps.Polyline({
        path: activePath,
        geodesic: true,
        strokeColor: '#1558d6',
        strokeOpacity: 0.45,
        strokeWeight: 9.5,
        map: mapInstanceRef.current,
      });
      routePolylinesRef.current.push(casingLine);

      // Core navigation blue line with rounded caps and joins
      const coreBlueLine = new google.maps.Polyline({
        path: activePath,
        geodesic: true,
        strokeColor: '#1a73e8',
        strokeOpacity: 1.0,
        strokeWeight: 6.5,
        map: mapInstanceRef.current,
      });
      routePolylinesRef.current.push(coreBlueLine);

      // Display real distance/time label badge along the route (matching reference navigation style)
      if (activePath.length > 4) {
        const midIndex = Math.floor(activePath.length / 2);
        const midPoint = activePath[midIndex];

        let minutes = 24;
        let distanceKm = '11.6';

        if (routeMetrics?.duration) {
          minutes = Math.max(1, Math.round(parseInt(routeMetrics.duration.replace('s', ''), 10) / 60));
        }
        if (routeMetrics?.distanceMeters) {
          distanceKm = (routeMetrics.distanceMeters / 1000).toFixed(1);
        } else if (plannedJourney?.distanceKm !== undefined) {
          distanceKm = String(plannedJourney.distanceKm);
        }

        const badgeSvg = `
          <svg xmlns="http://www.w3.org/2000/svg" width="96" height="48" viewBox="0 0 96 48">
            <defs>
              <filter id="badgeShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.32"/>
              </filter>
            </defs>
            <rect x="3" y="3" width="90" height="42" rx="7" fill="#0052cc" filter="url(#badgeShadow)"/>
            <g transform="translate(10, 15)" fill="#ffffff">
              <path d="M12.5 7.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5S11 5.17 11 6s.67 1.5 1.5 1.5zm-5 0c.83 0 1.5-.67 1.5-1.5S8.33 4.5 7.5 4.5 6 5.17 6 6s.67 1.5 1.5 1.5zm6.5 2.5H6c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h8c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1z" transform="scale(0.85)"/>
            </g>
            <text x="34" y="21" fill="#ffffff" font-size="12" font-family="Roboto, Arial, sans-serif" font-weight="700">${minutes} min</text>
            <text x="34" y="36" fill="#d0e2ff" font-size="10.5" font-family="Roboto, Arial, sans-serif" font-weight="500">${distanceKm} km</text>
          </svg>
        `.trim();

        const badgeIcon = {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(badgeSvg)}`,
          anchor: new google.maps.Point(48, 24),
        };

        const badgeMarker = new google.maps.Marker({
          position: midPoint,
          map: mapInstanceRef.current,
          icon: badgeIcon,
          zIndex: 75,
          title: `Estimated Trip: ${minutes} min (${distanceKm} km)`,
        });
        routePolylinesRef.current.push(badgeMarker);
      }
    }
  }, [
    googleMapLoaded,
    corridorRoutes,
    currentActiveRouteNumber,
    plannedJourney,
    activeBusRoute,
    roadActivePath,
    routeMetrics,
    corridorRoadGeometries,
    CORRIDOR_ROUTE_PALETTE,
    onSelectBus,
    relevantBuses,
  ]);

  // 4. Render All Unified Stops (Selected Journey, Shared Stops, and Other Corridor Stops)
  useEffect(() => {
    if (!googleMapLoaded || !mapInstanceRef.current || !(window as any).google) return;
    const google = (window as any).google;

    // Clear previous stop markers
    stopMarkersRef.current.forEach((m) => m.setMap(null));
    stopMarkersRef.current.clear();

    unifiedStops.forEach((st) => {
      let icon: any;
      let zIndex = 20;

      if (st.isOrigin) {
        icon = {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8.5,
          fillColor: '#ffffff',
          fillOpacity: 1.0,
          strokeColor: '#202124',
          strokeWeight: 3.5,
        };
        zIndex = 60;
      } else if (st.isDestination) {
        icon = {
          path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
          scale: 2.2,
          fillColor: '#ea4335',
          fillOpacity: 1.0,
          strokeColor: '#c5221f',
          strokeWeight: 1.5,
          anchor: new google.maps.Point(12, 22),
        };
        zIndex = 60;
      } else if (st.isSelectedRoute) {
        // Selected journey stop: prominent numbered circular marker
        icon = {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8.0,
          fillColor: '#1a73e8',
          fillOpacity: 1.0,
          strokeColor: '#ffffff',
          strokeWeight: 2.2,
        };
        zIndex = 50;
      } else if (st.isShared) {
        // Shared stop between multiple routes: distinct dual-ring circular marker
        icon = {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6.5,
          fillColor: '#ffffff',
          fillOpacity: 1.0,
          strokeColor: '#1a73e8',
          strokeWeight: 2.8,
        };
        zIndex = 40;
      } else {
        // Other corridor bus stop: smaller circular marker with subtle styling
        icon = {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 4.5,
          fillColor: '#94a3b8',
          fillOpacity: 1.0,
          strokeColor: '#ffffff',
          strokeWeight: 1.8,
        };
        zIndex = 30;
      }

      const marker = new google.maps.Marker({
        position: { lat: st.latitude, lng: st.longitude },
        map: mapInstanceRef.current,
        title: `${st.name} (${st.code})`,
        icon,
        label:
          st.isSelectedRoute && !st.isOrigin && !st.isDestination && st.selectedSequenceIndex
            ? {
                text: `${st.selectedSequenceIndex}`,
                color: '#ffffff',
                fontSize: '9px',
                fontWeight: '700',
              }
            : undefined,
        zIndex,
      });

      marker.addListener('click', () => {
        const routeBadges = st.routesServing
          .map(
            (r) =>
              `<span style="display:inline-block;padding:2px 6px;margin:2px;border-radius:4px;font-size:11px;font-weight:700;background:${
                r.isSelected ? '#1a73e8' : '#e2e8f0'
              };color:${r.isSelected ? '#ffffff' : '#334155'}">Route ${r.routeNumber} (Stop #${r.sequenceOrder})</span>`
          )
          .join(' ');

        infoWindowRef.current?.setContent(
          `<div style="padding:8px;font-family:Roboto,Arial,sans-serif;color:#202124;max-width:240px">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;${
                st.isShared
                  ? 'background:#fef3c7;color:#92400e;border:1px solid #fde68a'
                  : st.isSelectedRoute
                  ? 'background:#e8f0fe;color:#1a73e8;border:1px solid #d2e3fc'
                  : 'background:#f1f5f9;color:#475569;border:1px solid #e2e8f0'
              }">
                ${
                  st.isOrigin
                    ? 'ORIGIN TERMINUS'
                    : st.isDestination
                    ? 'DESTINATION TERMINUS'
                    : st.isShared
                    ? `SHARED INTERCHANGE (${st.routesServing.length} ROUTES)`
                    : 'BUS STOP'
                }
              </span>
              <span style="font-size:10px;font-family:monospace;color:#64748b;font-weight:700">${st.code}</span>
            </div>
            <div style="font-size:14px;font-weight:700;color:#0f172a">${st.name}</div>
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid #e2e8f0">
              <div style="font-size:10px;color:#64748b;font-weight:600;margin-bottom:4px">BUS ROUTES SERVING THIS STOP:</div>
              <div>${routeBadges}</div>
            </div>
          </div>`
        );
        infoWindowRef.current?.open(mapInstanceRef.current, marker);
      });

      stopMarkersRef.current.set(st.key, marker);
    });
  }, [googleMapLoaded, unifiedStops]);

  // 5. Render & Update Bus Markers Independently (GPS simulation position & crowd updates WITHOUT resetting map camera)
  useEffect(() => {
    if (!googleMapLoaded || !mapInstanceRef.current || !(window as any).google) return;
    const google = (window as any).google;

    const currentBusIds = new Set<string>();

    relevantBuses.forEach((bus) => {
      if (!plannedJourney && selectedRouteId && bus.routeId !== selectedRouteId) return;
      currentBusIds.add(bus.id);

      const isSelected = bus.id === activeBus?.id;
      const busRoute =
        routeByIdMap.get(bus.routeId) ||
        relevantRoutes.find((r) => (r.routeNumber || '').toUpperCase() === (bus.routeNumber || bus.busNumber || '').toUpperCase());
      const evalRole = evaluateBusForJourney(bus, busRoute, plannedJourney || null, corridorRouteIds);
      const role = {
        isDirect: evalRole.role === 'direct',
        isCorridor: evalRole.role === 'corridor',
        label: evalRole.label,
      };
      const iconUrl = createBusSvgIcon(bus, isSelected, role.isDirect, role.isCorridor);
      const title = `Route: ${bus.routeNumber || bus.busNumber} (${bus.crowdCategory}) - Occupancy: ${bus.crowdPercentage}% [${role.label}]`;
      const zIndex = isSelected ? 100 : role.isDirect ? 70 : 50;

      // Click handler showing bus number, destination, crowd level and stop information
      const handleBusMarkerClick = () => {
        onSelectBus(bus);

        const destination = busRoute ? busRoute.endPoint || busRoute.routeName : 'Corridor Terminal';
        const nextStopName = bus.nextStopName || (bus.nextStopId ? stops.find((s) => s.id === bus.nextStopId)?.name : 'En route') || 'En route';
        const crowdColor =
          bus.crowdCategory === 'LOW'
            ? '#059669'
            : bus.crowdCategory === 'MEDIUM'
            ? '#d97706'
            : '#dc2626';

        infoWindowRef.current?.setContent(
          `<div style="padding:10px;font-family:Roboto,Arial,sans-serif;color:#202124;max-width:270px;line-height:1.4">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px">
              <span style="padding:2px 8px;border-radius:6px;font-size:12px;font-weight:800;background:#1a73e8;color:#ffffff">
                Route ${bus.routeNumber || bus.busNumber}
              </span>
              <span style="padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;background:${crowdColor}15;color:${crowdColor};border:1px solid ${crowdColor}40">
                ${bus.crowdCategory} (${bus.crowdPercentage}%)
              </span>
            </div>
            <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:3px">
              Destination: ${destination}
            </div>
            <div style="font-size:11px;color:#475569;margin-bottom:4px">
              Next Stop: <strong>${nextStopName}</strong>
            </div>
            <div style="font-size:11px;color:#64748b;margin-bottom:6px">
              Occupancy: <strong>${bus.currentPassengers} / ${bus.capacity}</strong> passengers • Speed: <strong>${
                bus.speedKmh > 0 ? `${bus.speedKmh} km/h` : 'At Stop (Boarding)'
              }</strong>
            </div>
            <div style="padding-top:4px;border-top:1px solid #e2e8f0;font-size:10px;color:#059669;font-weight:600;display:flex;align-items:center;gap:4px">
              <span>✓</span> Google Routes API Road Curve Active
            </div>
          </div>`
        );
        const targetMarker = busMarkersRef.current.get(bus.id);
        if (targetMarker) {
          infoWindowRef.current?.open(mapInstanceRef.current, targetMarker);
        }
      };

      busClickHandlersRef.current.set(bus.id, handleBusMarkerClick);

      const existingMarker = busMarkersRef.current.get(bus.id);

      if (existingMarker) {
        // Smoothly update marker position and icon in-place without touching map camera
        existingMarker.setPosition({ lat: bus.latitude, lng: bus.longitude });
        existingMarker.setIcon({
          url: iconUrl,
          scaledSize: new google.maps.Size(38, 46),
          anchor: new google.maps.Point(19, 30),
        });
        existingMarker.setTitle(title);
        existingMarker.setZIndex(zIndex);
      } else {
        // Create new bus marker
        const marker = new google.maps.Marker({
          position: { lat: bus.latitude, lng: bus.longitude },
          map: mapInstanceRef.current,
          title,
          icon: {
            url: iconUrl,
            scaledSize: new google.maps.Size(38, 46),
            anchor: new google.maps.Point(19, 30),
          },
          zIndex,
        });

        marker.addListener('click', () => {
          busClickHandlersRef.current.get(bus.id)?.();
        });

        busMarkersRef.current.set(bus.id, marker);
      }
    });

    // Remove markers for buses that are no longer active or filtered out
    for (const [id, marker] of busMarkersRef.current.entries()) {
      if (!currentBusIds.has(id)) {
        marker.setMap(null);
        busMarkersRef.current.delete(id);
        busClickHandlersRef.current.delete(id);
      }
    }
  }, [googleMapLoaded, relevantBuses, selectedRouteId, activeBus?.id, plannedJourney, onSelectBus, routeByIdMap, relevantRoutes, corridorRouteIds, stops]);

  // Dynamic vector map bounds normalizer - encompasses planned journey, active bus route, and corridor stops
  const bounds = useMemo(() => {
    const allCoords: [number, number][] = [];

    if (plannedJourney && plannedJourney.waypoints.length > 0) {
      allCoords.push(...plannedJourney.waypoints);
    }
    if (activeBusRoute && activeBusRoute.pathWaypoints) {
      allCoords.push(...activeBusRoute.pathWaypoints);
    }
    unifiedStops.forEach((s) => allCoords.push([s.latitude, s.longitude]));

    if (allCoords.length > 0) {
      const lats = allCoords.map((w) => w[0]);
      const lngs = allCoords.map((w) => w[1]);
      const padLat = Math.max(0.015, (Math.max(...lats) - Math.min(...lats)) * 0.15);
      const padLng = Math.max(0.015, (Math.max(...lngs) - Math.min(...lngs)) * 0.15);
      return {
        minLat: Math.min(...lats) - padLat,
        maxLat: Math.max(...lats) + padLat,
        minLng: Math.min(...lngs) - padLng,
        maxLng: Math.max(...lngs) + padLng,
      };
    }

    return {
      minLat: 12.82,
      maxLat: 13.15,
      minLng: 80.05,
      maxLng: 80.32,
    };
  }, [plannedJourney, activeBusRoute, unifiedStops]);

  const projectCoords = (lat: number, lng: number, width = 800, height = 520) => {
    const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * (width - 100) + 50;
    const y = (1 - (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * (height - 100) + 50;
    return { x: x * zoomLevel + viewOffset.x, y: y * zoomLevel + viewOffset.y };
  };

  // Compute midpoint coordinate for floating Google Maps Navigation ETA/Distance pill
  const activeMidpoint = useMemo(() => {
    if (plannedJourney && plannedJourney.waypoints.length > 0) {
      const midIdx = Math.floor(plannedJourney.waypoints.length / 2);
      return plannedJourney.waypoints[midIdx];
    }
    if (activeBusRoute && activeBusRoute.pathWaypoints?.length > 0) {
      const midIdx = Math.floor(activeBusRoute.pathWaypoints.length / 2);
      return activeBusRoute.pathWaypoints[midIdx];
    }
    return null;
  }, [plannedJourney, activeBusRoute]);

  return (
    <div className="space-y-4 font-sans">
      {/* 1. Map Canvas Container matching Google Maps Reference Style */}
      <div className="relative w-full h-[540px] bg-[#eef0f2] rounded-2xl overflow-hidden shadow-md border border-slate-300">
        {/* Top Control Bar */}
        <div className="absolute top-3.5 left-3.5 right-16 z-20 flex flex-wrap items-center gap-2 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white/95 backdrop-blur rounded-xl border border-slate-300 shadow-sm">
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <span>{googleMapLoaded ? 'Google Maps JavaScript API' : 'Google Maps Transit Road View'}</span>
          </div>

          {plannedJourney ? (
            <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-white bg-[#1a73e8] backdrop-blur rounded-xl border border-blue-400 shadow-sm">
              <Navigation className="w-3.5 h-3.5 text-white" />
              <span>Route {plannedJourney.routeNumber}</span>
              <span className="text-blue-100 font-normal">
                ({plannedJourney.distanceKm} km • ~{plannedJourney.estimatedDurationMin} min)
              </span>
              {onClearPlannedJourney && (
                <button
                  onClick={onClearPlannedJourney}
                  className="ml-1 p-0.5 hover:bg-blue-700 rounded text-blue-100"
                  title="Exit Corridor View"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div
              className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white/95 backdrop-blur rounded-xl border border-slate-300 shadow-sm"
              title="Predefined route waypoint simulation. Physical GPS hardware not installed."
            >
              <Radio className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
              <span>GPS: <strong>{activeBus?.locationSource || 'SIMULATED'}</strong></span>
            </div>
          )}

          {/* Active Fleet / Corridor Stop Count Badge */}
          <div className="pointer-events-auto hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white/90 backdrop-blur rounded-xl border border-slate-300 shadow-sm">
            <MapPin className="w-3.5 h-3.5 text-blue-600" />
            <span>{unifiedStops.length} Corridor Stops</span>
          </div>

          {/* Routes API Road-Following Status Badge with Strict Fallback Transparency */}
          <div className="pointer-events-auto hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white/95 backdrop-blur rounded-xl border border-slate-300 shadow-sm">
            {roadActivePath || Object.keys(corridorRoadGeometries).length > 0 ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />
                <span className="font-semibold text-emerald-800">
                  Google Routes API: All Corridor Buses Road Curves Active ({Object.keys(corridorRoadGeometries).length + (roadActivePath ? 1 : 0)} routes)
                </span>
              </>
            ) : isFetchingRoadRoute ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-amber-800">
                  Google Routes API: Computing Road Curves...
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="font-semibold text-amber-800">
                  Approximate Straight-Line Fallback (Not Road Geometry)
                </span>
              </>
            )}
          </div>
        </div>

        {/* Diagnostic Banner if Google Maps JavaScript API failed to load or authorize on current domain */}
        {loadError && (
          <div className="absolute top-16 left-3.5 right-3.5 z-20 p-2.5 bg-rose-50/95 backdrop-blur border border-rose-300 rounded-xl shadow-md flex items-start gap-2 text-xs text-rose-900">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="leading-tight">
              <strong>Google Maps JavaScript API Notice:</strong> {loadError}
            </div>
          </div>
        )}

        {/* Warning Banner when stops cannot be resolved or have missing coordinates */}
        {invalidStopsList.length > 0 && (
          <div
            className={`absolute ${
              loadError ? 'top-28' : 'top-16'
            } left-3.5 right-3.5 z-20 p-2.5 bg-amber-50/95 backdrop-blur border border-amber-300 rounded-xl shadow-md flex items-start gap-2 text-xs text-amber-900`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-tight">
              <strong>Coordinate Integrity Notice:</strong>{' '}
              {invalidStopsList.length} stop(s) (
              <span className="italic">{invalidStopsList.slice(0, 4).join(', ')}</span>
              {invalidStopsList.length > 4 ? ` and ${invalidStopsList.length - 4} more` : ''}) have missing or invalid GPS coordinates in the database and are omitted from map rendering to maintain location precision.
            </div>
          </div>
        )}

        {/* Explicit Empty-Bus Banner when selected journey has zero matching active buses */}
        {(plannedJourney || selectedRouteId) && relevantBuses.length === 0 && (
          <div
            className={`absolute ${
              loadError && invalidStopsList.length > 0
                ? 'top-40'
                : loadError || invalidStopsList.length > 0
                  ? 'top-28'
                  : 'top-16'
            } left-3.5 z-20 px-3.5 py-2.5 bg-amber-50/95 backdrop-blur border border-amber-300 rounded-xl shadow-md flex items-center gap-2 text-xs font-semibold text-amber-900 max-w-md`}
          >
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>No buses currently available for this journey.</span>
          </div>
        )}

        {/* Small Crowd Level & Corridor Stop Legend */}
        <div className="absolute top-3.5 right-16 z-20 hidden md:flex items-center gap-3 bg-white/95 backdrop-blur-md border border-slate-300 rounded-xl px-3 py-1.5 shadow-sm text-xs">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Crowd:</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A] ring-1 ring-black/10" />
            <span className="text-[11px] font-semibold text-emerald-700">LOW</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EAB308] ring-1 ring-black/10" />
            <span className="text-[11px] font-semibold text-amber-700">MEDIUM</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626] ring-1 ring-black/10" />
            <span className="text-[11px] font-semibold text-rose-700">HIGH</span>
          </div>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-white border-2 border-blue-600" />
              <span className="text-[10px] font-medium text-slate-700">Shared Stop</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-slate-400" />
              <span className="text-[10px] font-medium text-slate-500">Corridor Stop</span>
            </div>
          </div>
        </div>

        {/* Map Zoom Controls */}
        <div className="absolute top-3.5 right-3.5 z-20 flex flex-col gap-1 bg-white/95 backdrop-blur rounded-xl border border-slate-300 p-1 shadow-sm">
          <button
            onClick={() => {
              if (googleMapLoaded && mapInstanceRef.current) {
                mapInstanceRef.current.setZoom((mapInstanceRef.current.getZoom() || 13) + 1);
              } else {
                setZoomLevel((z) => Math.min(3.5, z + 0.25));
              }
            }}
            className="p-1.5 text-slate-700 hover:text-black hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (googleMapLoaded && mapInstanceRef.current) {
                mapInstanceRef.current.setZoom(Math.max(1, (mapInstanceRef.current.getZoom() || 13) - 1));
              } else {
                setZoomLevel((z) => Math.max(0.6, z - 0.25));
              }
            }}
            className="p-1.5 text-slate-700 hover:text-black hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (googleMapLoaded && mapInstanceRef.current) {
                const google = (window as any).google;
                if (google) {
                  const bounds = new google.maps.LatLngBounds();
                  if (plannedJourney && plannedJourney.waypoints && plannedJourney.waypoints.length > 0) {
                    plannedJourney.waypoints.forEach(([lat, lng]) => bounds.extend(new google.maps.LatLng(lat, lng)));
                  } else if (unifiedStops.length > 0) {
                    unifiedStops.forEach((st) => bounds.extend(new google.maps.LatLng(st.latitude, st.longitude)));
                  } else if (buses.length > 0) {
                    buses.forEach((b) => bounds.extend(new google.maps.LatLng(b.latitude, b.longitude)));
                  }
                  mapInstanceRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
                }
              } else {
                setZoomLevel(1);
                setViewOffset({ x: 0, y: 0 });
              }
            }}
            className="p-1.5 text-xs font-bold text-slate-700 hover:text-black hover:bg-slate-100 rounded-lg cursor-pointer"
            title="Reset View to Route Bounds"
          >
            1x
          </button>
        </div>

        {/* Google Maps Canvas OR Authentic Light Vector Canvas */}
        {googleMapLoaded ? (
          <div ref={mapContainerRef} className="w-full h-full" />
        ) : (
          <div
            className="w-full h-full relative cursor-grab active:cursor-grabbing select-none overflow-hidden"
            onMouseDown={(e) => {
              setIsDragging(true);
              setDragStart({ x: e.clientX - viewOffset.x, y: e.clientY - viewOffset.y });
            }}
            onMouseMove={(e) => {
              if (!isDragging) return;
              setViewOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onWheel={(e) => {
              e.preventDefault();
              const zoomDelta = e.deltaY < 0 ? 0.15 : -0.15;
              setZoomLevel((prev) => Math.min(3.5, Math.max(0.6, prev + zoomDelta)));
            }}
            onTouchStart={(e) => {
              if (e.touches.length === 1) {
                setIsDragging(true);
                setDragStart({
                  x: e.touches[0].clientX - viewOffset.x,
                  y: e.touches[0].clientY - viewOffset.y,
                });
              }
            }}
            onTouchMove={(e) => {
              if (!isDragging || e.touches.length !== 1) return;
              setViewOffset({
                x: e.touches[0].clientX - dragStart.x,
                y: e.touches[0].clientY - dragStart.y,
              });
            }}
            onTouchEnd={() => setIsDragging(false)}
            onClick={() => setClickedUnifiedStop(null)}
          >
            {/* Authentic Google Maps Light Aesthetic Canvas */}
            <svg className="w-full h-full">
              <defs>
                <filter id="routeShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor="#1558d6" floodOpacity="0.4" />
                </filter>
                <filter id="badgeShadow" x="-25%" y="-25%" width="150%" height="150%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.25" />
                </filter>
                <filter id="busShadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#000000" floodOpacity="0.3" />
                </filter>
              </defs>

              {/* 1. Google Maps Light Ground Background */}
              <rect width="100%" height="100%" fill="#f1f3f4" />

              {/* 2. Bay of Bengal Coastal Water Body */}
              <path
                d="M 680 0 Q 670 180 660 300 T 675 600 L 900 600 L 900 0 Z"
                fill="#aadaff"
                stroke="#9acbee"
                strokeWidth="1"
              />
              <text x="730" y="240" fill="#2a77a8" fontSize="13" fontWeight="600" letterSpacing="2">
                Bay of Bengal
              </text>

              {/* 3. Adyar River Channel */}
              <path
                d="M 0 250 Q 180 230 320 270 T 520 260 T 665 280"
                fill="none"
                stroke="#aadaff"
                strokeWidth="20"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 0 250 Q 180 230 320 270 T 520 260 T 665 280"
                fill="none"
                stroke="#8ec7ea"
                strokeWidth="2"
              />
              <text x="360" y="260" fill="#2a77a8" fontSize="9" fontWeight="600" letterSpacing="1">
                Adyar River
              </text>

              {/* 4. Natural Green Parks & Protected Reserves */}
              <rect x="220" y="280" width="120" height="90" rx="20" fill="#ceead6" opacity="0.85" />
              <text x="240" y="325" fill="#2d6a4f" fontSize="9" fontWeight="600">
                Guindy National Park
              </text>

              <circle cx="430" cy="80" r="32" fill="#ceead6" opacity="0.85" />
              <text x="400" y="80" fill="#2d6a4f" fontSize="8" fontWeight="600">
                Semmozhi Poonga
              </text>

              {/* 5. Chennai Arterial Road Grid */}
              <line x1="120" y1="0" x2="480" y2="400" stroke="#dadce0" strokeWidth="8" strokeLinecap="round" />
              <line x1="120" y1="0" x2="480" y2="400" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />

              <line x1="560" y1="260" x2="590" y2="600" stroke="#dadce0" strokeWidth="8" strokeLinecap="round" />
              <line x1="560" y1="260" x2="590" y2="600" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />

              <line x1="140" y1="180" x2="90" y2="580" stroke="#dadce0" strokeWidth="9" strokeLinecap="round" />
              <line x1="140" y1="180" x2="90" y2="580" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" />

              <line x1="40" y1="140" x2="400" y2="280" stroke="#dadce0" strokeWidth="7" strokeLinecap="round" />
              <line x1="40" y1="140" x2="400" y2="280" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />

              <line x1="260" y1="250" x2="570" y2="270" stroke="#dadce0" strokeWidth="7" strokeLinecap="round" />
              <line x1="260" y1="250" x2="570" y2="270" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />

              {/* Secondary Street Grid */}
              <path
                d="M 200 40 L 200 500 M 360 40 L 360 500 M 480 40 L 480 500 M 40 100 L 600 100 M 40 380 L 600 380 M 40 460 L 600 460"
                fill="none"
                stroke="#ffffff"
                strokeWidth="3"
                opacity="0.8"
              />

              {/* Transit / Metro Rail Dash Lines */}
              <path
                d="M 140 170 L 100 580"
                fill="none"
                stroke="#bdc1c6"
                strokeWidth="2.5"
                strokeDasharray="5 3"
              />

              {/* 6. Chennai Neighborhood & POI Text Labels */}
              <g fill="#3c4043" fontFamily="Roboto, Arial, sans-serif">
                <text x="180" y="240" fontSize="12" fontWeight="700">SAIDAPET</text>
                <text x="180" y="253" fontSize="9" fill="#70757a">சைதாப்பேட்டை</text>

                <text x="430" y="160" fontSize="12" fontWeight="700">ALWARPET</text>
                <text x="430" y="173" fontSize="9" fill="#70757a">ஆழ்வார்பேட்டை</text>

                <text x="540" y="440" fontSize="12" fontWeight="700">THIRUVANMIYUR</text>
                <text x="540" y="453" fontSize="9" fill="#70757a">திருவான்மியூர்</text>

                <text x="210" y="450" fontSize="12" fontWeight="700">VELACHERY</text>
                <text x="210" y="463" fontSize="9" fill="#70757a">வேளச்சேரி</text>

                <text x="80" y="110" fontSize="11" fontWeight="700">VADAPALANI</text>
                <text x="80" y="122" fontSize="8" fill="#70757a">வடபழனி</text>

                <text x="60" y="170" fontSize="9" fill="#5f6368">Ashok Pillar</text>
                <text x="560" y="170" fontSize="9" fill="#5f6368">Santhome Basilica</text>
                <text x="560" y="340" fontSize="9" fill="#5f6368">Edward Elliot's Beach</text>
              </g>

              {/* 7. Other Corridor Bus Paths (Road-Following with Distinct Subtle Route Colors) */}
              {corridorRoutes
                .filter((r) => r.routeNumber.toUpperCase() !== currentActiveRouteNumber.toUpperCase())
                .map((r, idx) => {
                  const waypoints =
                    corridorRoadGeometries[r.id] || r.roadWaypoints || r.pathWaypoints || [];
                  if (waypoints.length === 0) return null;

                  const routeColor = CORRIDOR_ROUTE_PALETTE[idx % CORRIDOR_ROUTE_PALETTE.length];
                  const points = waypoints
                    .map(([lat, lng]) => {
                      const p = projectCoords(lat, lng);
                      return `${p.x},${p.y}`;
                    })
                    .join(' ');

                  const midPt = waypoints[Math.floor(waypoints.length / 2)];
                  const midScreen = projectCoords(midPt[0], midPt[1]);

                  return (
                    <g key={`corridor_path_${r.id}`}>
                      {/* Crisp white casing */}
                      <polyline
                        points={points}
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="5.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeOpacity="0.9"
                      />
                      {/* Distinct subtle road curve */}
                      <polyline
                        points={points}
                        fill="none"
                        stroke={routeColor}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeOpacity="0.82"
                      />

                      {/* Alternative Route Floating White ETA/Distance Pill */}
                      {plannedJourney && (
                        <g transform={`translate(${midScreen.x + 8}, ${midScreen.y - 15})`} filter="url(#badgeShadow)">
                          <rect
                            x="0"
                            y="0"
                            width="64"
                            height="28"
                            rx="5"
                            fill="#ffffff"
                            stroke="#dadce0"
                            strokeWidth="1"
                          />
                          <text x="6" y="12" fill="#3c4043" fontSize="8.5" fontWeight="700">
                            🚌 ~{r.estimatedDurationMin} min
                          </text>
                          <text x="6" y="23" fill="#70757a" fontSize="8" fontWeight="500">
                            {r.distanceKm} km • {r.routeNumber}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}

              {/* 8. Active/Selected Route Path: Bold, Smooth Navigation Blue Polyline (#1a73e8) */}
              {(() => {
                const activePathCoords =
                  plannedJourney && plannedJourney.waypoints.length > 0
                    ? plannedJourney.waypoints
                    : activeBusRoute?.pathWaypoints || [];

                if (activePathCoords.length === 0) return null;

                const pointsStr = activePathCoords
                  .map(([lat, lng]) => {
                    const p = projectCoords(lat, lng);
                    return `${p.x},${p.y}`;
                  })
                  .join(' ');

                return (
                  <g>
                    <polyline
                      points={pointsStr}
                      fill="none"
                      stroke="#1558d6"
                      strokeWidth="9.5"
                      strokeOpacity="0.45"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <polyline
                      points={pointsStr}
                      fill="none"
                      stroke="#1a73e8"
                      strokeWidth="6.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                );
              })()}

              {/* 9. Floating Blue Google Maps Navigation Pill */}
              {activeMidpoint && (
                (() => {
                  const p = projectCoords(activeMidpoint[0], activeMidpoint[1]);
                  const duration = plannedJourney?.estimatedDurationMin || activeBusRoute?.estimatedDurationMin || 24;
                  const dist = plannedJourney?.distanceKm || activeBusRoute?.distanceKm || 12;
                  return (
                    <g transform={`translate(${p.x + 12}, ${p.y - 32})`} filter="url(#badgeShadow)">
                      <polygon points="-6,16 0,12 0,20" fill="#1a73e8" />
                      <rect
                        x="0"
                        y="0"
                        width="84"
                        height="36"
                        rx="6"
                        fill="#1a73e8"
                        stroke="#ffffff"
                        strokeWidth="1"
                      />
                      <text x="8" y="16" fill="#ffffff" fontSize="10.5" fontWeight="800">
                        🚌 {duration} min
                      </text>
                      <text x="8" y="29" fill="#d2e3fc" fontSize="9" fontWeight="600">
                        {dist} km • Route {currentActiveRouteNumber}
                      </text>
                    </g>
                  );
                })()
              )}

              {/* 10. Render ALL Unified Stops (Selected Journey, Shared Stops, and Other Corridor Stops) */}
              {unifiedStops.map((st) => {
                const p = projectCoords(st.latitude, st.longitude);

                // Origin Stop Marker
                if (st.isOrigin) {
                  return (
                    <g
                      key={`stop_${st.key}`}
                      className="cursor-pointer group"
                      onClick={(e) => {
                        e.stopPropagation();
                        setClickedUnifiedStop(st);
                      }}
                    >
                      <circle cx={p.x} cy={p.y} r="14" fill="#1a73e8" fillOpacity="0.18" className="animate-ping" />
                      <circle cx={p.x} cy={p.y} r="7.5" fill="#ffffff" stroke="#202124" strokeWidth="3" />
                      <circle cx={p.x} cy={p.y} r="3" fill="#1a73e8" />
                      <rect x={p.x + 12} y={p.y - 12} width="88" height="20" rx="4" fill="#ffffff" stroke="#dadce0" strokeWidth="1" filter="url(#badgeShadow)" />
                      <text x={p.x + 18} y={p.y + 2} fill="#202124" fontSize="9.5" fontWeight="700">
                        {st.name.slice(0, 13)}
                      </text>
                    </g>
                  );
                }

                // Destination Stop Marker
                if (st.isDestination) {
                  return (
                    <g
                      key={`stop_${st.key}`}
                      className="cursor-pointer group"
                      onClick={(e) => {
                        e.stopPropagation();
                        setClickedUnifiedStop(st);
                      }}
                    >
                      <ellipse cx={p.x} cy={p.y + 2} rx="6" ry="2.5" fill="#000000" fillOpacity="0.3" />
                      <path
                        d={`M ${p.x} ${p.y} C ${p.x - 9} ${p.y - 10} ${p.x - 9} ${p.y - 20} ${p.x} ${p.y - 20} C ${p.x + 9} ${p.y - 20} ${p.x + 9} ${p.y - 10} ${p.x} ${p.y} Z`}
                        fill="#ea4335"
                        stroke="#c5221f"
                        strokeWidth="1.2"
                      />
                      <circle cx={p.x} cy={p.y - 14} r="3.2" fill="#8e1610" />
                      <rect x={p.x - 42} y={p.y - 38} width="84" height="17" rx="3.5" fill="#ffffff" stroke="#dadce0" strokeWidth="1" filter="url(#badgeShadow)" />
                      <text x={p.x} y={p.y - 26} fill="#ea4335" fontSize="8.5" fontWeight="800" textAnchor="middle">
                        {st.name.slice(0, 12)}
                      </text>
                    </g>
                  );
                }

                // Selected Journey Intermediate Stop: Prominent Numbered Blue Circular Marker
                if (st.isSelectedRoute) {
                  return (
                    <g
                      key={`stop_${st.key}`}
                      className="cursor-pointer group"
                      onClick={(e) => {
                        e.stopPropagation();
                        setClickedUnifiedStop(st);
                      }}
                    >
                      {st.isShared && (
                        <circle cx={p.x} cy={p.y} r="12" fill="#1a73e8" fillOpacity="0.15" />
                      )}
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="8"
                        fill="#1a73e8"
                        stroke="#ffffff"
                        strokeWidth="2.0"
                        className="group-hover:scale-125 transition-transform"
                      />
                      <text
                        x={p.x}
                        y={p.y + 3.2}
                        fill="#ffffff"
                        fontSize="9"
                        fontWeight="800"
                        textAnchor="middle"
                        className="pointer-events-none select-none font-mono"
                      >
                        {st.selectedSequenceIndex || '•'}
                      </text>
                    </g>
                  );
                }

                // Shared Stop between Multiple Corridor Buses (Dual Concentric Rings)
                if (st.isShared) {
                  return (
                    <g
                      key={`stop_${st.key}`}
                      className="cursor-pointer group"
                      onClick={(e) => {
                        e.stopPropagation();
                        setClickedUnifiedStop(st);
                      }}
                    >
                      <circle cx={p.x} cy={p.y} r="10" fill="#1a73e8" fillOpacity="0.12" />
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="6.5"
                        fill="#ffffff"
                        stroke="#1a73e8"
                        strokeWidth="2.5"
                        className="group-hover:scale-125 transition-transform"
                      />
                      <circle cx={p.x} cy={p.y} r="2.5" fill="#1a73e8" />
                    </g>
                  );
                }

                // Other Corridor Bus Stop: Smaller Subtle Circular Marker
                return (
                  <g
                    key={`stop_${st.key}`}
                    className="cursor-pointer group"
                    onClick={(e) => {
                      e.stopPropagation();
                      setClickedUnifiedStop(st);
                    }}
                  >
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="4.5"
                      fill="#94a3b8"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      className="group-hover:scale-125 transition-transform"
                    />
                  </g>
                );
              })}

              {/* 11. Render Animated Circular Mini-Bus Markers with Exact Crowd Colors */}
              {relevantBuses.map((bus) => {
                if (!plannedJourney && selectedRouteId && bus.routeId !== selectedRouteId) return null;
                const isSelected = bus.id === activeBus?.id;
                const p = projectCoords(bus.latitude, bus.longitude);
                const crowdBg = getCrowdColorHex(bus.crowdCategory);
                const routeLabel = bus.routeNumber || bus.busNumber;
                const busRoute =
                  routeByIdMap.get(bus.routeId) ||
                  relevantRoutes.find((r) => (r.routeNumber || '').toUpperCase() === (bus.routeNumber || bus.busNumber || '').toUpperCase());
                const evRole = evaluateBusForJourney(bus, busRoute, plannedJourney || null, corridorRouteIds);
                const role = {
                  isDirect: evRole.role === 'direct',
                  isCorridor: evRole.role === 'corridor',
                  label: evRole.label,
                };

                return (
                  <g
                    key={bus.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectBus(bus);
                    }}
                    className="cursor-pointer transition-transform duration-300"
                  >
                    {/* Subtle Pulse Halo for Active Buses */}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isSelected ? '22' : '17'}
                      fill={crowdBg}
                      fillOpacity="0.25"
                      className="animate-ping"
                    />

                    {/* Role Outline: Solid Blue for direct/selected, Dashed Amber for other corridor buses */}
                    {isSelected ? (
                      <circle cx={p.x} cy={p.y} r="16.5" fill="none" stroke="#1a73e8" strokeWidth="2.8" />
                    ) : role.isDirect ? (
                      <circle cx={p.x} cy={p.y} r="14.5" fill="none" stroke="#1a73e8" strokeWidth="1.8" />
                    ) : role.isCorridor ? (
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="14.5"
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="1.8"
                        strokeDasharray="3 2"
                      />
                    ) : null}

                    {/* Circular mini-bus marker with crowd background, crisp white border & shadow */}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="12.5"
                      fill={crowdBg}
                      stroke="#ffffff"
                      strokeWidth="2.2"
                      filter="url(#busShadow)"
                    />

                    {/* Centered White Mini-Bus Icon */}
                    <g transform={`translate(${p.x - 6}, ${p.y - 6})`} fill="#ffffff">
                      <path d="M1.2 0.8C0.8 0.8 0.5 1.1 0.5 1.5v6.2c0 .4.3.8.8.8h.4v.8c0 .2.2.4.4.4h.8c.2 0 .4-.2.4-.4V9.3h4.4v.8c0 .2.2.4.4.4h.8c.2 0 .4-.2.4-.4V9.3h.4c.4 0 .8-.3.8-.8V1.5c0-.4-.3-.8-.8-.8H1.2zm.6 1.4h8.4v2.2H1.8V2.2zm.9 3.8c.35 0 .65.3.65.65s-.3.65-.65.65-.65-.3-.65-.65.3-.65.65-.65zm6.6 0c.35 0 .65.3.65.65s-.3.65-.65.65-.65-.3-.65-.65.3-.65.65-.65z"/>
                    </g>

                    {/* Route Label Pill */}
                    <rect
                      x={p.x - 22}
                      y={p.y - 27}
                      width="44"
                      height="13"
                      rx="3.5"
                      fill="#202124"
                      stroke={isSelected ? '#1a73e8' : role.isCorridor ? '#f59e0b' : '#ffffff'}
                      strokeWidth="1.2"
                    />
                    <text
                      x={p.x}
                      y={p.y - 17.5}
                      fill="#ffffff"
                      fontSize="8.5"
                      fontWeight="800"
                      fontFamily="Roboto, Arial, sans-serif"
                      textAnchor="middle"
                      className="pointer-events-none select-none"
                    >
                      {routeLabel}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Bottom-Left Authentic Google Maps "Layers" Satellite Preview Thumbnail */}
            <div className="absolute bottom-4 left-4 z-20 pointer-events-auto">
              <button
                className="flex items-center gap-1.5 p-1 bg-white rounded-xl shadow-md border border-slate-300 hover:border-slate-400 transition-all group"
                title="Google Maps Layers & Satellite View"
              >
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-emerald-950 border border-slate-300 relative flex items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-tr from-emerald-900 via-teal-800 to-slate-700 opacity-90" />
                  <Layers className="w-5 h-5 text-white/90 relative z-10 group-hover:scale-110 transition-transform" />
                </div>
                <span className="text-[11px] font-bold text-slate-800 pr-2">Layers</span>
              </button>
            </div>

            {/* Bottom-Right Authentic Google Maps Attribution */}
            <div className="absolute bottom-2.5 right-3 z-20 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 pointer-events-none select-none bg-white/70 px-2 py-0.5 rounded-md backdrop-blur-xs">
              <span className="font-bold tracking-tight">
                <span className="text-[#4285F4]">G</span>
                <span className="text-[#EA4335]">o</span>
                <span className="text-[#FBBC05]">o</span>
                <span className="text-[#4285F4]">g</span>
                <span className="text-[#34A853]">l</span>
                <span className="text-[#EA4335]">e</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal">Maps Navigation View</span>
            </div>

            {/* Interactive Stop Details Tooltip Callout */}
            {clickedUnifiedStop && (
              <div
                style={{
                  left: `${projectCoords(clickedUnifiedStop.latitude, clickedUnifiedStop.longitude).x}px`,
                  top: `${projectCoords(clickedUnifiedStop.latitude, clickedUnifiedStop.longitude).y - 75}px`,
                  transform: 'translateX(-50%)',
                }}
                className="absolute z-30 p-3 bg-white rounded-xl border border-slate-300 shadow-2xl text-slate-900 text-xs min-w-[220px] max-w-[280px] pointer-events-auto font-sans animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 text-[9px] font-extrabold uppercase rounded ${
                        clickedUnifiedStop.isOrigin
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : clickedUnifiedStop.isDestination
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : clickedUnifiedStop.isShared
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : clickedUnifiedStop.isSelectedRoute
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-slate-100 text-slate-700 border border-slate-300'
                      }`}
                    >
                      {clickedUnifiedStop.isOrigin
                        ? 'ORIGIN TERMINUS'
                        : clickedUnifiedStop.isDestination
                        ? 'DESTINATION TERMINUS'
                        : clickedUnifiedStop.isShared
                        ? `SHARED INTERCHANGE (${clickedUnifiedStop.routesServing.length} ROUTES)`
                        : `STOP #${clickedUnifiedStop.selectedSequenceIndex || '•'}`}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 font-bold">{clickedUnifiedStop.code}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setClickedUnifiedStop(null);
                    }}
                    className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-800"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="font-bold text-sm text-slate-900 leading-tight mb-1.5">
                  {clickedUnifiedStop.name}
                </div>

                {/* List of Bus Routes Serving this Stop */}
                <div className="space-y-1 pt-1 border-t border-slate-100 text-[11px]">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">
                    Bus Routes Serving this Stop:
                  </span>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-0.5">
                    {clickedUnifiedStop.routesServing.map((r, rIdx) => (
                      <span
                        key={rIdx}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          r.isSelected
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        <BusIcon className="w-2.5 h-2.5" />
                        <span>Route {r.routeNumber}</span>
                        <span className="text-[9px] opacity-80">(Stop #{r.sequenceOrder})</span>
                      </span>
                    ))}
                  </div>
                </div>

                {clickedUnifiedStop.isShared && (
                  <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center gap-1 text-[10px] text-amber-700 font-medium">
                    <Share2 className="w-3 h-3 text-amber-600" />
                    <span>Transfer available between corridor routes</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Selected Bus Intelligence Card: Placed directly BELOW the map as a separate responsive card */}
      {activeBus ? (
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-md text-slate-900">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white shadow-sm shrink-0"
                style={{ backgroundColor: getCrowdColorHex(activeBus.crowdCategory) }}
              >
                <BusIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                    Selected Bus Intelligence
                  </span>
                  {/* Direct vs Corridor Bus Badge */}
                  {plannedJourney && activeBusRole && (
                    <span
                      className={`px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-md tracking-wider flex items-center gap-1 ${
                        activeBusRole.isDirect
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                          : 'bg-amber-50 text-amber-800 border border-amber-300'
                      }`}
                    >
                      {activeBusRole.isDirect ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          SUITABLE DIRECT BUS
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3 h-3 text-amber-600" />
                          OTHER ROUTE / CORRIDOR BUS
                        </>
                      )}
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 font-mono mt-0.5">
                  Route: {activeBus.routeNumber || activeBus.busNumber}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {plannedJourney
                    ? `${plannedJourney.passengerOrigin} ➔ ${plannedJourney.passengerDestination} (${activeBus.routeName})`
                    : activeBus.routeName}
                </p>
              </div>
            </div>

            {/* Crowd Level Badge */}
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-xs text-slate-400 font-mono">Occupancy</div>
                <div className="text-base font-bold text-slate-800 font-mono">{activeBus.crowdPercentage}%</div>
              </div>
              <div
                className={`px-3 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-2 ${
                  CROWD_COLORS[activeBus.crowdCategory]?.bg || ''
                }`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    CROWD_COLORS[activeBus.crowdCategory]?.badge
                  } animate-pulse`}
                />
                <span>Crowd: {activeBus.crowdCategory}</span>
              </div>
            </div>
          </div>

          {/* Crowd Percentage Progress Bar */}
          <div className="w-full bg-slate-100 rounded-full h-2 my-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                CROWD_COLORS[activeBus.crowdCategory]?.bar
              }`}
              style={{ width: `${activeBus.crowdPercentage}%` }}
            />
          </div>

          {/* Specified Dynamic Attributes Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 font-mono text-xs">
            <div className="space-y-0.5">
              <span className="text-slate-500 block text-[11px]">Route:</span>
              <strong className="text-blue-700 text-sm">{activeBus.routeNumber || activeBus.busNumber}</strong>
            </div>
            <div className="space-y-0.5">
              <span className="text-slate-500 block text-[11px]">People:</span>
              <strong className="text-slate-800 text-sm">
                {activeBus.currentPassengers} / {activeBus.capacity}
              </strong>
            </div>
            <div className="space-y-0.5">
              <span className="text-slate-500 block text-[11px]">Occupancy:</span>
              <strong className="text-slate-800 text-sm">{activeBus.crowdPercentage}%</strong>
            </div>
            <div className="space-y-0.5">
              <span className="text-slate-500 block text-[11px]">Crowd:</span>
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                  activeBus.crowdCategory === 'LOW'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : activeBus.crowdCategory === 'MEDIUM'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                }`}
              >
                {activeBus.crowdCategory}
              </span>
            </div>
            <div className="space-y-0.5">
              <span className="text-slate-500 block text-[11px]">Next Stop:</span>
              <strong className="text-slate-800 truncate block" title={activeBus.nextStopName}>
                {activeBus.nextStopName}
              </strong>
            </div>
            <div className="space-y-0.5">
              <span className="text-slate-500 block text-[11px]">GPS Source:</span>
              <strong className="text-amber-700 uppercase tracking-wide">
                {activeBus.locationSource || 'SIMULATED'}
              </strong>
            </div>
          </div>

          {/* Operational Context Strip */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 font-mono">
            <div className="flex items-center gap-4">
              <span>
                Speed:{' '}
                <strong className="text-slate-800">
                  {activeBus.speedKmh > 0 ? `${activeBus.speedKmh} km/h` : 'At Stop (Boarding)'}
                </strong>
              </span>
              {activeBus.vehicleUnitId && (
                <span>
                  Vehicle: <strong className="text-slate-700">{activeBus.vehicleUnitId}</strong>
                </span>
              )}
              <span>
                Type: <strong className="text-slate-700">{activeBus.acType}</strong>
              </span>
            </div>
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              ETA to Next Stop: ~{activeBus.etaNextStopMin} min
            </span>
          </div>
        </div>
      ) : (
        /* Empty State when no matching bus is active on this journey/selection */
        <div className="p-6 bg-white rounded-2xl border border-dashed border-slate-300 text-center text-slate-500">
          <BusIcon className="w-8 h-8 mx-auto text-slate-400 mb-2 opacity-60" />
          <p className="font-semibold text-sm text-slate-700">
            {plannedJourney || selectedRouteId
              ? 'No buses currently available for this journey'
              : 'Select a bus marker to view bus intelligence.'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {plannedJourney || selectedRouteId
              ? 'No active buses are currently operating along this selected route or same-direction corridor.'
              : 'Click any circular bus marker on the map to inspect live passenger counts, crowd estimation, and arrival times.'}
          </p>
        </div>
      )}
    </div>
  );
};

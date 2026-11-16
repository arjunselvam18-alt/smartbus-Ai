import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  MapPin,
  ArrowUpDown,
  Navigation,
  Clock,
  Bus,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronRight,
  Sparkles,
  Route as RouteIcon,
  Layers,
  Info,
  Filter,
} from 'lucide-react';
import {
  RawRouteRecord,
  MatchedJourney,
  TransferJourney,
  findMatchingRoutes,
  CHENNAI_STOP_COORDINATES,
} from '../../services/routeEngine';
import {
  getSmartStopSuggestions,
  validateStopInput,
  getSmartRouteSuggestions,
  StopSuggestion,
} from '../../utils/fuzzySearch';
import { CrowdBadge } from '../common/CrowdBadge';

interface JourneyPlannerProps {
  onSelectJourney: (journey: MatchedJourney) => void;
  onClearJourney?: () => void;
  availableBuses: any[];
}

export const JourneyPlanner: React.FC<JourneyPlannerProps> = ({
  onSelectJourney,
  onClearJourney,
  availableBuses,
}) => {
  const [routesData, setRoutesData] = useState<RawRouteRecord[]>([]);
  const [stopsList, setStopsList] = useState<string[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);

  // Search Fields
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [routeNumber, setRouteNumber] = useState('');

  // Autocomplete States
  const [originSuggestions, setOriginSuggestions] = useState<StopSuggestion[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<StopSuggestion[]>([]);
  const [routeSuggestions, setRouteSuggestions] = useState<string[]>([]);

  const [showOriginDropdown, setShowOriginDropdown] = useState(false);
  const [showDestDropdown, setShowDestDropdown] = useState(false);
  const [showRouteDropdown, setShowRouteDropdown] = useState(false);

  // Validation & Feedback States
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  // Journey Results
  const [directResults, setDirectResults] = useState<MatchedJourney[]>([]);
  const [transferResults, setTransferResults] = useState<TransferJourney[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeRouteFilter, setActiveRouteFilter] = useState<string>('');

  // Container refs for click-outside
  const originContainerRef = useRef<HTMLDivElement>(null);
  const destContainerRef = useRef<HTMLDivElement>(null);
  const routeContainerRef = useRef<HTMLDivElement>(null);
  const latestSearchSeqRef = useRef<number>(0);

  // Fetch routes dataset on mount (and fallback to hydrated storageService routes if needed)
  useEffect(() => {
    async function loadRoutes() {
      try {
        setLoadingDb(true);
        const res = await fetch('/api/transit/routes-db');
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          setRoutesData(data.routes);
          setStopsList(data.stops || []);
          return;
        }
      } catch (err) {
        console.warn('Failed to fetch routes-db:', err);
      } finally {
        setLoadingDb(false);
      }

      // Fallback: derive raw route records from storageService hydrated dataset if available
      try {
        const { storageService } = await import('../../services/storage');
        const hydrated = storageService.getDatasetRoutes();
        if (hydrated.length > 0) {
          const fallbackRaw: RawRouteRecord[] = hydrated
            .filter((r) => !r.id.endsWith('_ret') && r.stops && r.stops.length >= 2)
            .map((r) => ({
              route: r.routeNumber,
              origin: r.startPoint,
              destination: r.endPoint,
              via: r.stops
                .slice(1, -1)
                .map((s) => s.stopName)
                .join(', '),
              category: r.city || 'Regular Routes',
            }));
          const stopSet = new Set<string>();
          fallbackRaw.forEach((rr) => {
            if (rr.origin) stopSet.add(rr.origin);
            if (rr.destination) stopSet.add(rr.destination);
            rr.via
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean)
              .forEach((x) => stopSet.add(x));
          });
          setRoutesData(fallbackRaw);
          setStopsList(Array.from(stopSet).sort());
        }
      } catch {}
    }
    loadRoutes();
  }, []);

  // Unique list of actual route numbers from Google Sheets database
  const allRouteNumbers = useMemo(() => {
    const set = new Set<string>();
    routesData.forEach((r) => {
      if (r.route && r.route.trim()) set.add(r.route.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [routesData]);

  // Click outside to close autocomplete dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (originContainerRef.current && !originContainerRef.current.contains(e.target as Node)) {
        setShowOriginDropdown(false);
      }
      if (destContainerRef.current && !destContainerRef.current.contains(e.target as Node)) {
        setShowDestDropdown(false);
      }
      if (routeContainerRef.current && !routeContainerRef.current.contains(e.target as Node)) {
        setShowRouteDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter Origin Autocomplete suggestions using Smart Fuzzy/Levenshtein matching
  useEffect(() => {
    if (!origin.trim()) {
      setOriginSuggestions([]);
      return;
    }
    const suggestions = getSmartStopSuggestions(origin, stopsList, 8);
    setOriginSuggestions(suggestions);
  }, [origin, stopsList]);

  // Filter Destination Autocomplete suggestions using Smart Fuzzy/Levenshtein matching
  useEffect(() => {
    if (!destination.trim()) {
      setDestSuggestions([]);
      return;
    }
    const suggestions = getSmartStopSuggestions(destination, stopsList, 8);
    setDestSuggestions(suggestions);
  }, [destination, stopsList]);

  // Filter Route Number Autocomplete suggestions using actual route numbers
  useEffect(() => {
    if (!routeNumber.trim()) {
      setRouteSuggestions(allRouteNumbers.slice(0, 8));
      return;
    }
    const suggestions = getSmartRouteSuggestions(routeNumber, allRouteNumbers, 8);
    setRouteSuggestions(suggestions);
  }, [routeNumber, allRouteNumbers]);

  // Geolocation Handler restricted to Chennai transit coordinates
  const handleUseCurrentLocation = () => {
    setLocationNotice(null);
    setValidationWarning(null);

    if (!('geolocation' in navigator)) {
      setLocationNotice('Geolocation is not supported by your browser. Please enter a stop manually.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const uLat = pos.coords.latitude;
        const uLng = pos.coords.longitude;

        // Restrict to Chennai bounding box (approx lat 12.6 to 13.4, lng 79.8 to 80.4)
        const isNearChennai = uLat >= 12.5 && uLat <= 13.5 && uLng >= 79.7 && uLng <= 80.5;

        // Find closest known Chennai stop in coordinate dictionary
        let closestStop = 'central';
        let minDist = Infinity;
        for (const [stopKey, [sLat, sLng]] of Object.entries(CHENNAI_STOP_COORDINATES)) {
          const d = Math.hypot(uLat - sLat, uLng - sLng);
          if (d < minDist) {
            minDist = d;
            closestStop = stopKey;
          }
        }

        // Match back to nice capitalization from stopsList
        const matchedName =
          stopsList.find(
            (s) =>
              s.toLowerCase().replace(/[\s\.\-]+/g, '') === closestStop ||
              s.toLowerCase().includes(closestStop)
          ) || 'M.G.R Central';

        setOrigin(matchedName);
        setShowOriginDropdown(false);

        if (isNearChennai) {
          setLocationNotice(`Chennai GPS detected! Nearest stop set to: ${matchedName}`);
        } else {
          setLocationNotice(
            `Device location is outside Chennai transit grid. Selected nearest Chennai terminal: ${matchedName}`
          );
        }
      },
      (err) => {
        console.warn('Geolocation denied:', err.message);
        setOrigin('M.G.R Central');
        setShowOriginDropdown(false);
        setLocationNotice('Location access denied. Defaulted origin to M.G.R Central, Chennai.');
      }
    );
  };

  const handleSwap = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
    setValidationWarning(null);
    if (hasSearched) {
      executeSearch(destination, temp, routeNumber);
    }
  };

  /**
   * Main Search Execution with Chennai Stop Validation & Optional Route Filtering
   */
  const executeSearch = (orig = origin, dest = destination, routeNum = routeNumber) => {
    setValidationWarning(null);

    if (!orig.trim()) {
      setValidationWarning('Please enter a starting bus stop.');
      setShowOriginDropdown(true);
      return;
    }

    if (!dest.trim()) {
      setValidationWarning('Please enter a destination bus stop.');
      setShowDestDropdown(true);
      return;
    }

    // 1. Validate Origin against Chennai Google Sheets database
    const origVal = validateStopInput(orig, stopsList);
    if (!origVal.isValid) {
      setValidationWarning(
        origVal.message || `No matching bus stop found for '${orig}'. Please select a valid Chennai stop.`
      );
      setShowOriginDropdown(true);
      return;
    }

    // 2. Validate Destination against Chennai Google Sheets database
    const destVal = validateStopInput(dest, stopsList);
    if (!destVal.isValid) {
      setValidationWarning(
        destVal.message || `No matching bus stop found for '${dest}'. Please select a valid Chennai stop.`
      );
      setShowDestDropdown(true);
      return;
    }

    // 3. Resolve to canonical names if typo was corrected
    const resolvedOrigin = origVal.matchedCanonical || orig.trim();
    const resolvedDest = destVal.matchedCanonical || dest.trim();

    // Auto-update input text to canonical spelling if slightly corrected
    if (resolvedOrigin !== orig) setOrigin(resolvedOrigin);
    if (resolvedDest !== dest) setDestination(resolvedDest);

    // 4. Validate Optional Route Number if entered
    const cleanRoute = routeNum.trim();
    if (cleanRoute) {
      const routeExists = allRouteNumbers.some(
        (r) => r.toUpperCase().replace(/\s+/g, '') === cleanRoute.toUpperCase().replace(/\s+/g, '')
      );
      if (!routeExists) {
        // Suggest closest real route if found
        const closeRoutes = getSmartRouteSuggestions(cleanRoute, allRouteNumbers, 3);
        if (closeRoutes.length > 0) {
          setValidationWarning(
            `Route '${cleanRoute}' was not found in Chennai MTC database. Did you mean: ${closeRoutes.join(', ')}? Searching across all available routes.`
          );
        } else {
          setValidationWarning(
            `Route '${cleanRoute}' was not recognized in the Chennai Google Sheets database. Showing all valid routes connecting your corridor.`
          );
        }
      }
    }

    setIsSearching(true);
    setHasSearched(true);
    setActiveRouteFilter(cleanRoute);
    setShowOriginDropdown(false);
    setShowDestDropdown(false);
    setShowRouteDropdown(false);

    const searchSeq = ++latestSearchSeqRef.current;
    const searchSessionId = `search_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    setTimeout(() => {
      if (searchSeq !== latestSearchSeqRef.current) return;

      const match = findMatchingRoutes(
        routesData,
        resolvedOrigin,
        resolvedDest,
        availableBuses,
        cleanRoute || undefined,
        searchSessionId
      );
      setDirectResults(match.direct);
      setTransferResults(match.transfers);
      setIsSearching(false);

      // Immediately activate top direct journey on the map for the latest search, or clear old journey
      if (match.direct.length > 0) {
        onSelectJourney(match.direct[0]);
      } else {
        onClearJourney?.();
      }
    }, 150);
  };

  const handleQuickPreset = (presetOrigin: string, presetDest: string, presetRoute = '') => {
    setOrigin(presetOrigin);
    setDestination(presetDest);
    setRouteNumber(presetRoute);
    setValidationWarning(null);
    executeSearch(presetOrigin, presetDest, presetRoute);
  };

  // Identify up to 3 upcoming eligible buses approaching the passenger on this corridor
  const approachingBuses = useMemo(() => {
    if (!hasSearched) return [];
    const directBusIds = new Set<string>();
    directResults.forEach((d) => {
      (d.eligibleBuses || []).forEach((eb: any) => directBusIds.add(eb.id));
    });
    const directRouteSet = new Set(directResults.map((d) => d.routeNumber.toLowerCase()));
    const transferLeg1Set = new Set(transferResults.map((t) => t.leg1.routeNumber.toLowerCase()));

    const matched = availableBuses
      .filter((b) => {
        if (b.status === 'out_of_service' || b.status === 'maintenance') return false;
        if (directBusIds.size > 0) {
          return directBusIds.has(b.id);
        }
        const rNum = (b.routeNumber || b.busNumber || '').toLowerCase();
        return directRouteSet.has(rNum) || transferLeg1Set.has(rNum);
      })
      .map((b) => {
        const isDirect =
          directBusIds.has(b.id) || directRouteSet.has((b.routeNumber || b.busNumber || '').toLowerCase());
        return { ...b, journeyType: isDirect ? 'Direct Journey' : 'Transfer Journey' };
      });

    matched.sort((a, b) => (a.etaNextStopMin || 0) - (b.etaNextStopMin || 0));
    return matched.slice(0, 3);
  }, [hasSearched, directResults, transferResults, availableBuses]);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-md overflow-hidden">
      {/* Top Banner Header */}
      <div className="p-6 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-2 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
            <RouteIcon className="w-3.5 h-3.5 text-blue-400" />
            <span>Chennai MTC Route Intelligence Engine</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            Plan Your Journey – From &amp; To Bus Finder
          </h2>
          <p className="text-xs text-blue-100/90 mt-1 max-w-2xl leading-relaxed">
            Search direct buses, intermediate stops, and optional line numbers across Chennai municipal transit routes. Supports typo correction and intermediate boarding.
          </p>
        </div>

        {/* Database Stats Pill */}
        <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 self-start md:self-auto">
          <Layers className="w-3.5 h-3.5 text-blue-300" />
          <span>{loadingDb ? 'Loading corridors...' : `${routesData.length} Routes • ${stopsList.length} Stops`}</span>
        </div>
      </div>

      {/* Main Search Panel */}
      <div className="p-6 space-y-4">
        {/* ROW 1: Origin, Swap, and Destination */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          {/* Starting From Input (5 Cols) */}
          <div ref={originContainerRef} className="lg:col-span-5 relative">
            <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Starting From (Origin)</span>
              </span>
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                title="Use device GPS location"
              >
                <Navigation className="w-3 h-3 text-blue-600" />
                <span>Use My Current Location</span>
              </button>
            </label>

            <div className="relative">
              <MapPin className="absolute left-3.5 top-3 w-4 h-4 text-emerald-600" />
              <input
                type="text"
                placeholder="e.g. Sholinganallur, Thiruvottriyur, T. Nagar..."
                value={origin}
                onChange={(e) => {
                  setOrigin(e.target.value);
                  setShowOriginDropdown(true);
                  setValidationWarning(null);
                }}
                onFocus={() => setShowOriginDropdown(true)}
                className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
              {origin && (
                <button
                  type="button"
                  onClick={() => {
                    setOrigin('');
                    setShowOriginDropdown(false);
                  }}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Smart Spelling Autocomplete Dropdown */}
            {showOriginDropdown && origin.trim() && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-56 overflow-y-auto divide-y divide-slate-100">
                {originSuggestions.length === 0 ? (
                  <div className="px-3.5 py-3 text-xs text-slate-400 text-center flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    <span>No matching bus stop found in Chennai database</span>
                  </div>
                ) : (
                  originSuggestions.map((s) => (
                    <button
                      key={s.canonicalName}
                      type="button"
                      onClick={() => {
                        setOrigin(s.canonicalName);
                        setShowOriginDropdown(false);
                        setValidationWarning(null);
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-800 flex items-center justify-between gap-2 transition-colors group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="font-medium text-slate-800 group-hover:text-blue-700 truncate">
                          {s.canonicalName}
                        </span>
                      </div>
                      {s.isCorrection && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                          <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                          <span>Spelling match</span>
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Swap Button (2 Cols) */}
          <div className="lg:col-span-2 flex justify-center py-1">
            <button
              type="button"
              onClick={handleSwap}
              className="p-2.5 rounded-full bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-600 border border-slate-200 shadow-xs transition-all group"
              title="Swap Origin and Destination"
            >
              <ArrowUpDown className="w-4 h-4 group-hover:rotate-180 transition-transform duration-300" />
            </button>
          </div>

          {/* Destination Input (5 Cols) */}
          <div ref={destContainerRef} className="lg:col-span-5 relative">
            <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Destination</span>
            </label>

            <div className="relative">
              <MapPin className="absolute left-3.5 top-3 w-4 h-4 text-rose-600" />
              <input
                type="text"
                placeholder="e.g. Kilambakkam, Thiruvanmiyur, Tambaram..."
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  setShowDestDropdown(true);
                  setValidationWarning(null);
                }}
                onFocus={() => setShowDestDropdown(true)}
                className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
              {destination && (
                <button
                  type="button"
                  onClick={() => {
                    setDestination('');
                    setShowDestDropdown(false);
                  }}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Smart Spelling Autocomplete Dropdown */}
            {showDestDropdown && destination.trim() && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-56 overflow-y-auto divide-y divide-slate-100">
                {destSuggestions.length === 0 ? (
                  <div className="px-3.5 py-3 text-xs text-slate-400 text-center flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    <span>No matching bus stop found in Chennai database</span>
                  </div>
                ) : (
                  destSuggestions.map((s) => (
                    <button
                      key={s.canonicalName}
                      type="button"
                      onClick={() => {
                        setDestination(s.canonicalName);
                        setShowDestDropdown(false);
                        setValidationWarning(null);
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-800 flex items-center justify-between gap-2 transition-colors group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span className="font-medium text-slate-800 group-hover:text-blue-700 truncate">
                          {s.canonicalName}
                        </span>
                      </div>
                      {s.isCorrection && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                          <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                          <span>Spelling match</span>
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* ROW 2: Optional Bus Route Number Input (Placed directly below Destination in right column) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          <div className="hidden lg:block lg:col-span-7 text-xs text-slate-400">
            <span className="italic">
              Tip: You can search directly by Origin &amp; Destination, or enter a specific MTC route number to narrow results.
            </span>
          </div>

          <div ref={routeContainerRef} className="lg:col-span-5 relative">
            <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Bus className="w-3.5 h-3.5 text-blue-600" />
                <span>Bus Route Number (Optional)</span>
              </span>
              <span className="text-[10px] font-medium text-slate-400">e.g. 95X, 555S, 21G</span>
            </label>

            <div className="relative">
              <input
                type="text"
                placeholder="e.g. 95X, 555S, 21G..."
                value={routeNumber}
                onChange={(e) => {
                  setRouteNumber(e.target.value);
                  setShowRouteDropdown(true);
                  setValidationWarning(null);
                }}
                onFocus={() => setShowRouteDropdown(true)}
                className="w-full pl-3.5 pr-8 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-mono"
              />
              {routeNumber && (
                <button
                  type="button"
                  onClick={() => {
                    setRouteNumber('');
                    setShowRouteDropdown(false);
                  }}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Autocomplete Dropdown for Valid Route Numbers */}
            {showRouteDropdown && routeSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-slate-100">
                {routeSuggestions.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setRouteNumber(r);
                      setShowRouteDropdown(false);
                      setValidationWarning(null);
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-800 flex items-center justify-between transition-colors font-mono"
                  >
                    <span className="font-bold text-blue-700 flex items-center gap-2">
                      <Bus className="w-3.5 h-3.5 text-blue-600" />
                      <span>Route {r}</span>
                    </span>
                    <span className="text-[10px] font-medium text-slate-400">MTC Corridor</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Validation Warning Alert */}
        {validationWarning && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-start gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{validationWarning}</div>
            <button
              onClick={() => setValidationWarning(null)}
              className="text-amber-500 hover:text-amber-800 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Location Notice / Feedback */}
        {locationNotice && (
          <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>{locationNotice}</span>
            </span>
            <button onClick={() => setLocationNotice(null)} className="text-blue-400 hover:text-blue-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Quick Test Preset Shortcuts Required by Specification */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-slate-400 font-semibold text-[11px]">Quick Corridor Tests:</span>
          {[
            { from: 'Guindy', to: 'Tambaram', route: '21G', label: 'Guindy ➔ Tambaram (21G)' },
            { from: 'Sholinganallur', to: 'Kilambakkam', route: '95X', label: 'Sholinganallur ➔ Kilambakkam (95X)' },
            { from: 'Sholinganallur', to: 'Kilambakkam', route: '555S', label: 'Sholinganallur ➔ Kilambakkam (555S)' },
            { from: 'Sholinganallur', to: 'Thiruvanmiyur', route: '', label: 'Sholinganallur ➔ Thiruvanmiyur' },
            { from: 'Thiruvottriyur', to: 'Thiruvanmiyur', route: '1', label: 'Thiruvottriyur ➔ Thiruvanmiyur' },
            { from: 'Thiyagaraya Nagar', to: 'Thiruvanmiyur', route: '3', label: 'T. Nagar ➔ Thiruvanmiyur' },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handleQuickPreset(preset.from, preset.to, preset.route)}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 font-medium transition-colors border border-slate-200 text-[11px]"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={() => executeSearch()}
            disabled={!origin.trim() || !destination.trim() || isSearching}
            className="w-full sm:w-auto px-6 py-3 text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Search className={`w-4 h-4 ${isSearching ? 'animate-spin' : ''}`} />
            <span>{isSearching ? 'Finding Matching Routes...' : 'Search Available Buses'}</span>
          </button>
        </div>
      </div>

      {/* SEARCH RESULTS VIEW */}
      {hasSearched && (
        <div className="p-6 bg-slate-50 border-t border-slate-200 space-y-6">
          {/* Active Filter Indicator if Route Number was entered */}
          {activeRouteFilter && (
            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
              <div className="flex items-center gap-2 font-semibold">
                <Filter className="w-3.5 h-3.5 text-blue-600" />
                <span>Filtered by Route Number: <strong>{activeRouteFilter}</strong></span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRouteNumber('');
                  executeSearch(origin, destination, '');
                }}
                className="text-xs text-blue-700 hover:text-blue-900 font-bold underline cursor-pointer"
              >
                Clear route filter (Show all buses)
              </button>
            </div>
          )}

          {/* SECTION 4: BUSES APPROACHING THE PASSENGER */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Buses Approaching Passenger (Next 3 Eligible Buses)</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Showing active vehicles on routes serving {origin} towards {destination}
                  {activeRouteFilter ? ` [Route ${activeRouteFilter}]` : ''}
                </p>
              </div>
              <span className="text-[11px] font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                GPS Source: SIMULATED
              </span>
            </div>

            {approachingBuses.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {approachingBuses.map((bus) => (
                  <div
                    key={bus.id}
                    className="p-4 bg-white rounded-2xl border-2 border-blue-200/80 hover:border-blue-500 shadow-sm transition-all space-y-2.5 font-sans"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="font-extrabold text-base text-blue-700 font-mono">
                        Route: {bus.routeNumber || bus.busNumber}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        {bus.journeyType}
                      </span>
                    </div>

                    {/* Standardized 6-line card block format */}
                    <div className="space-y-1 text-xs text-slate-700 font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-500">People:</span>
                        <span className="font-bold text-slate-900">{bus.currentPassengers} / {bus.capacity}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Occupancy:</span>
                        <span className="font-bold text-slate-900">{bus.crowdPercentage}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Crowd:</span>
                        <CrowdBadge level={bus.crowdCategory} size="sm" />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Next Stop:</span>
                        <span className="font-bold text-slate-900 truncate max-w-[140px]">{bus.nextStopName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">ETA:</span>
                        <span className="font-bold text-emerald-600">~{bus.etaNextStopMin} min</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-100 text-[11px]">
                        <span className="text-slate-400">GPS Source:</span>
                        <span className="font-bold text-amber-600">SIMULATED</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-white border border-slate-200 text-xs text-slate-500 text-center">
                No active simulated vehicles currently approaching this stop in real-time. Standard schedule options are listed below.
              </div>
            )}
          </div>

          {/* SECTION 5: MATCHED DIRECT ROUTES */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Bus className="w-4 h-4 text-blue-600" />
                <span>Direct Bus Options ({directResults.length})</span>
              </h3>
              {directResults.length > 0 && (
                <span className="text-xs text-slate-500 font-medium">
                  Showing ordered stops from Google Sheets
                </span>
              )}
            </div>

            {directResults.length > 0 ? (
              <div className="space-y-4">
                {directResults.map((journey) => (
                  <div
                    key={journey.id}
                    className="p-5 bg-white rounded-2xl border border-slate-200 hover:border-blue-300 shadow-sm transition-all space-y-4"
                  >
                    {/* Header: Public Route Number & Corridor Info */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-xl bg-blue-600 text-white font-mono font-extrabold text-lg shadow-xs">
                            Route: {journey.routeNumber}
                          </span>
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 font-semibold text-slate-700 border border-slate-200">
                            {journey.category}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 font-medium">
                          Terminal Route: <strong>{journey.origin}</strong> ➔ <strong>{journey.destination}</strong>
                        </p>
                      </div>

                      {/* Six-Attribute Metric Card */}
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono space-y-1 min-w-[200px]">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Route:</span>
                          <span className="font-bold text-blue-700">{journey.routeNumber}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">People:</span>
                          <span className="font-bold text-slate-800">
                            {journey.currentPassengers !== undefined ? `${journey.currentPassengers} / ${journey.capacity}` : 'Scheduled'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Occupancy:</span>
                          <span className="font-bold text-slate-800">
                            {journey.crowdPercentage !== undefined ? `${journey.crowdPercentage}%` : 'Normal'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500">Crowd:</span>
                          <CrowdBadge level={journey.crowdLevel || 'LOW'} size="sm" />
                        </div>
                        <div className="flex justify-between text-[11px] pt-1 border-t border-slate-200 text-slate-400">
                          <span>GPS Source:</span>
                          <span className="font-bold text-amber-600">SIMULATED</span>
                        </div>
                      </div>
                    </div>

                    {/* Journey Scope: From Your Stop To Destination */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2">
                      <div className="flex items-center justify-between font-bold text-slate-800">
                        <span className="flex items-center gap-1.5 text-emerald-700">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>Board at: {journey.passengerOrigin}</span>
                        </span>
                        <span className="text-slate-400">➔</span>
                        <span className="flex items-center gap-1.5 text-rose-700">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>Alight at: {journey.passengerDestination}</span>
                        </span>
                      </div>

                      {/* Intermediate Ordered Stops Pill Timeline */}
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                          Ordered Intermediate Stops ({journey.intermediateStopsCount} stops):
                        </span>
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                          {journey.journeyStops.slice(1, -1).map((st, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-white border border-slate-200 text-slate-700"
                            >
                              {idx + 1}. {st}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Operational Notes */}
                      {journey.notes && (
                        <p className="text-[11px] text-amber-800 bg-amber-50/80 p-2 rounded-lg border border-amber-200/60 leading-normal">
                          <strong>Note:</strong> {journey.notes}
                        </p>
                      )}
                    </div>

                    {/* Footer Metrics & View Route on Map Action */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs">
                      <div className="flex items-center gap-4 text-slate-500 font-medium">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          <span>Est. Duration: <strong>~{journey.estimatedDurationMin} min</strong></span>
                        </span>
                        <span>Distance: <strong>{journey.distanceKm} km</strong></span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          onSelectJourney({
                            ...journey,
                            searchId: `search_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                          })
                        }
                        className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-colors self-end sm:self-auto cursor-pointer"
                      >
                        <span>View Route on Map</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* NO DIRECT ROUTE FOUND */
              <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
                <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
                <h4 className="text-base font-bold text-slate-800">
                  No direct bus found from &quot;{origin}&quot; to &quot;{destination}&quot;
                  {activeRouteFilter ? ` matching Route ${activeRouteFilter}` : ''}
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  {activeRouteFilter
                    ? `Route ${activeRouteFilter} does not directly connect these two stops in this direction. Try clearing the route number to view connecting or alternate routes.`
                    : 'No single forward MTC route in the dataset connects both stops in this direction. Consider reviewing the connecting transfer routes below.'}
                </p>
              </div>
            )}
          </div>

          {/* 1-TRANSFER MULTI-BUS CONNECTIONS (if available) */}
          {transferResults.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-slate-200">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>Multi-Bus Transfer Connections (1 Transfer):</span>
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-800">
                  {transferResults.length} option{transferResults.length === 1 ? '' : 's'}
                </span>
              </h4>

              <div className="space-y-3">
                {transferResults.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3 text-xs"
                  >
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-extrabold">
                          {t.leg1.routeNumber}
                        </span>
                        <span>➔</span>
                        <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold">
                          Transfer at: {t.transferStop}
                        </span>
                        <span>➔</span>
                        <span className="px-2.5 py-1 rounded-lg bg-purple-600 text-white font-extrabold">
                          {t.leg2.routeNumber}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-emerald-600 font-extrabold text-sm block">
                          ~{t.totalDurationMin} min total
                        </span>
                        <span className="text-[10px] text-slate-400">{t.totalDistanceKm} km total</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600">
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <strong className="text-blue-700 block mb-0.5">Leg 1: Bus {t.leg1.routeNumber}</strong>
                        <span>{t.origin} ➔ {t.transferStop} ({t.leg1.intermediateStopsCount} intermediate stops)</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <strong className="text-purple-700 block mb-0.5">Leg 2: Bus {t.leg2.routeNumber}</strong>
                        <span>{t.transferStop} ➔ {t.destination} ({t.leg2.intermediateStopsCount} intermediate stops)</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

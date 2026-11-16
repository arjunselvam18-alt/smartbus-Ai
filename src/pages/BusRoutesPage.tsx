import React, { useState, useRef, useEffect } from 'react';
import { Bus, BusRoute, BusStop } from '../types';
import { CrowdBadge } from '../components/common/CrowdBadge';
import { MatchedJourney } from '../services/routeEngine';
import {
  Route as RouteIcon,
  Navigation,
  Bus as BusIcon,
} from 'lucide-react';

interface BusRoutesPageProps {
  routes: BusRoute[];
  buses: Bus[];
  stops: BusStop[];
  onSelectRoute?: (routeId: string) => void;
  onNavigate: (page: string, params?: any) => void;
}

export const BusRoutesPage: React.FC<BusRoutesPageProps> = ({
  routes,
  buses,
  onNavigate,
}) => {
  const [selectedRouteId, setSelectedRouteId] = useState<string>(routes[0]?.id || '');
  const [selectionTrigger, setSelectionTrigger] = useState(0);
  const detailsRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef(false);

  const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];

  useEffect(() => {
    if (!pendingScrollRef.current || !activeRoute || !detailsRef.current) return;
    pendingScrollRef.current = false;
    const rafId = window.requestAnimationFrame(() => {
      detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [activeRoute?.id, selectionTrigger]);

  const handleSelectRoute = (routeId: string) => {
    pendingScrollRef.current = true;
    setSelectedRouteId(routeId);
    setSelectionTrigger((c) => c + 1);
  };

  const activeBusesOnRoute = buses.filter(
    (b) =>
      b.status !== 'out_of_service' &&
      b.status !== 'maintenance' &&
      b.routeId === activeRoute?.id
  );

  const handleTrackRouteOnMap = (route: BusRoute) => {
    const sortedStops = (route.stops || [])
      .slice()
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    const stopNames = sortedStops.map((s) => s.stopName);
    const waypoints: [number, number][] =
      route.pathWaypoints && route.pathWaypoints.length >= 2
        ? route.pathWaypoints
        : sortedStops
            .filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number')
            .map((s) => [s.latitude, s.longitude] as [number, number]);

    const journey: MatchedJourney = {
      id: route.id,
      routeNumber: route.routeNumber,
      origin: route.startPoint,
      destination: route.endPoint,
      passengerOrigin: stopNames[0] || route.startPoint,
      passengerDestination: stopNames[stopNames.length - 1] || route.endPoint,
      allStops: stopNames,
      viaStops: stopNames.slice(1, -1),
      journeyStops: stopNames,
      intermediateStopsCount: Math.max(0, stopNames.length - 2),
      estimatedDurationMin: route.estimatedDurationMin,
      distanceKm: route.distanceKm,
      category: 'Transit Line',
      color: route.color || '#1a73e8',
      hasLiveGps: activeBusesOnRoute.length > 0,
      waypoints,
      unresolvedStops: [],
      searchId: `search_route_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    };

    onNavigate('tracking', { plannedJourney: journey });
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <RouteIcon className="w-5 h-5 text-blue-600" />
            <span>Bus Routes & Corridors</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Explore bus lines, ordered stop sequences, travel durations, and fleet allocation.
          </p>
        </div>

        <button
          onClick={() => onNavigate('admin')}
          className="px-3.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-200 transition-colors self-start sm:self-auto"
        >
          Manage Routes in Admin
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Route List (4 Cols) */}
        <div className="lg:col-span-4 space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
            Available Lines ({routes.length})
          </p>
          <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
            {routes.map((route) => {
              const isSelected = route.id === activeRoute?.id;
              const busesCount = buses.filter(
                (b) =>
                  b.status !== 'out_of_service' &&
                  b.status !== 'maintenance' &&
                  b.routeId === route.id
              ).length;

              return (
                <div
                  key={route.id}
                  onClick={() => handleSelectRoute(route.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/80 border-blue-400 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-extrabold text-slate-900 text-sm">
                        {route.routeNumber}
                      </span>
                      <p className="text-xs text-slate-600 font-medium mt-0.5">
                        {route.routeName}
                      </p>
                    </div>
                    <span
                      className="w-3 h-3 rounded-full shrink-0 mt-1"
                      style={{ backgroundColor: route.color || '#3b82f6' }}
                    />
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 text-xs text-slate-500">
                    <span>{route.stops.length} stops • {route.distanceKm} km</span>
                    <span className="font-semibold text-blue-600">{busesCount} buses active</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Selected Route Detailed Timeline (8 Cols) */}
        {activeRoute && (
          <div ref={detailsRef} className="lg:col-span-8 space-y-6 scroll-mt-20">
            {/* Route Summary Card */}
            <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 text-xs font-bold rounded-lg bg-blue-100 text-blue-800">
                      Line {activeRoute.routeNumber}
                    </span>
                    <span className="text-xs text-slate-400">• {activeRoute.city} Transit</span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 mt-1">
                    {activeRoute.routeName}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Origin: <strong className="text-slate-700">{activeRoute.startPoint}</strong> • Destination:{' '}
                    <strong className="text-slate-700">{activeRoute.endPoint}</strong>
                    {activeRoute.stops.length > 2 && (
                      <>
                        {' '}
                        • Via:{' '}
                        {activeRoute.stops
                          .slice(1, -1)
                          .slice(0, 4)
                          .map((s) => s.stopName)
                          .join(', ')}
                        {activeRoute.stops.length - 2 > 4
                          ? ` +${activeRoute.stops.length - 6} more`
                          : ''}
                      </>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Distance</span>
                    <p className="text-xs font-bold text-slate-800 font-mono">
                      {activeRoute.distanceKm} km
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Frequency</span>
                    <p className="text-xs font-bold text-slate-800 font-mono">
                      Every {activeRoute.frequencyMinutes} min
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Est. Trip</span>
                    <p className="text-xs font-bold text-emerald-600 font-mono">
                      ~{activeRoute.estimatedDurationMin} min
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTrackRouteOnMap(activeRoute)}
                    className="px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Track on Live Map</span>
                  </button>
                </div>
              </div>

              {/* Active Fleet on this corridor */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-2">
                  Active Buses on this Corridor ({activeBusesOnRoute.length}):
                </p>
                {activeBusesOnRoute.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeBusesOnRoute.map((bus) => (
                      <div
                        key={bus.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <BusIcon className="w-4 h-4 text-blue-600" />
                          <div>
                            <span className="font-bold text-slate-900">{bus.busNumber}</span>
                            <p className="text-[10px] text-slate-500">
                              Speed: {bus.speedKmh} km/h
                              {bus.nextStopName
                                ? ` • Next: ${bus.nextStopName} (~${bus.etaNextStopMin || 1} min)`
                                : ''}
                            </p>
                          </div>
                        </div>
                        <CrowdBadge level={bus.crowdCategory} percentage={bus.crowdPercentage} size="sm" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No buses currently active on this line.</p>
                )}
              </div>

              {/* Ordered Stop Timeline */}
              <div className="pt-2">
                <p className="text-xs font-bold text-slate-700 mb-3">
                  Stop Sequence & Transit Times:
                </p>
                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-blue-200">
                  {activeRoute.stops.map((st, idx) => (
                    <div key={`${st.stopId}_${idx}`} className="relative flex items-start justify-between text-xs group">
                      {/* Node Indicator */}
                      <span className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-white border-2 border-blue-500 flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      </span>

                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-slate-800 text-sm">{st.stopName}</strong>
                          <span className="text-[10px] text-slate-400 font-mono">
                            #{idx + 1}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {st.distanceFromStartKm} km from origin
                        </p>
                      </div>

                      <div className="text-right text-xs">
                        <span className="font-mono text-slate-600">
                          +{st.typicalTimeMinutes} min
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


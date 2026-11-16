import React, { useState, useRef, useEffect } from 'react';
import { Bus, BusRoute, BusStop, NextBusArrival } from '../types';
import { CrowdBadge } from '../components/common/CrowdBadge';
import { storageService } from '../services/storage';
import {
  MapPin,
  Search,
  Bus as BusIcon,
  Clock,
  Compass,
  ArrowRight,
  Shield,
  Layers,
} from 'lucide-react';

interface BusStopsPageProps {
  stops: BusStop[];
  routes: BusRoute[];
  buses: Bus[];
  arrivals: NextBusArrival[];
  onNavigate: (page: string) => void;
}

export const BusStopsPage: React.FC<BusStopsPageProps> = ({
  stops,
  routes,
  buses,
  arrivals,
  onNavigate,
}) => {
  const [search, setSearch] = useState('');
  const [selectedStopId, setSelectedStopId] = useState<string>(stops[0]?.id || '');
  const [selectionTrigger, setSelectionTrigger] = useState(0);
  const detailsRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef(false);

  const filteredStops = stops.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.city.toLowerCase().includes(search.toLowerCase())
  );

  const activeStop = stops.find((s) => s.id === selectedStopId) || stops[0];
  const activeStopNorm = activeStop?.name?.toLowerCase().trim() || '';

  useEffect(() => {
    if (!pendingScrollRef.current || !activeStop || !detailsRef.current) return;
    pendingScrollRef.current = false;
    const rafId = window.requestAnimationFrame(() => {
      detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [activeStop?.id, selectionTrigger]);

  const handleSelectStop = (stopId: string) => {
    pendingScrollRef.current = true;
    setSelectedStopId(stopId);
    setSelectionTrigger((c) => c + 1);
  };

  // Find routes passing through this stop (match by stopId or normalized stopName)
  const servingRoutes = activeStop
    ? routes.filter((r) =>
        (r.stops || []).some(
          (st) =>
            st.stopId === activeStop.id ||
            (activeStopNorm && st.stopName?.toLowerCase().trim() === activeStopNorm)
        )
      )
    : [];

  // Incoming buses predicted for this stop (combine stop-specific arrivals with global prop arrivals)
  const stopArrivals = React.useMemo(() => {
    if (!activeStop) return [];
    const directStopArrivals = storageService.getNextArrivals(activeStop.id);
    const propMatching = arrivals.filter(
      (a) =>
        a.stopId === activeStop.id ||
        (activeStopNorm && a.stopName?.toLowerCase().trim() === activeStopNorm)
    );
    const merged: NextBusArrival[] = [];
    const seen = new Set<string>();
    [...directStopArrivals, ...propMatching].forEach((a) => {
      const k = `${a.busNumber}_${a.routeNumber}`;
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(a);
      }
    });
    return merged.sort((a, b) => a.estimatedArrivalMin - b.estimatedArrivalMin);
  }, [activeStop?.id, activeStopNorm, arrivals, buses]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            <span>Bus Stops & Passenger Hubs</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Geographic stop coordinates, serving transit lines, and live incoming bus crowd alerts.
          </p>
        </div>

        {/* Stop Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search stop name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Stops Directory (4 Cols) */}
        <div className="lg:col-span-5 space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
            Stops Directory ({filteredStops.length})
          </p>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredStops.map((stop) => {
              const isSelected = stop.id === activeStop?.id;
              return (
                <div
                  key={stop.id}
                  onClick={() => handleSelectStop(stop.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/90 border-blue-400 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-extrabold text-slate-900 text-sm">
                        {stop.name}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {stop.address || `${stop.city} Corridor`}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                      {stop.code}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100 text-[11px] text-slate-400 font-mono">
                    <span>
                      {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
                    </span>
                    <span className="text-blue-600 font-sans font-semibold">
                      {stop.shelterAvailable ? 'Sheltered' : 'Standard'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Selected Stop Details & Next Arrivals (7 Cols) */}
        {activeStop && (
          <div ref={detailsRef} className="lg:col-span-7 space-y-5 scroll-mt-20">
            {/* Stop Information Card */}
            <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-blue-100 text-blue-700">
                    {activeStop.code}
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 mt-1">
                    {activeStop.name}
                  </h2>
                  <p className="text-xs text-slate-500">{activeStop.address}</p>
                </div>

                <div className="text-right text-xs">
                  <span className="text-[10px] text-slate-400 font-mono block">GPS Coordinates</span>
                  <span className="font-mono text-slate-700 font-semibold">
                    {activeStop.latitude.toFixed(5)}° N, {activeStop.longitude.toFixed(5)}° E
                  </span>
                </div>
              </div>

              {/* Lines Serving this Stop */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-2">Routes Serving This Stop:</p>
                <div className="flex flex-wrap gap-2">
                  {servingRoutes.map((r) => (
                    <span
                      key={r.id}
                      className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1.5"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: r.color || '#3b82f6' }}
                      />
                      <span>{r.routeNumber}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Next Incoming Buses to this Stop */}
            <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600" />
                <span>Next Incoming Buses to {activeStop.name}</span>
              </h3>

              {stopArrivals.length > 0 ? (
                <div className="space-y-3">
                  {stopArrivals.map((arr) => (
                    <div
                      key={arr.id}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-sm">
                            {arr.busNumber}
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-200 text-slate-700">
                            {arr.routeNumber}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Destination: <strong>{arr.destination}</strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <CrowdBadge level={arr.crowdCategory} percentage={arr.crowdPercentage} />
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block">Estimated Arrival</span>
                          <span className="text-sm font-extrabold text-emerald-600">
                            ~{arr.estimatedArrivalMin} min
                          </span>
                          {arr.scheduledTime && (
                            <span className="text-[10px] text-slate-400 font-mono block">
                              {arr.scheduledTime}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                  No immediate bus arrivals scheduled within the next 15 minutes for this stop.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

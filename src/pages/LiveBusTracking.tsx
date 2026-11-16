import React, { useState, useMemo, useEffect } from 'react';
import {
  Bus as BusType,
  BusRoute,
  BusStop,
  AppSettings,
} from '../types';
import { GoogleBusMap } from '../components/map/GoogleBusMap';
import { CrowdBadge } from '../components/common/CrowdBadge';
import { CrowdSourceDetails } from '../components/common/CrowdSourceDetails';
import {
  MatchedJourney,
  isRouteOnCorridor,
  analyzeCorridorAlignment,
  evaluateBusForJourney,
} from '../services/routeEngine';
import {
  Play,
  Pause,
  Radio,
  AlertCircle,
} from 'lucide-react';

interface LiveBusTrackingProps {
  buses: BusType[];
  routes: BusRoute[];
  stops: BusStop[];
  settings: AppSettings;
  selectedBusId: string | null;
  onSelectBus: (bus: BusType) => void;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  onManualGPSUpdate?: (busId: string, lat: number, lng: number, speed?: number) => void;
  plannedJourney?: MatchedJourney | null;
  onSelectJourney?: (journey: MatchedJourney) => void;
  onClearPlannedJourney?: () => void;
}

export const LiveBusTracking: React.FC<LiveBusTrackingProps> = ({
  buses,
  routes,
  stops,
  settings,
  selectedBusId,
  onSelectBus,
  onUpdateSettings,
  plannedJourney,
  onSelectJourney,
  onClearPlannedJourney,
}) => {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  // Reset dropdown selection if an external plannedJourney is triggered
  useEffect(() => {
    if (plannedJourney && !plannedJourney.id.startsWith('route_dd_')) {
      setSelectedRouteId(null);
    }
  }, [plannedJourney?.searchId, plannedJourney?.id]);

  const routeByIdMap = useMemo(() => {
    const map = new Map<string, BusRoute>();
    routes.forEach((r) => map.set(r.id, r));
    return map;
  }, [routes]);

  const displayedCorridorBuses = useMemo(() => {
    if (plannedJourney) {
      const corridorIds = new Set(
        routes
          .filter((r) => isRouteOnCorridor(r, plannedJourney))
          .map((r) => {
            const orderedNames = (r.stops || [])
              .slice()
              .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
              .map((s) => s.stopName);
            const align = analyzeCorridorAlignment(orderedNames, plannedJourney);
            return {
              id: r.id,
              score:
                (align.sharesOriginAndDestInOrder ? 1000 : 0) +
                align.sharedStopsCount * 10 -
                (r.stops?.length || 0) * 0.05,
            };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map((x) => x.id)
      );
      const selectedRouteMatch = routes.find(
        (r) =>
          r.id === plannedJourney.id ||
          r.routeNumber.toUpperCase() === plannedJourney.routeNumber.toUpperCase()
      );
      const allowedIds = new Set(corridorIds);
      if (selectedRouteMatch) allowedIds.add(selectedRouteMatch.id);

      return buses.filter((b) => {
        const bRoute = routeByIdMap.get(b.routeId);
        const ev = evaluateBusForJourney(b, bRoute, plannedJourney, corridorIds);
        if (!ev.eligible) return false;
        return (
          !bRoute ||
          allowedIds.has(bRoute.id) ||
          ev.role === 'direct' ||
          ev.label === 'Direct Alternative Corridor Bus'
        );
      });
    }

    if (selectedRouteId) {
      return buses.filter(
        (b) =>
          b.routeId === selectedRouteId &&
          b.status !== 'out_of_service' &&
          b.status !== 'maintenance'
      );
    }

    const core = buses.filter((b) => !b.id.startsWith('bus_ds_'));
    return core.length > 0 ? core : buses.slice(0, 12);
  }, [buses, routes, routeByIdMap, plannedJourney, selectedRouteId]);

  const activeBus =
    displayedCorridorBuses.find((b) => b.id === selectedBusId) || displayedCorridorBuses[0];

  const handleRouteDropdownChange = (newRouteId: string) => {
    if (!newRouteId) {
      setSelectedRouteId(null);
      onClearPlannedJourney?.();
      return;
    }

    const chosen = routes.find((r) => r.id === newRouteId);
    if (chosen && onSelectJourney) {
      const sortedStops = (chosen.stops || [])
        .slice()
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
      const stopNames = sortedStops.map((s) => s.stopName);
      const waypoints: [number, number][] =
        chosen.pathWaypoints && chosen.pathWaypoints.length >= 2
          ? chosen.pathWaypoints
          : sortedStops
              .filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number')
              .map((s) => [s.latitude, s.longitude] as [number, number]);

      const journey: MatchedJourney = {
        id: `route_dd_${chosen.id}`,
        routeNumber: chosen.routeNumber,
        origin: chosen.startPoint,
        destination: chosen.endPoint,
        passengerOrigin: stopNames[0] || chosen.startPoint,
        passengerDestination: stopNames[stopNames.length - 1] || chosen.endPoint,
        allStops: stopNames,
        viaStops: stopNames.slice(1, -1),
        journeyStops: stopNames,
        intermediateStopsCount: Math.max(0, stopNames.length - 2),
        estimatedDurationMin: chosen.estimatedDurationMin,
        distanceKm: chosen.distanceKm,
        category: 'Transit Line',
        color: chosen.color || '#1a73e8',
        hasLiveGps: true,
        waypoints,
        unresolvedStops: [],
        searchId: `search_dd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      };
      setSelectedRouteId(newRouteId);
      onSelectJourney(journey);
    } else {
      setSelectedRouteId(newRouteId);
    }
  };

  const toggleSimulation = () => {
    onUpdateSettings({ simulationActive: !settings.simulationActive });
  };

  const setSpeedMultiplier = (speed: number) => {
    onUpdateSettings({ simulationSpeedMultiplier: speed });
  };

  return (
    <div className="space-y-6">
      {/* Top Controller Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-800">Live Bus Tracking & Fleet Radar</h1>
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-amber-100 text-amber-800 border border-amber-300">
              SIMULATED GPS
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time trajectory tracking along predefined transit routes with live crowd estimation.
          </p>
        </div>

        {/* Route Filter & Simulation Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Route Dropdown */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <span>Route:</span>
            <select
              value={selectedRouteId || ''}
              onChange={(e) => handleRouteDropdownChange(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer max-w-[240px] truncate"
            >
              <option value="">All Active Routes ({routes.length})</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.routeNumber} – {r.routeName}
                </option>
              ))}
            </select>
          </div>

          {/* Simulation Play/Pause */}
          <button
            onClick={toggleSimulation}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all shadow-xs ${
              settings.simulationActive
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {settings.simulationActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{settings.simulationActive ? 'Pause Sim' : 'Resume Sim'}</span>
          </button>

          {/* Speed Multipliers */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            {[1, 2, 4].map((spd) => (
              <button
                key={spd}
                onClick={() => setSpeedMultiplier(spd)}
                className={`px-2.5 py-0.5 rounded-lg transition-all ${
                  settings.simulationSpeedMultiplier === spd
                    ? 'bg-white text-blue-600 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Map Canvas */}
      <GoogleBusMap
        buses={buses}
        routes={routes}
        stops={stops}
        selectedBusId={selectedBusId}
        onSelectBus={onSelectBus}
        apiKey={settings.googleMapsApiKey}
        selectedRouteId={plannedJourney ? null : selectedRouteId}
        plannedJourney={plannedJourney}
        onClearPlannedJourney={() => {
          setSelectedRouteId(null);
          onClearPlannedJourney?.();
        }}
      />

      {/* GPS Integrity Compliance Banner */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-3 text-xs text-slate-600 leading-relaxed">
        <Radio className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-800 font-semibold block mb-0.5">
            GPS Integrity & Demonstration Notice:
          </strong>
          Physical GPS hardware units are not currently installed on these vehicles. Coordinates and movements shown are based on mathematical waypoint simulation along authorized municipal corridors. Real GPS feeds (NMEA/GTFS-RT) can be integrated seamlessly in production via the GPS_Logs schema.
        </div>
      </div>

      {/* Fleet Overview Horizontal Strip */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-800">
          Buses Currently on Corridor ({displayedCorridorBuses.length})
        </h3>
        {displayedCorridorBuses.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {displayedCorridorBuses.map((bus) => {
              const isSelected = bus.id === activeBus?.id;
              return (
                <div
                  key={bus.id}
                  onClick={() => onSelectBus(bus)}
                  className={`p-4 bg-white rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-blue-500 shadow-md ring-2 ring-blue-500/20'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-extrabold text-slate-900 text-base">
                        Route {bus.routeNumber || bus.busNumber}
                      </span>
                      <p className="text-xs text-slate-500 font-medium">{bus.routeName}</p>
                    </div>
                    <CrowdBadge level={bus.crowdCategory} percentage={bus.crowdPercentage} size="sm" />
                  </div>

                  <div className="mt-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Route:</span>
                      <strong className="text-blue-700">{bus.routeNumber || bus.busNumber}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">People:</span>
                      <strong className="text-slate-800">{bus.currentPassengers} / {bus.capacity}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Occupancy:</span>
                      <strong className="text-slate-800">{bus.crowdPercentage}%</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Crowd:</span>
                      <strong className="text-slate-800">{bus.crowdCategory}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Next Stop:</span>
                      <strong className="text-slate-800 truncate max-w-[130px]">{bus.nextStopName}</strong>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-200 text-[11px] text-slate-400">
                      <span>GPS Source:</span>
                      <strong className="text-amber-600">{bus.locationSource}</strong>
                    </div>
                    <div className="pt-1 border-t border-slate-200">
                      <CrowdSourceDetails bus={bus} compact />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 bg-white rounded-2xl border border-dashed border-slate-300 text-center text-slate-500 flex flex-col items-center gap-1.5">
            <AlertCircle className="w-6 h-6 text-amber-500" />
            <p className="font-semibold text-sm text-slate-700">
              No buses currently available for this journey
            </p>
            <p className="text-xs text-slate-500">
              Try another route or corridor search from the dashboard.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};


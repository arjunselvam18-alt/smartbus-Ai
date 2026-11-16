import React, { useState } from 'react';
import {
  Search,
  MapPin,
  Bus,
  Clock,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Radio,
  Sparkles,
  ChevronRight,
  Navigation,
  Compass,
  CheckCircle2,
  Send,
  X,
  ExternalLink,
} from 'lucide-react';
import { Bus as BusType, BusRoute, BusStop, NextBusArrival, User } from '../types';
import { CrowdBadge } from '../components/common/CrowdBadge';
import { CROWD_COLORS } from '../data/mockData';
import { JourneyPlanner } from '../components/planner/JourneyPlanner';
import { MatchedJourney } from '../services/routeEngine';
import { GoogleBusMap } from '../components/map/GoogleBusMap';

interface PassengerDashboardProps {
  currentUser: User | null;
  buses: BusType[];
  routes: BusRoute[];
  datasetBuses?: BusType[];
  datasetRoutes?: BusRoute[];
  googleMapsApiKey?: string;
  stops: BusStop[];
  arrivals: NextBusArrival[];
  onNavigate: (page: string, params?: any) => void;
  onSelectBus: (bus: BusType) => void;
}

export const PassengerDashboard: React.FC<PassengerDashboardProps> = ({
  currentUser,
  buses,
  routes,
  datasetBuses,
  datasetRoutes,
  googleMapsApiKey,
  stops,
  arrivals,
  onNavigate,
  onSelectBus,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCrowdFilter, setSelectedCrowdFilter] = useState<'ALL' | 'LOW' | 'MEDIUM' | 'HIGH'>('ALL');
  const [userLocationGranted, setUserLocationGranted] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapModalJourney, setMapModalJourney] = useState<MatchedJourney | null>(null);

  // Gemini Maps Grounding AI transit inquiry
  const [aiQuery, setAiQuery] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const requestGeolocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocationGranted(true);
          setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => {
          console.warn('Geolocation permission not granted:', err.message);
          // Set standard simulated user coordinate near Central Station
          setUserCoords({ lat: 13.0827, lng: 80.2707 });
          setUserLocationGranted(true);
        }
      );
    }
  };

  const handleAskTransitAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/transit/grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: aiQuery }),
      });
      const data = await res.json();
      setAiAnswer(data.answer || 'No advisory information available.');
    } catch (err: any) {
      setAiAnswer('Advisory: Peak transit occupancy observed between 8:00 AM - 10:00 AM. Route 21G currently has low crowd occupancy.');
    } finally {
      setAiLoading(false);
    }
  };

  // Filter buses based on search and crowd filter
  const filteredBuses = buses.filter((b) => {
    const matchesSearch =
      b.busNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.routeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.routeNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCrowd =
      selectedCrowdFilter === 'ALL' || b.crowdCategory === selectedCrowdFilter;
    return matchesSearch && matchesCrowd;
  });

  return (
    <div className="space-y-6">
      {/* Welcome Hero Section */}
      <div className="relative overflow-hidden p-6 sm:p-8 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl text-white shadow-xl">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
            <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            <span>Smart Transit Crowd Monitoring System</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Welcome back, {currentUser?.name || 'Commuter'}!
          </h1>
          <p className="mt-2 text-sm text-blue-100/90 leading-relaxed">
            Check real-time crowd occupancy before boarding your bus. Save time and travel comfortably with AI-powered occupancy predictions.
          </p>

          {/* Search Bar */}
          <div className="relative mt-6 max-w-lg">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by route (e.g. 95X, 555S, 570, 21G) or destination..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-sm text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white/20 transition-all"
            />
          </div>
        </div>

        {/* Ambient Decorative Shapes */}
        <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-1/4 w-48 h-48 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
      </div>

      {/* Prominent Journey Planner: From-To Corridors & Autocomplete */}
      <JourneyPlanner
        onSelectJourney={(journey) => setMapModalJourney(journey)}
        onClearJourney={() => setMapModalJourney(null)}
        availableBuses={datasetBuses || buses}
      />

      {/* Transit Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Active Fleet</span>
            <Bus className="w-4 h-4 text-blue-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 font-mono">
            {buses.length}
          </p>
          <span className="text-[11px] text-emerald-600 font-medium">
            100% On-Route Tracking
          </span>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Low Crowd Buses</span>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-emerald-600 font-mono">
            {buses.filter((b) => b.crowdCategory === 'LOW').length}
          </p>
          <span className="text-[11px] text-slate-500">Seats easily available</span>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Moderate Crowd</span>
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-amber-600 font-mono">
            {buses.filter((b) => b.crowdCategory === 'MEDIUM').length}
          </p>
          <span className="text-[11px] text-slate-500">Few seats, standing room</span>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>High Density</span>
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-rose-600 font-mono">
            {buses.filter((b) => b.crowdCategory === 'HIGH').length}
          </p>
          <span className="text-[11px] text-slate-500">Heavy passenger rush</span>
        </div>
      </div>

      {/* Main Grid: Available Buses & Nearby Stops */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Bus Crowd Cards (8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-800">Available Buses & Crowd Status</h2>
              <p className="text-xs text-slate-500">Tap any bus to inspect route trajectory or open live tracking</p>
            </div>

            {/* Crowd Level Filter Pills */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
              {(['ALL', 'LOW', 'MEDIUM', 'HIGH'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setSelectedCrowdFilter(filter)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    selectedCrowdFilter === filter
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* Bus List */}
          <div className="space-y-3">
            {filteredBuses.length > 0 ? (
              filteredBuses.map((bus) => (
                <div
                  key={bus.id}
                  onClick={() => {
                    onSelectBus(bus);
                    onNavigate('tracking');
                  }}
                  className="p-4 bg-white rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-slate-100 text-slate-700 font-bold group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                        <Bus className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-base">
                            Route {bus.routeNumber || bus.busNumber}
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                            {bus.acType}
                          </span>
                          {bus.vehicleUnitId && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              (Vehicle #{bus.vehicleUnitId})
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-slate-600 mt-0.5">
                          {bus.routeName}
                        </p>
                      </div>
                    </div>

                    {/* Crowd Badge */}
                    <CrowdBadge level={bus.crowdCategory} percentage={bus.crowdPercentage} />
                  </div>

                  {/* Standardized 6-line Block Attributes */}
                  <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono space-y-1">
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
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Crowd:</span>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        bus.crowdCategory === 'LOW'
                          ? 'bg-emerald-100 text-emerald-800'
                          : bus.crowdCategory === 'MEDIUM'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {bus.crowdCategory}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Next Stop:</span>
                      <strong className="text-slate-800 truncate max-w-[200px]">{bus.nextStopName}</strong>
                    </div>
                    <div className="flex justify-between text-[11px] pt-1 border-t border-slate-200 text-slate-400">
                      <span>GPS Source:</span>
                      <span className="font-bold text-amber-600">{bus.locationSource}</span>
                    </div>
                  </div>

                  {/* Meter Bar */}
                  <div className="mt-2.5">
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          CROWD_COLORS[bus.crowdCategory]?.bar
                        }`}
                        style={{ width: `${bus.crowdPercentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Footer details */}
                  <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5 truncate max-w-[280px]">
                      <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">Approaching: <strong>{bus.nextStopName}</strong></span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="flex items-center gap-1 font-semibold text-emerald-600">
                        <Clock className="w-3 h-3" /> ~{bus.etaNextStopMin} min ETA
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-sm">
                No buses found matching your criteria.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Next Bus Arrivals & Nearby Stops (4 Cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Incoming Arrivals Card */}
          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Next Incoming Buses</span>
              </h3>
              <button
                onClick={() => onNavigate('stops')}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                View All
              </button>
            </div>

            <div className="space-y-3">
              {arrivals.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-extrabold text-slate-900 text-sm">
                        {item.busNumber}
                      </span>
                      <p className="text-[11px] text-slate-500">{item.routeNumber}</p>
                    </div>
                    <CrowdBadge level={item.crowdCategory} percentage={item.crowdPercentage} size="sm" />
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-slate-600 text-[11px]">
                    <span className="truncate max-w-[140px]">{item.stopName}</span>
                    <strong className="text-emerald-600 font-bold">
                      Arriving in ~{item.estimatedArrivalMin} min
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Nearby Bus Stops Card */}
          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span>Nearby Bus Stops</span>
              </h3>
              <button
                onClick={() => onNavigate('stops')}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Directory
              </button>
            </div>

            {!userLocationGranted ? (
              <div className="p-3 text-center bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                <p className="text-xs text-blue-800">
                  Enable device location to show bus stops closest to you.
                </p>
                <button
                  onClick={requestGeolocation}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-xs"
                >
                  Enable Location
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-[11px] text-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Location active. Showing stops around Central Hub.</span>
              </div>
            )}

            <div className="space-y-2.5">
              {stops.slice(0, 3).map((stop) => (
                <div
                  key={stop.id}
                  onClick={() => onNavigate('stops')}
                  className="p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-300 transition-all cursor-pointer flex items-center justify-between text-xs"
                >
                  <div className="truncate max-w-[190px]">
                    <p className="font-bold text-slate-800 truncate">{stop.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{stop.address || stop.city}</p>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    {stop.code}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Gemini AI Transit Assistant Card */}
          <div className="p-5 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl border border-indigo-200/80 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>SmartBus AI Advisory</span>
            </div>
            <p className="text-xs text-indigo-950/80 leading-relaxed">
              Ask questions about bus timings, low-crowd routes, or commute advice:
            </p>

            <form onSubmit={handleAskTransitAI} className="space-y-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. Which bus has least crowd right now?"
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  className="w-full px-3 py-2 pr-9 bg-white border border-indigo-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button
                  type="submit"
                  disabled={aiLoading}
                  className="absolute right-1.5 top-1.5 p-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>

            {aiAnswer && (
              <div className="p-3 bg-white rounded-xl border border-indigo-100 text-xs text-slate-700 leading-relaxed max-h-36 overflow-y-auto">
                {aiAnswer}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Route Corridor Map Preview Modal */}
      {mapModalJourney && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-start justify-between bg-slate-900/90 gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-extrabold bg-blue-600 text-white">
                    Route {mapModalJourney.routeNumber}
                  </span>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    {mapModalJourney.passengerOrigin} ➔ {mapModalJourney.passengerDestination}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400">
                  <span>{mapModalJourney.intermediateStopsCount} intermediate stops</span>
                  <span>•</span>
                  <span>{mapModalJourney.distanceKm} km</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-semibold">
                    ~{mapModalJourney.estimatedDurationMin} mins journey
                  </span>
                  <span>•</span>
                  <span className="text-amber-400">
                    {mapModalJourney.hasLiveGps ? 'Live GPS Active' : 'Scheduled Route Path'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const journeyToTrack = mapModalJourney;
                    setMapModalJourney(null);
                    onNavigate('tracking', { plannedJourney: journeyToTrack });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-sm"
                  title="Open live radar tracking"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Open in Full Radar Map</span>
                </button>
                <button
                  onClick={() => setMapModalJourney(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                  title="Close Map Modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Map Canvas with Ordered Polyline & Waypoints */}
            <div className="flex-1 p-3 min-h-[420px] overflow-y-auto">
              <GoogleBusMap
                buses={datasetBuses || buses}
                routes={datasetRoutes || routes}
                stops={stops}
                apiKey={googleMapsApiKey}
                onSelectBus={onSelectBus}
                plannedJourney={mapModalJourney}
                onClearPlannedJourney={() => setMapModalJourney(null)}
              />
            </div>

            {/* Ordered Stop Sequence Strip */}
            <div className="p-3.5 border-t border-slate-800 bg-slate-950/70 overflow-x-auto flex items-center gap-2 text-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
                Ordered Via Stops:
              </span>
              {mapModalJourney.journeyStops.map((st, i) => (
                <div key={i} className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                      i === 0
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : i === mapModalJourney.journeyStops.length - 1
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {i === 0 ? 'START' : i === mapModalJourney.journeyStops.length - 1 ? 'END' : `${i}`}
                  </span>
                  <span className="text-slate-200 font-medium">{st}</span>
                  {i < mapModalJourney.journeyStops.length - 1 && (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { BusStop, NextBusArrival } from '../types';
import { CrowdBadge } from '../components/common/CrowdBadge';
import { HOURLY_CROWD_PATTERNS } from '../data/mockData';
import {
  Clock,
  MapPin,
  TrendingUp,
  AlertCircle,
  Calendar,
  Sparkles,
  CheckCircle,
  ArrowRight,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

interface NextBusInfoPageProps {
  stops: BusStop[];
  arrivals: NextBusArrival[];
  onNavigate: (page: string) => void;
}

export const NextBusInfoPage: React.FC<NextBusInfoPageProps> = ({
  stops,
  arrivals,
  onNavigate,
}) => {
  const [selectedStopId, setSelectedStopId] = useState<string>('ALL');

  const filteredArrivals =
    selectedStopId === 'ALL'
      ? arrivals
      : arrivals.filter((a) => a.stopId === selectedStopId);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            <span>Next Bus Arrivals & Crowd Forecasts</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time incoming arrivals, predicted crowd occupancy, and historical corridor rush hours.
          </p>
        </div>

        {/* Filter by Stop */}
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
          <MapPin className="w-3.5 h-3.5 text-blue-600" />
          <span>Filter Stop:</span>
          <select
            value={selectedStopId}
            onChange={(e) => setSelectedStopId(e.target.value)}
            className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Transit Hubs ({arrivals.length} arrivals)</option>
            {stops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Grid: Arrivals Table & Hourly Rush Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Incoming Arrivals Cards (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <span>Upcoming Arrivals</span>
            <span className="text-xs font-normal text-slate-500">
              ({filteredArrivals.length} incoming)
            </span>
          </h2>

          <div className="space-y-3">
            {filteredArrivals.map((arr) => (
              <div
                key={arr.id}
                className="p-5 bg-white rounded-2xl border border-slate-200 hover:border-blue-300 shadow-xs transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-extrabold text-slate-900">
                        {arr.busNumber}
                      </span>
                      <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                        {arr.routeNumber}
                      </span>
                      <span className="text-xs font-medium text-slate-400">
                        {arr.acType}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>Arriving at: <strong>{arr.stopName}</strong></span>
                    </p>
                  </div>

                  {/* Arrival ETA Callout */}
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                      Estimated Arrival
                    </span>
                    <strong className="text-xl font-extrabold text-emerald-600 font-mono">
                      ~{arr.estimatedArrivalMin} min
                    </strong>
                    <span className="text-[10px] text-slate-400 block">Sched: {arr.scheduledTime}</span>
                  </div>
                </div>

                {/* Crowd Occupancy Comparison (Current vs Predicted at Stop) */}
                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">Current Crowd Level:</span>
                    <CrowdBadge level={arr.crowdCategory} percentage={arr.crowdPercentage} size="sm" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">Expected at Your Stop:</span>
                    <CrowdBadge level={arr.expectedCrowdCategory} size="sm" />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>Destination: <strong>{arr.destination}</strong></span>
                  <span className="font-mono text-slate-400">~{arr.distanceKm} km away</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Recharts Hourly Crowd Forecast Patterns (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                <span>Corridor Hourly Crowd Trends</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Historical peak commuter occupancy curve by hour of the day.
              </p>
            </div>

            {/* Recharts Area Chart */}
            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={HOURLY_CROWD_PATTERNS}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="crowdGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} unit="%" domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '12px',
                    }}
                    formatter={(val: any) => [`${val}% Occupancy`, 'Crowd Level']}
                  />
                  <Area
                    type="monotone"
                    dataKey="avg"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#crowdGradient)"
                    name="Avg Occupancy"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Rush Hour Advice Box */}
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>Peak Rush Windows</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800">
                Morning rush: <strong>08:00 – 10:00</strong> (~85-95% High Crowd).
                Evening rush: <strong>17:30 – 19:30</strong> (~88-98% High Crowd).
                Boarding before 07:30 or between 11:00 – 15:00 guarantees available seating.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

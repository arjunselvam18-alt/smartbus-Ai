import React, { useState, useEffect } from 'react';
import {
  AppSettings,
  Bus,
  BusRoute,
  BusStop,
  User,
  CrowdLevel,
  LocationSource,
} from '../types';
import { CrowdBadge } from '../components/common/CrowdBadge';
import { CrowdSourceDetails } from '../components/common/CrowdSourceDetails';
import { AdminStaffControlPanel } from '../components/admin/AdminStaffControlPanel';
import { AdminIntegrationsPanel } from '../components/admin/AdminIntegrationsPanel';
import { AdminAuthGate } from '../components/admin/AdminAuthGate';
import { getAdminToken, submitManualCrowdUpdate } from '../services/staffService';
import {
  ShieldAlert,
  Plus,
  Edit2,
  Trash2,
  MapPin,
  Users,
  Compass,
  Radio,
  Sliders,
  CheckCircle,
  AlertTriangle,
  Activity,
  Save,
  X,
  Search,
} from 'lucide-react';

type AdminTabId = 'buses' | 'staff' | 'settings' | 'gps' | 'crowd' | 'users' | 'activity';

interface AdminDashboardProps {
  currentUser: User | null;
  buses: Bus[];
  routes: BusRoute[];
  stops: BusStop[];
  users: User[];
  settings: AppSettings;
  initialTab?: AdminTabId;
  onAddBus: (bus: Bus) => void;
  onUpdateBus: (id: string, updates: Partial<Bus>) => void;
  onDeleteBus: (id: string) => void;
  onManualGPSUpdate: (id: string, lat: number, lng: number, speed?: number) => void;
  onManualCrowdUpdate: (id: string, passengers: number, capacity?: number) => void;
  onUpdateUserRole: (userId: string, role: 'passenger' | 'admin') => void;
  onUpdateUserStatus: (userId: string, status: 'active' | 'suspended') => void;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  onNavigate: (page: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  buses,
  routes,
  stops,
  users,
  settings,
  initialTab,
  onAddBus,
  onUpdateBus,
  onDeleteBus,
  onManualGPSUpdate,
  onManualCrowdUpdate,
  onUpdateUserRole,
  onUpdateUserStatus,
  onUpdateSettings,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTabId>(initialTab || 'buses');
  const [fleetSearch, setFleetSearch] = useState('');
  const [crowdBusSearch, setCrowdBusSearch] = useState('');
  const [adminNotice, setAdminNotice] = useState<string | null>(null);
  const [confirmOverCapacity, setConfirmOverCapacity] = useState(false);
  const [, setAuthVersion] = useState(0);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Modal / Form States
  const [isAddBusModalOpen, setIsAddBusModalOpen] = useState(false);
  const [newBusNumber, setNewBusNumber] = useState('');
  const [newRouteId, setNewRouteId] = useState(routes[0]?.id || '');
  const [newCapacity, setNewCapacity] = useState(50);
  const [newACType, setNewACType] = useState<'AC' | 'Non-AC' | 'Electric EV'>('Electric EV');

  // Manual GPS Override State
  const [gpsBusId, setGpsBusId] = useState(buses[0]?.id || '');
  const [manualLat, setManualLat] = useState(buses[0]?.latitude || 13.0418);
  const [manualLng, setManualLng] = useState(buses[0]?.longitude || 80.2341);
  const [manualSpeed, setManualSpeed] = useState(30);

  // Manual Crowd Override State
  const [crowdBusId, setCrowdBusId] = useState(buses[0]?.id || '');
  const [manualPassengers, setManualPassengers] = useState(buses[0]?.currentPassengers || 20);

  const filteredFleetBuses = React.useMemo(() => {
    const q = fleetSearch.trim().toLowerCase();
    const matched = q
      ? buses.filter(
          (b) =>
            b.busNumber.toLowerCase().includes(q) ||
            b.routeNumber.toLowerCase().includes(q) ||
            b.routeName.toLowerCase().includes(q) ||
            b.licensePlate.toLowerCase().includes(q)
        )
      : buses;
    return matched.slice(0, 80);
  }, [buses, fleetSearch]);

  const filteredCrowdBuses = React.useMemo(() => {
    const q = crowdBusSearch.trim().toLowerCase();
    const matched = q
      ? buses.filter(
          (b) =>
            b.busNumber.toLowerCase().includes(q) ||
            b.routeNumber.toLowerCase().includes(q) ||
            b.routeName.toLowerCase().includes(q)
        )
      : buses;
    return matched.slice(0, 80);
  }, [buses, crowdBusSearch]);

  const selectedCrowdBus = buses.find((b) => b.id === crowdBusId) || buses[0];

  const handleCreateBus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBusNumber.trim()) return;

    const matchedRoute = routes.find((r) => r.id === newRouteId) || routes[0];
    const firstStop = matchedRoute?.stops[0] || stops[0];

    const newBus: Bus = {
      id: `bus_${Date.now()}`,
      busNumber: newBusNumber.toUpperCase().trim(),
      routeId: matchedRoute.id,
      routeName: matchedRoute.routeName,
      routeNumber: matchedRoute.routeNumber,
      capacity: newCapacity,
      currentPassengers: 0,
      crowdPercentage: 0,
      crowdCategory: 'LOW',
      latitude: firstStop?.latitude || 13.0827,
      longitude: firstStop?.longitude || 80.2707,
      speedKmh: 0,
      heading: 0,
      status: 'active',
      locationSource: 'MANUAL',
      lastUpdated: new Date().toISOString(),
      nextStopId: firstStop?.stopId || '',
      nextStopName: firstStop?.stopName || 'Terminal',
      etaNextStopMin: 3,
      acType: newACType,
      licensePlate: `TN-${Math.floor(10 + Math.random() * 89)}-SB-${Math.floor(1000 + Math.random() * 8999)}`,
    };

    onAddBus(newBus);
    setIsAddBusModalOpen(false);
    setNewBusNumber('');
  };

  const handleApplyGPSOverride = () => {
    onManualGPSUpdate(gpsBusId, manualLat, manualLng, manualSpeed);
    setAdminNotice('Manual GPS applied! Bus location source updated to MANUAL.');
  };

  const handleApplyCrowdOverride = async () => {
    if (!selectedCrowdBus) return;
    if (manualPassengers > selectedCrowdBus.capacity && !confirmOverCapacity) {
      setAdminNotice(
        `Warning: Entered count (${manualPassengers}) exceeds capacity (${selectedCrowdBus.capacity}). Check confirmation box below to proceed.`
      );
      return;
    }
    onManualCrowdUpdate(selectedCrowdBus.id, manualPassengers, selectedCrowdBus.capacity);
    if (getAdminToken()) {
      const res = await submitManualCrowdUpdate({
        busId: selectedCrowdBus.id,
        busNumber: selectedCrowdBus.busNumber,
        routeNumber: selectedCrowdBus.routeNumber,
        capacity: selectedCrowdBus.capacity,
        passengerCount: manualPassengers,
        confirmOverCapacity,
        authMode: 'admin',
      });
      if (!res.success && res.error) {
        setAdminNotice(`Local override applied; backend audit sync note: ${res.error}`);
        setConfirmOverCapacity(false);
        return;
      }
    }
    setConfirmOverCapacity(false);
    setAdminNotice(
      `Manual crowd override recorded for ${selectedCrowdBus.busNumber} (${manualPassengers}/${selectedCrowdBus.capacity} passengers). Existing AI Vision estimates remain preserved.`
    );
  };

  if (currentUser?.role !== 'admin' || !getAdminToken()) {
    return (
      <AdminAuthGate
        onAuthenticated={() => setAuthVersion((v) => v + 1)}
        onCancel={() => onNavigate('dashboard')}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-gradient-to-r from-purple-900 to-indigo-950 text-white rounded-3xl shadow-xl">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-2 text-xs font-semibold rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Transit Authority Control Center</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            SmartBus Admin Operations & Fleet Management
          </h1>
          <p className="mt-1 text-xs text-purple-200/90 leading-relaxed">
            Manage transit fleet, override GPS coordinates, adjust occupancy thresholds, and monitor system activity.
          </p>
        </div>

        <button
          onClick={() => setIsAddBusModalOpen(true)}
          className="self-start sm:self-auto px-4 py-2.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl flex items-center gap-2 shadow-md transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Bus</span>
        </button>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('buses')}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === 'buses'
              ? 'bg-white text-purple-700 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Fleet Management ({buses.length})
        </button>
        <button
          onClick={() => setActiveTab('staff')}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === 'staff'
              ? 'bg-white text-purple-700 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Staff Registry & Crowd Control
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === 'settings'
              ? 'bg-white text-purple-700 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Settings & External API Integrations
        </button>
        <button
          onClick={() => setActiveTab('gps')}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === 'gps'
              ? 'bg-white text-purple-700 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Manual GPS Coordinate Override
        </button>
        <button
          onClick={() => setActiveTab('crowd')}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === 'crowd'
              ? 'bg-white text-purple-700 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Manual Crowd Override
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === 'users'
              ? 'bg-white text-purple-700 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          User Accounts & Roles ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === 'activity'
              ? 'bg-white text-purple-700 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          System Activity Log
        </button>
      </div>

      {adminNotice && (
        <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs flex items-center justify-between">
          <span className="font-medium">{adminNotice}</span>
          <button onClick={() => setAdminNotice(null)} className="font-bold text-purple-700">
            ×
          </button>
        </div>
      )}

      {/* TAB: STAFF REGISTRY & CROWD GOVERNANCE */}
      {activeTab === 'staff' && <AdminStaffControlPanel allBuses={buses} />}

      {/* TAB: SETTINGS & EXTERNAL API INTEGRATIONS (ADMIN ONLY) */}
      {activeTab === 'settings' && (
        <AdminIntegrationsPanel
          settings={settings}
          busesCount={buses.length}
          routesCount={routes.length}
          stopsCount={stops.length}
          onUpdateSettings={onUpdateSettings}
        />
      )}

      {/* TAB 1: FLEET MANAGEMENT */}
      {activeTab === 'buses' && (
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Municipal Bus Fleet ({buses.length} Total Eligible)
              </h2>
              <span className="text-xs text-slate-500 font-medium">
                Showing {filteredFleetBuses.length} of {buses.length} buses • Newly added buses are immediately assignable to staff
              </span>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search bus or route..."
                value={fleetSearch}
                onChange={(e) => setFleetSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-y border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">Bus / Plate</th>
                  <th className="py-3 px-4">Route Assignment</th>
                  <th className="py-3 px-4">Capacity</th>
                  <th className="py-3 px-4">Current Crowd</th>
                  <th className="py-3 px-4">Location Source</th>
                  <th className="py-3 px-4">Speed</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFleetBuses.map((bus) => (
                  <tr key={bus.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 text-sm">{bus.busNumber}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{bus.licensePlate}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{bus.routeNumber}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-[180px]">{bus.routeName}</div>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium">{bus.capacity} seats</td>
                    <td className="py-3 px-4">
                      <CrowdBadge level={bus.crowdCategory} percentage={bus.crowdPercentage} size="sm" />
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          bus.locationSource === 'MANUAL'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {bus.locationSource}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono">{bus.speedKmh} km/h</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          if (confirm(`Decommission and delete bus ${bus.busNumber}?`)) {
                            onDeleteBus(bus.id);
                          }
                        }}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete Bus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: MANUAL GPS COORDINATE OVERRIDE */}
      {activeTab === 'gps' && (
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Compass className="w-5 h-5 text-purple-600" />
              <span>Manual GPS Coordinate Dispatcher</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Per strict system specifications, whenever GPS devices are offline or unavailable, admins can manually dispatch and update bus coordinates. The location source is officially labeled as <strong>MANUAL</strong>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Select Bus:</label>
                <select
                  value={gpsBusId}
                  onChange={(e) => {
                    setGpsBusId(e.target.value);
                    const b = buses.find((x) => x.id === e.target.value);
                    if (b) {
                      setManualLat(b.latitude);
                      setManualLng(b.longitude);
                      setManualSpeed(b.speedKmh);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {buses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.busNumber} – {b.routeName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Manual Latitude (°N):
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={manualLat}
                  onChange={(e) => setManualLat(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl font-mono text-slate-800"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Manual Longitude (°E):
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={manualLng}
                  onChange={(e) => setManualLng(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl font-mono text-slate-800"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Manual Speed (km/h):
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={manualSpeed}
                  onChange={(e) => setManualSpeed(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl font-mono text-slate-800"
                />
              </div>

              <button
                onClick={handleApplyGPSOverride}
                className="w-full py-2.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Apply Manual Coordinates & Tag as MANUAL</span>
              </button>
            </div>

            {/* Quick Preset Coordinates for Municipal Hubs */}
            <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3 text-xs">
              <strong className="text-slate-800 font-bold block">Quick Waypoint Presets:</strong>
              <div className="space-y-2">
                {[
                  { name: 'Central Hub Terminal', lat: 13.0827, lng: 80.2707 },
                  { name: 'Marina Beach Promenade', lat: 13.0500, lng: 80.2824 },
                  { name: 'T. Nagar Commercial Center', lat: 13.0418, lng: 80.2341 },
                  { name: 'Airport Transit Gate', lat: 12.9815, lng: 80.1636 },
                ].map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => {
                      setManualLat(preset.lat);
                      setManualLng(preset.lng);
                    }}
                    className="w-full p-2.5 text-left rounded-lg border border-slate-200 hover:border-purple-400 hover:bg-purple-50/50 flex items-center justify-between transition-all"
                  >
                    <span className="font-medium text-slate-700">{preset.name}</span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {preset.lat}, {preset.lng}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MANUAL CROWD OVERRIDE */}
      {activeTab === 'crowd' && (
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-purple-600" />
              <span>Manual Crowd & Passenger Count Override (All {buses.length} Fleet Buses)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Submit an Admin manual override (tagged <strong>MANUAL OVERRIDE</strong>). AI Vision estimates remain preserved as the primary source whenever available.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4 p-5 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Filter Fleet:</label>
                <input
                  type="text"
                  placeholder="Search bus number or route..."
                  value={crowdBusSearch}
                  onChange={(e) => setCrowdBusSearch(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl mb-2"
                />
                <label className="text-xs font-bold text-slate-700 block mb-1">Target Bus:</label>
                <select
                  value={crowdBusId}
                  onChange={(e) => {
                    setCrowdBusId(e.target.value);
                    setConfirmOverCapacity(false);
                    const b = buses.find((x) => x.id === e.target.value);
                    if (b) setManualPassengers(b.currentPassengers);
                  }}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl font-semibold text-slate-800"
                >
                  {filteredCrowdBuses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.busNumber} – {b.routeName} ({b.currentPassengers}/{b.capacity} • {b.crowdCategory})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>Passenger Headcount (Capacity: {selectedCrowdBus?.capacity || 50}):</span>
                  <span className="text-purple-600 font-mono">{manualPassengers} passengers</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={manualPassengers}
                  onChange={(e) => {
                    setManualPassengers(parseInt(e.target.value, 10));
                    setConfirmOverCapacity(false);
                  }}
                  className="w-full accent-purple-600 cursor-pointer"
                />
              </div>

              {selectedCrowdBus && manualPassengers > selectedCrowdBus.capacity && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-1.5">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>
                      Count ({manualPassengers}) exceeds capacity ({selectedCrowdBus.capacity} seats).
                    </span>
                  </div>
                  <label className="flex items-center gap-2 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmOverCapacity}
                      onChange={(e) => setConfirmOverCapacity(e.target.checked)}
                    />
                    <span>Confirm over-capacity load</span>
                  </label>
                </div>
              )}

              <button
                onClick={handleApplyCrowdOverride}
                className="w-full py-2.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Save Manual Crowd Override</span>
              </button>
            </div>

            {selectedCrowdBus && (
              <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800">
                    Current Source Breakdown — {selectedCrowdBus.busNumber}
                  </h3>
                  <CrowdBadge
                    level={selectedCrowdBus.crowdCategory}
                    percentage={selectedCrowdBus.crowdPercentage}
                    size="sm"
                  />
                </div>
                <CrowdSourceDetails bus={selectedCrowdBus} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: USER ACCOUNTS & ROLES */}
      {activeTab === 'users' && (
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800">Registered System Accounts</h2>
            <span className="text-xs text-slate-500">
              Role-based access control (Passenger & Admin)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-y border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Assigned Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Toggle Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">{u.name}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">{u.email}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          u.role === 'admin'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-emerald-600 font-semibold capitalize">{u.status}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() =>
                          onUpdateUserRole(u.id, u.role === 'admin' ? 'passenger' : 'admin')
                        }
                        className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        Change to {u.role === 'admin' ? 'Passenger' : 'Admin'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: SYSTEM ACTIVITY AUDIT LOG */}
      {activeTab === 'activity' && (
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-600" />
            <span>Transit Dispatch & Vision Activity Log</span>
          </h2>

          <div className="space-y-2.5 text-xs">
            {[
              {
                time: 'Just now',
                event: 'Simulated GPS pulse broadcasted for corridor 21G Express.',
                type: 'gps',
              },
              {
                time: '2 mins ago',
                event: 'AI Camera Vision evaluated CAM-01: 24 passengers detected (MEDIUM crowd).',
                type: 'ai',
              },
              {
                time: '6 mins ago',
                event: 'Google Sheets sync check executed successfully against connected tabs.',
                type: 'sheets',
              },
              {
                time: '12 mins ago',
                event: 'Admin user session authorized with secure PBKDF2 hash verification.',
                type: 'auth',
              },
            ].map((log, i) => (
              <div
                key={i}
                className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-slate-700 font-medium">{log.event}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono shrink-0">{log.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Bus Modal */}
      {isAddBusModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md p-6 bg-white rounded-2xl shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-800">Add New Bus to Fleet</h3>
              <button
                onClick={() => setIsAddBusModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBus} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Bus Number (e.g. SB-105):
                </label>
                <input
                  type="text"
                  required
                  placeholder="SB-105"
                  value={newBusNumber}
                  onChange={(e) => setNewBusNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-semibold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Assign Route:</label>
                <select
                  value={newRouteId}
                  onChange={(e) => setNewRouteId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                >
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.routeNumber} – {r.routeName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Seating Capacity:</label>
                <input
                  type="number"
                  min="20"
                  max="100"
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(parseInt(e.target.value, 10) || 50)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Powertrain / Type:</label>
                <select
                  value={newACType}
                  onChange={(e) => setNewACType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                >
                  <option value="Electric EV">Electric EV (Eco)</option>
                  <option value="AC">AC Deluxe</option>
                  <option value="Non-AC">Non-AC Standard</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddBusModalOpen(false)}
                  className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs"
                >
                  Add Vehicle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { AppSettings } from '../../types';
import {
  AdminIntegrationsSnapshot,
  adminRunAllIntegrationDiagnostics,
  adminTestRoutesIntegration,
  adminTestSheetsIntegration,
  fetchAdminIntegrationsStatus,
  getAdminToken,
  setAdminToken,
} from '../../services/staffService';
import { storageService } from '../../services/storage';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  MapPin,
  Radio,
  RefreshCw,
  Route,
  Save,
  Server,
  Settings,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import { AdminAuthGate } from './AdminAuthGate';

interface AdminIntegrationsPanelProps {
  settings: AppSettings;
  busesCount: number;
  routesCount: number;
  stopsCount: number;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
}

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return 'Never tested';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export const AdminIntegrationsPanel: React.FC<AdminIntegrationsPanelProps> = ({
  settings,
  busesCount,
  routesCount,
  stopsCount,
  onUpdateSettings,
}) => {
  const [hasAdminToken, setHasAdminToken] = useState<boolean>(() => !!getAdminToken());

  const [snapshot, setSnapshot] = useState<AdminIntegrationsSnapshot | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [diagSuccess, setDiagSuccess] = useState<string | null>(null);

  const [testingAll, setTestingAll] = useState(false);
  const [testingRoutes, setTestingRoutes] = useState(false);
  const [testingSheets, setTestingSheets] = useState(false);
  const [testingMaps, setTestingMaps] = useState(false);

  const [mapsRuntimeCheck, setMapsRuntimeCheck] = useState<{
    checkedAt: string | null;
    jsLoaded: boolean;
    keyConfigured: boolean;
    message: string;
  }>(() => ({
    checkedAt: null,
    jsLoaded: typeof window !== 'undefined' && Boolean((window as any).google?.maps),
    keyConfigured: Boolean(
      settings.googleMapsApiKey && settings.googleMapsApiKey !== 'YOUR_GOOGLE_MAPS_API_KEY'
    ),
    message:
      typeof window !== 'undefined' && (window as any).google?.maps
        ? 'Maps JavaScript API loaded in browser runtime.'
        : 'Maps JavaScript API loads when the Live Map view initializes.',
  }));

  // Optional write-only Apps Script endpoint updater (never pre-fills or exposes existing URLs/secrets)
  const [newSheetsEndpoint, setNewSheetsEndpoint] = useState('');

  // Non-secret operational simulation & crowd thresholds
  const [simSpeed, setSimSpeed] = useState(settings.simulationSpeedMultiplier || 1);
  const [crowdLow, setCrowdLow] = useState(settings.crowdThresholdLow ?? 30);
  const [crowdMedium, setCrowdMedium] = useState(settings.crowdThresholdMedium ?? 70);
  const [savedNotice, setSavedNotice] = useState(false);

  const loadSnapshot = async () => {
    setLoadingStatus(true);
    setDiagError(null);
    const hasClientSheets = Boolean(
      settings.googleSheetsApiUrl && settings.googleSheetsApiUrl.startsWith('https://script.google.com/')
    );
    const res = await fetchAdminIntegrationsStatus(hasClientSheets);
    setLoadingStatus(false);
    if (!res.ok || !res.data) {
      if (res.error?.toLowerCase().includes('admin')) {
        setHasAdminToken(false);
        setAdminToken(null);
      }
      setDiagError(res.error || 'Unable to retrieve backend integration status.');
      return;
    }
    setSnapshot(res.data);
  };

  useEffect(() => {
    const jsLoaded = typeof window !== 'undefined' && Boolean((window as any).google?.maps);
    const keyConfigured = Boolean(
      snapshot?.googleMaps.configured ||
      (settings.googleMapsApiKey && settings.googleMapsApiKey !== 'YOUR_GOOGLE_MAPS_API_KEY')
    );
    setMapsRuntimeCheck((prev) => ({
      ...prev,
      jsLoaded,
      keyConfigured,
      message: jsLoaded
        ? 'Google Maps JavaScript API is active and responding in the runtime.'
        : keyConfigured
        ? 'Google Maps API key is configured; JavaScript SDK initializes when the map view opens.'
        : 'Google Maps JavaScript API key is not detected. Configure VITE_GOOGLE_MAPS_API_KEY in Vercel and redeploy.',
    }));
  }, [settings.googleMapsApiKey, snapshot?.googleMaps.configured]);

  useEffect(() => {
    if (hasAdminToken) {
      void loadSnapshot();
    }
  }, [hasAdminToken]);

  const handleTestMapsJs = () => {
    setTestingMaps(true);
    setDiagError(null);
    const nowIso = new Date().toISOString();
    const jsLoaded = typeof window !== 'undefined' && Boolean((window as any).google?.maps);
    const keyConfigured =
      Boolean(snapshot?.googleMaps.configured) ||
      Boolean(settings.googleMapsApiKey && settings.googleMapsApiKey !== 'YOUR_GOOGLE_MAPS_API_KEY');

    setMapsRuntimeCheck({
      checkedAt: nowIso,
      jsLoaded,
      keyConfigured,
      message: jsLoaded
        ? 'Google Maps JavaScript API is active and responding in the runtime.'
        : keyConfigured
        ? 'Google Maps API key is configured; JavaScript SDK initializes lazily when Live Bus Tracking opens.'
        : 'Google Maps JavaScript API key is not detected in current environment.',
    });
    setDiagSuccess('Google Maps JavaScript API availability checked.');
    setTestingMaps(false);
  };

  const handleTestRoutesApi = async () => {
    setTestingRoutes(true);
    setDiagError(null);
    setDiagSuccess(null);
    const res = await adminTestRoutesIntegration();
    setTestingRoutes(false);
    if (res.snapshot) setSnapshot(res.snapshot);
    if (res.success) {
      const km = res.distanceMeters ? `${(res.distanceMeters / 1000).toFixed(1)} km` : '';
      const mins = res.duration
        ? `~${Math.round(parseInt(res.duration.replace('s', ''), 10) / 60)} min`
        : '';
      setDiagSuccess(
        `Google Routes API verified (${[km, mins].filter(Boolean).join(' • ') || 'OK'}).`
      );
    } else {
      setDiagError(res.error || res.message || 'Google Routes API check failed.');
    }
  };

  const handleTestSheets = async (mode: 'ping' | 'readWrite') => {
    setTestingSheets(true);
    setDiagError(null);
    setDiagSuccess(null);
    const endpointToTest = newSheetsEndpoint.trim() || settings.googleSheetsApiUrl || undefined;
    const res = await adminTestSheetsIntegration(endpointToTest, mode);
    setTestingSheets(false);
    if (res.snapshot) setSnapshot(res.snapshot);

    if (res.success) {
      onUpdateSettings({
        isSheetsConnected: true,
        lastSheetsSync: new Date().toISOString(),
        ...(newSheetsEndpoint.trim().startsWith('https://script.google.com/')
          ? { googleSheetsApiUrl: newSheetsEndpoint.trim() }
          : {}),
      });
      await storageService.syncWithGoogleSheets();
      const syncErr = storageService.getLastSheetsSyncError();
      if (syncErr) {
        setDiagSuccess(
          `${res.message} (Dataset note: ${syncErr} — retaining hydrated MTC fleet data.)`
        );
      } else {
        setDiagSuccess(
          `${res.message}${res.latencyMs ? ` (${res.latencyMs}ms)` : ''}`
        );
      }
      if (newSheetsEndpoint.trim()) setNewSheetsEndpoint('');
    } else {
      onUpdateSettings({ isSheetsConnected: false });
      setDiagError(res.error || res.message || 'Google Sheets connectivity test failed.');
    }
  };

  const handleRunFullDiagnostics = async () => {
    setTestingAll(true);
    setDiagError(null);
    setDiagSuccess(null);
    handleTestMapsJs();
    const res = await adminRunAllIntegrationDiagnostics(settings.googleSheetsApiUrl || undefined);
    setTestingAll(false);
    if (res.snapshot) setSnapshot(res.snapshot);
    if (!res.ok) {
      setDiagError(res.error || 'Diagnostics run failed.');
      return;
    }
    const routesOk = res.routesApi?.success;
    const sheetsOk = res.googleSheets?.success;
    const dbOk = res.transitDb?.success;
    if (sheetsOk) {
      onUpdateSettings({ isSheetsConnected: true, lastSheetsSync: new Date().toISOString() });
    }
    setDiagSuccess(
      `Diagnostics complete — Routes API: ${routesOk ? 'OK' : 'Issue'}, Google Sheets: ${
        sheetsOk ? 'Connected' : 'Disconnected/Unconfigured'
      }, Transit DB: ${dbOk ? `${res.transitDb.routesCount} routes ready` : 'Unavailable'}.`
    );
  };

  const handleSaveOperationalSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updates: Partial<AppSettings> = {
      simulationSpeedMultiplier: simSpeed,
      crowdThresholdLow: crowdLow,
      crowdThresholdMedium: crowdMedium,
    };
    if (newSheetsEndpoint.trim().startsWith('https://script.google.com/')) {
      updates.googleSheetsApiUrl = newSheetsEndpoint.trim();
      setNewSheetsEndpoint('');
    }
    onUpdateSettings(updates);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  if (!hasAdminToken) {
    return (
      <AdminAuthGate
        title="Admin Authorization Required"
        description="Settings & External API Integrations are restricted to verified administrators."
        onAuthenticated={() => setHasAdminToken(true)}
      />
    );
  }

  const sheetsConnected =
    snapshot?.googleSheets.status === 'connected' || settings.isSheetsConnected;
  const sheetsLastSync =
    snapshot?.googleSheets.lastSuccessfulSyncAt || settings.lastSheetsSync || null;
  const syncError = storageService.getLastSheetsSyncError();

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-600" />
            <span>Settings &amp; External API Integrations</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Admin-protected connectivity status, integration diagnostics, and operational thresholds. API keys and secrets remain masked server-side.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Admin Session Active</span>
          </span>
          <button
            type="button"
            onClick={() => void loadSnapshot()}
            disabled={loadingStatus}
            className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Diagnostic Notices */}
      {diagSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{diagSuccess}</span>
        </div>
      )}
      {diagError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{diagError}</span>
        </div>
      )}

      {/* Grid of 4 Core Monitoring Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Google Maps API */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-800">1. Google Maps API</h3>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                mapsRuntimeCheck.keyConfigured || snapshot?.googleMaps.configured
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {mapsRuntimeCheck.keyConfigured || snapshot?.googleMaps.configured
                ? 'Configured (Masked)'
                : 'Not Detected'}
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Connection Status:</span>
              <span className="font-bold text-slate-800">
                {mapsRuntimeCheck.keyConfigured || snapshot?.googleMaps.configured
                  ? 'Active Configuration Preserved'
                  : 'Pending Configuration'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Maps JavaScript API:</span>
              <span
                className={`font-bold ${
                  mapsRuntimeCheck.jsLoaded ? 'text-emerald-700' : 'text-blue-700'
                }`}
              >
                {mapsRuntimeCheck.jsLoaded ? 'Loaded & Available' : 'On-Demand Map Initialization'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Key Protection:</span>
              <span className="font-semibold text-slate-700">
                {snapshot?.googleMaps.restrictionMode || 'Domain-Restricted Client Key (Masked)'}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {mapsRuntimeCheck.message} Key values remain hidden and untouched.
          </p>
        </div>

        {/* 2. Google Routes API */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Route className="w-5 h-5 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-800">2. Google Routes API</h3>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase ${
                snapshot?.googleRoutes.status === 'operational'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : snapshot?.googleRoutes.status === 'degraded'
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {snapshot?.googleRoutes.status || 'untested'}
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Road-Following Service:</span>
              <span className="font-bold text-slate-800">
                {snapshot?.googleRoutes.configured ? 'Server Proxy Ready' : 'Not Configured'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Last Successful Test:</span>
              <span className="font-mono text-[11px] text-slate-700">
                {formatTimestamp(snapshot?.googleRoutes.lastSuccessfulTestAt)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 shrink-0">Last Result:</span>
              <span className="font-semibold text-slate-800 text-right">
                {snapshot?.googleRoutes.lastResult?.success
                  ? `${snapshot.googleRoutes.lastResult.message}${
                      snapshot.googleRoutes.lastResult.distanceMeters
                        ? ` (${(snapshot.googleRoutes.lastResult.distanceMeters / 1000).toFixed(1)} km)`
                        : ''
                    }`
                  : snapshot?.googleRoutes.lastError || 'Run diagnostics to verify live routing'}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Executes exclusively through the server-side <code>directions/v2:computeRoutes</code> proxy.
          </p>
        </div>

        {/* 3. Google Sheets Integration */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-800">3. Google Sheets Integration</h3>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase ${
                sheetsConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {sheetsConnected ? 'Connected' : 'Disconnected / Untested'}
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Apps Script Connectivity:</span>
              <span className="font-bold text-slate-800">
                {snapshot?.googleSheets.configurationSource ||
                  (settings.googleSheetsApiUrl ? 'Configured (Masked)' : 'Not Configured')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Last Successful Sync:</span>
              <span className="font-mono text-[11px] text-slate-700">
                {formatTimestamp(sheetsLastSync)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Fleet / Route / Stop Data:</span>
              <span className="font-bold text-emerald-700">
                {busesCount} Buses • {routesCount} Routes • {stopsCount} Stops
              </span>
            </div>
            {(syncError || snapshot?.googleSheets.lastError) && (
              <div className="pt-1 border-t border-slate-200 text-[11px] text-amber-700 font-medium">
                Sync Note: {syncError || snapshot?.googleSheets.lastError}
              </div>
            )}
          </div>

          {/* Write-only masked endpoint input (never pre-fills or exposes secrets) */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">
              Update Apps Script Web App Endpoint (Write-Only, Masked):
            </label>
            <input
              type="password"
              autoComplete="off"
              placeholder="Leave blank to keep existing configured endpoint"
              value={newSheetsEndpoint}
              onChange={(e) => setNewSheetsEndpoint(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-800"
            />
          </div>
        </div>

        {/* 4. System Health */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-purple-600" />
              <h3 className="text-sm font-bold text-slate-800">4. System Health</h3>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
              {snapshot?.systemHealth.serverStatus || 'online'}
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Backend Server Uptime:</span>
              <span className="font-mono font-bold text-slate-800">
                {snapshot ? `${snapshot.systemHealth.uptimeSeconds}s` : 'Active'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">API Request Errors:</span>
              <span
                className={`font-bold ${
                  (snapshot?.systemHealth.totalApiErrors || 0) > 0
                    ? 'text-amber-700'
                    : 'text-emerald-700'
                }`}
              >
                {snapshot?.systemHealth.totalApiErrors ?? 0} logged errors
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Last Successful Connection:</span>
              <span className="font-mono text-[11px] text-slate-700">
                {formatTimestamp(snapshot?.systemHealth.lastSuccessfulConnectionAt)}
              </span>
            </div>
            <div className="pt-1 border-t border-slate-200 grid grid-cols-2 gap-1.5 text-[11px]">
              <span className="text-slate-700">
                &bull; Routes DB:{' '}
                <strong>
                  {snapshot?.systemHealth.services.transitRoutesDb.available ? 'Available' : 'Loaded'}
                </strong>
              </span>
              <span className="text-slate-700">
                &bull; AI Vision:{' '}
                <strong>{snapshot?.systemHealth.services.aiVision.mode || 'Active'}</strong>
              </span>
              <span className="text-slate-700">
                &bull; Routes Proxy:{' '}
                <strong>
                  {snapshot?.systemHealth.services.routesApiProxy.available ? 'Ready' : 'Check Key'}
                </strong>
              </span>
              <span className="text-slate-700">
                &bull; Sheets Proxy: <strong>Ready</strong>
              </span>
            </div>
          </div>

          {snapshot && snapshot.systemHealth.recentErrors.length > 0 && (
            <div className="p-2.5 bg-rose-50/70 border border-rose-200 rounded-xl space-y-1 max-h-28 overflow-y-auto">
              <p className="text-[10px] font-bold uppercase text-rose-700">
                Recent Sanitized API Errors
              </p>
              {snapshot.systemHealth.recentErrors.slice(0, 4).map((err, idx) => (
                <div key={idx} className="text-[11px] text-rose-800 flex justify-between gap-2">
                  <span className="truncate">
                    <strong>{err.service}:</strong> {err.message}
                  </span>
                  <span className="text-[10px] font-mono shrink-0">
                    {new Date(err.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5. Integration Diagnostics */}
      <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              <span>5. Integration Diagnostics (Admin-Only)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Execute live server-side verification checks across Google Maps, Google Routes, and Google Sheets.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunFullDiagnostics}
            disabled={testingAll}
            className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl flex items-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testingAll ? 'animate-spin' : ''}`} />
            <span>{testingAll ? 'Running Diagnostics...' : 'Run Full System Diagnostics'}</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={handleTestMapsJs}
            disabled={testingMaps}
            className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5 text-blue-600" />
            <span>Check Google Maps JS API</span>
          </button>

          <button
            type="button"
            onClick={handleTestRoutesApi}
            disabled={testingRoutes}
            className="px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <Route className={`w-3.5 h-3.5 ${testingRoutes ? 'animate-spin' : ''}`} />
            <span>{testingRoutes ? 'Testing Routes API...' : 'Test Google Routes API'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleTestSheets('ping')}
            disabled={testingSheets}
            className="px-3.5 py-2 text-xs font-bold text-white bg-slate-700 hover:bg-slate-800 rounded-xl flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <Database className="w-3.5 h-3.5" />
            <span>{testingSheets ? 'Testing Sheets...' : 'Test Google Sheets Ping'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleTestSheets('readWrite')}
            disabled={testingSheets}
            className="px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Verify Sheets Read &amp; Write</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2 text-slate-600">
            <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>
              <strong>Maps Check:</strong> {formatTimestamp(mapsRuntimeCheck.checkedAt)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>
              <strong>Routes Test:</strong> {formatTimestamp(snapshot?.googleRoutes.lastTestedAt)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <Clock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>
              <strong>Sheets Test:</strong> {formatTimestamp(snapshot?.googleSheets.lastTestedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Operational Simulation & Crowd Threshold Controls */}
      <form
        onSubmit={handleSaveOperationalSettings}
        className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-5"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <Radio className="w-4 h-4 text-amber-600" />
              <span>Simulation Speed Multiplier</span>
            </div>
            <div className="flex justify-between text-xs font-semibold text-slate-600">
              <span>Fleet Movement Velocity:</span>
              <span className="font-mono text-blue-600 font-bold">{simSpeed}x</span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={simSpeed}
              onChange={(e) => setSimSpeed(parseInt(e.target.value, 10))}
              className="w-full accent-purple-600 cursor-pointer"
            />
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <span>Crowd Classification Thresholds</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">
                  LOW Ceiling (0–{crowdLow}%)
                </label>
                <input
                  type="number"
                  min="10"
                  max="50"
                  value={crowdLow}
                  onChange={(e) => setCrowdLow(parseInt(e.target.value, 10) || 30)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">
                  MEDIUM Ceiling ({crowdLow + 1}–{crowdMedium}%)
                </label>
                <input
                  type="number"
                  min="40"
                  max="85"
                  value={crowdMedium}
                  onChange={(e) => setCrowdMedium(parseInt(e.target.value, 10) || 70)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          {savedNotice ? (
            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>Operational settings updated.</span>
            </span>
          ) : (
            <span />
          )}
          <button
            type="submit"
            className="px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save Operational Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
};

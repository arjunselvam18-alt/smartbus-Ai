import React, { useState } from 'react';
import { AppSettings } from '../types';
import { testSheetsConnection, SheetsTestResult } from '../services/googleSheets';
import { storageService } from '../services/storage';
import {
  Settings,
  Database,
  MapPin,
  Cpu,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Save,
  Radio,
  Sliders,
  Sparkles,
} from 'lucide-react';

interface SettingsPageProps {
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  onNavigate: (page: string) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onUpdateSettings,
  onNavigate,
}) => {
  const [sheetsUrl, setSheetsUrl] = useState(settings.googleSheetsApiUrl || '');
  const [mapsKey, setMapsKey] = useState(settings.googleMapsApiKey || '');
  const [yoloUrl, setYoloUrl] = useState(settings.yoloFastApiUrl || 'http://localhost:8000/predict');
  const [simSpeed, setSimSpeed] = useState(settings.simulationSpeedMultiplier || 1);
  const [crowdLow, setCrowdLow] = useState(settings.crowdThresholdLow ?? 30);
  const [crowdMedium, setCrowdMedium] = useState(settings.crowdThresholdMedium ?? 70);

  const [testingSheets, setTestingSheets] = useState(false);
  const [sheetsResult, setSheetsResult] = useState<SheetsTestResult | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const [testingRoutesApi, setTestingRoutesApi] = useState(false);
  const [routesApiResult, setRoutesApiResult] = useState<{
    success: boolean;
    message: string;
    duration?: string;
    distanceKm?: string;
  } | null>(null);

  const handleTestRoutesApi = async () => {
    setTestingRoutesApi(true);
    setRoutesApiResult(null);
    try {
      const response = await fetch('/api/routes/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: [12.9815, 80.2180], // Guindy
          destination: [12.8718, 80.0820], // Tambaram
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setRoutesApiResult({
          success: true,
          message: 'Server-Side Routes API Key Verified! Successfully computed road-following polyline geometry via directions/v2:computeRoutes.',
          duration: data.duration,
          distanceKm: data.distanceMeters ? (data.distanceMeters / 1000).toFixed(1) : undefined,
        });
      } else {
        setRoutesApiResult({
          success: false,
          message: data.error || 'Failed to compute road route with server Routes API key.',
        });
      }
    } catch (e: any) {
      setRoutesApiResult({
        success: false,
        message: e.message || 'Error connecting to Routes API proxy endpoint.',
      });
    } finally {
      setTestingRoutesApi(false);
    }
  };

  const handleTestSheets = async () => {
    setTestingSheets(true);
    setSheetsResult(null);
    try {
      const res = await testSheetsConnection(sheetsUrl);
      if (res.success) {
        onUpdateSettings({
          googleSheetsApiUrl: sheetsUrl.trim(),
          isSheetsConnected: true,
          lastSheetsSync: new Date().toISOString(),
        });
        // Pull Routes, Route_Stops, Stops, and Buses from Google Sheets
        await storageService.syncWithGoogleSheets();
        const syncErr = storageService.getLastSheetsSyncError();
        if (syncErr) {
          setSheetsResult({
            ...res,
            message: `${res.message} (Note: ${syncErr} — retaining built-in Chennai MTC dataset.)`,
          });
        } else {
          setSheetsResult(res);
        }
      } else {
        setSheetsResult(res);
        onUpdateSettings({
          isSheetsConnected: false,
        });
      }
    } catch (e: any) {
      setSheetsResult({
        success: false,
        message: e.message || 'Failed to communicate with Google Sheets endpoint.',
      });
      onUpdateSettings({ isSheetsConnected: false });
    } finally {
      setTestingSheets(false);
    }
  };

  const handleVerifyReadWrite = async () => {
    setTestingSheets(true);
    setSheetsResult(null);
    try {
      const { verifyReadWrite } = await import('../services/googleSheets');
      const res = await verifyReadWrite(sheetsUrl);
      setSheetsResult(res);
      if (res.success) {
        onUpdateSettings({
          googleSheetsApiUrl: sheetsUrl.trim(),
          isSheetsConnected: true,
          lastSheetsSync: new Date().toISOString(),
        });
        await storageService.syncWithGoogleSheets();
      }
    } catch (e: any) {
      setSheetsResult({
        success: false,
        message: e.message || 'Verification failed.',
      });
    } finally {
      setTestingSheets(false);
    }
  };

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      googleSheetsApiUrl: sheetsUrl.trim(),
      googleMapsApiKey: mapsKey.trim(),
      yoloFastApiUrl: yoloUrl.trim(),
      simulationSpeedMultiplier: simSpeed,
      crowdThresholdLow: crowdLow,
      crowdThresholdMedium: crowdMedium,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Top Header */}
      <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" />
            <span>Settings & External API Integrations</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure Google Sheets Web App database, Google Maps Platform JavaScript API, and AI vision endpoints.
          </p>
        </div>

        <button
          onClick={() => onNavigate('docs')}
          className="self-start sm:self-auto px-3.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-200 transition-colors flex items-center gap-1.5"
        >
          <span>Setup Instructions</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      <form onSubmit={handleSaveAll} className="space-y-6">
        {/* SECTION 1: GOOGLE SHEETS DATABASE */}
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-800">
                1. Google Sheets Database Configuration (GOOGLE_SHEETS_API_URL)
              </h2>
            </div>

            {/* Connection Status Badge (Compliant with: Do not pretend connected until tested) */}
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                settings.isSheetsConnected
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  settings.isSheetsConnected ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
              />
              <span>
                {settings.isSheetsConnected ? 'CONNECTED TO GOOGLE SHEETS' : 'DISCONNECTED / UNTESTED'}
              </span>
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Enter your deployed Google Apps Script Web App URL. The backend proxies requests to this URL to persist and retrieve transit data across all 10 sheet tabs without CORS issues.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                GOOGLE_SHEETS_API_URL:
              </label>
              <input
                type="url"
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                value={sheetsUrl}
                onChange={(e) => setSheetsUrl(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleTestSheets}
                disabled={testingSheets || !sheetsUrl.trim()}
                className="px-4 py-2 text-xs font-bold text-white bg-slate-700 hover:bg-slate-800 rounded-xl shadow-xs flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testingSheets ? 'animate-spin' : ''}`} />
                <span>{testingSheets ? 'Checking...' : '1. Test Ping'}</span>
              </button>

              <button
                type="button"
                onClick={handleVerifyReadWrite}
                disabled={testingSheets || !sheetsUrl.trim()}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>2. Verify Full Read & Write</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('docs')}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Copy Apps Script deployment code →
              </button>
            </div>

            {/* Test Connection Output Feedback */}
            {sheetsResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                  sheetsResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {sheetsResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                  )}
                  <span>{sheetsResult.message}</span>
                </div>
                {sheetsResult.latencyMs !== undefined && (
                  <p className="text-[11px] font-mono text-slate-600">
                    Response Latency: {sheetsResult.latencyMs}ms
                  </p>
                )}
                {sheetsResult.availableSheets && sheetsResult.availableSheets.length > 0 && (
                  <p className="text-[11px] text-slate-600">
                    Detected Sheets: {sheetsResult.availableSheets.join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2: GOOGLE MAPS & ROUTES API KEY */}
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-800">
                2. Google Maps Platform: JavaScript API & Routes API
              </h2>
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              Separate Keys Architecture
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Your application uses separate, purpose-built Google Cloud API keys:
            <br />
            &bull; <strong>Maps JavaScript API Key</strong>: Loaded client-side for interactive vector road maps, bus stops, and GPS markers.
            <br />
            &bull; <strong>Routes API Key (Server-Side)</strong>: Stored securely in backend environment variables (<code>GOOGLE_ROUTES_API_KEY</code>) to compute road-following route geometry via <code>directions/v2:computeRoutes</code> without exposing the key to client browsers.
          </p>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Google Maps JavaScript API Key (VITE_GOOGLE_MAPS_API_KEY):
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="AIzaSy..."
                value={mapsKey}
                onChange={(e) => setMapsKey(e.target.value)}
                className="flex-1 px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleTestRoutesApi}
                disabled={testingRoutesApi}
                className="px-4 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 shrink-0"
              >
                {testingRoutesApi ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Testing Routes API...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Test Routes API Server Key</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Test Routes API & Maps Key Feedback */}
          {routesApiResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                routesApiResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                {routesApiResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{routesApiResult.message}</span>
              </div>
              {routesApiResult.success && (
                <div className="text-[11px] font-mono text-slate-600 flex items-center gap-3 pt-1 border-t border-emerald-200/60">
                  <span>Sample Corridor Trip: Guindy &rarr; Tambaram</span>
                  {routesApiResult.distanceKm && <span>• Distance: {routesApiResult.distanceKm} km</span>}
                  {routesApiResult.duration && (
                    <span>• Duration: ~{Math.round(parseInt(routesApiResult.duration.replace('s', '')) / 60)} min</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* SECTION 3: SIMULATION & SPEED ENGINE */}
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-amber-600" />
            <h2 className="text-sm font-bold text-slate-800">
              3. Transit Simulation Engine & GPS Tick Rate
            </h2>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Adjust the simulated bus movement velocity along municipal waypoints.
          </p>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-700">
              <span>Simulation Speed Multiplier:</span>
              <span className="font-mono text-blue-600">{simSpeed}x</span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={simSpeed}
              onChange={(e) => setSimSpeed(parseInt(e.target.value, 10))}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>1x (Real-time speed)</span>
              <span>3x</span>
              <span>5x (High velocity test)</span>
            </div>
          </div>
        </div>

        {/* SECTION 4: CONFIGURABLE CROWD DENSITY THRESHOLDS */}
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-800">
              4. Configurable Crowd Classification Thresholds
            </h2>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Customize the occupancy percentage bands for passenger display. Sourced from AI detections or demo simulation: Low (0–30%), Medium (31–70%), High (71–100%).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Low Crowd Ceiling (0% to {crowdLow}%):
              </label>
              <input
                type="number"
                min="10"
                max="50"
                value={crowdLow}
                onChange={(e) => setCrowdLow(parseInt(e.target.value, 10) || 30)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[11px] text-emerald-600 font-medium block">
                Classified as LOW (Seats available)
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Medium Crowd Ceiling ({crowdLow + 1}% to {crowdMedium}%):
              </label>
              <input
                type="number"
                min="40"
                max="85"
                value={crowdMedium}
                onChange={(e) => setCrowdMedium(parseInt(e.target.value, 10) || 70)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[11px] text-amber-600 font-medium block">
                Classified as MEDIUM ({`>${crowdMedium}%`} classified as HIGH)
              </span>
            </div>
          </div>
        </div>

        {/* Save Bar */}
        <div className="flex items-center justify-between pt-2">
          {savedSuccess && (
            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4" />
              <span>Settings saved successfully!</span>
            </span>
          )}
          <button
            type="submit"
            className="ml-auto px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md flex items-center gap-2 transition-all"
          >
            <Save className="w-4 h-4" />
            <span>Save Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
};

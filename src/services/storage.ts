import {
  AppSettings,
  Bus,
  BusRoute,
  BusStop,
  CrowdLevel,
  GPSLogEntry,
  NextBusArrival,
  User,
} from '../types';
import {
  INITIAL_ARRIVALS,
  INITIAL_BUSES,
  INITIAL_ROUTES,
  INITIAL_STOPS,
  INITIAL_USERS,
} from '../data/mockData';
import { fetchSheetDataSafe } from './googleSheets';
import {
  buildDatasetRoutesAndBuses,
  extractDatasetStops,
  getCoordinatesForStop,
  RawRouteRecord,
} from './routeEngine';
import {
  fetchPublicCrowdStatus,
  recordAIEstimateOnServer,
  setAdminToken,
  syncBusesToBackend,
} from './staffService';

const STORAGE_KEYS = {
  USER: 'smartbus_session_user',
  SETTINGS: 'smartbus_settings',
  BUSES: 'smartbus_buses',
  ROUTES: 'smartbus_routes',
  STOPS: 'smartbus_stops',
  USERS: 'smartbus_users',
  GPS_LOGS: 'smartbus_gps_logs',
};

const isClient = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
const safeGetItem = (key: string): string | null => {
  try {
    return isClient ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
};
const safeSetItem = (key: string, val: string): void => {
  try {
    if (isClient) localStorage.setItem(key, val);
  } catch {}
};
const safeRemoveItem = (key: string): void => {
  try {
    if (isClient) localStorage.removeItem(key);
  } catch {}
};

class StorageService {
  private buses: Bus[] = [];
  private routes: BusRoute[] = [];
  private stops: BusStop[] = [];
  private users: User[] = [];
  private gpsLogs: GPSLogEntry[] = [];
  private currentUser: User | null = null;
  private settings: AppSettings;
  private listeners: Set<() => void> = new Set();
  private simulationTimer: any = null;
  private datasetRoutes: BusRoute[] = [];
  private datasetBuses: Bus[] = [];
  private datasetStops: BusStop[] = [];
  private activeMapBusIds: Set<string> = new Set();
  private datasetHydrating = false;
  private datasetHydrated = false;
  private sheetsRoutesLoaded = false;
  private lastSheetsSyncError: string | null = null;

  constructor() {
    this.settings = this.loadSettings();
    this.initializeData();
    this.loadUserSession();
    this.startSimulation();
    if (isClient) {
      void this.hydrateDatasetFromServer();
      void this.refreshCrowdOverlaysFromServer();
      if (this.settings.isSheetsConnected && this.settings.googleSheetsApiUrl) {
        void this.syncWithGoogleSheets();
      }
    }
  }

  private loadSettings(): AppSettings {
    const saved = safeGetItem(STORAGE_KEYS.SETTINGS);
    const defaults: AppSettings = {
      googleSheetsApiUrl: '',
      isSheetsConnected: false,
      googleMapsApiKey: (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '',
      yoloFastApiUrl: 'http://localhost:8000/predict',
      simulationSpeedMultiplier: 1,
      simulationActive: true,
      selectedCity: 'Chennai',
    };
    if (saved) {
      try {
        return { ...defaults, ...JSON.parse(saved) };
      } catch (e) {
        return defaults;
      }
    }
    return defaults;
  }

  private initializeData() {
    // Load or seed Buses
    const savedBuses = safeGetItem(STORAGE_KEYS.BUSES);
    if (savedBuses) {
      try {
        const parsed = JSON.parse(savedBuses);
        // If saved buses have legacy 'SB-101' as busNumber or missing routeNumber or missing segmentProgress
        if (
          !Array.isArray(parsed) ||
          parsed.some((b: any) => b.busNumber?.startsWith('SB-') || !b.routeNumber || b.segmentProgress === undefined)
        ) {
          this.buses = [...INITIAL_BUSES];
          this.saveBuses();
        } else {
          this.buses = parsed;
        }
      } catch (e) {
        this.buses = [...INITIAL_BUSES];
      }
    } else {
      this.buses = [...INITIAL_BUSES];
      this.saveBuses();
    }

    // Load or seed Routes
    const savedRoutes = safeGetItem(STORAGE_KEYS.ROUTES);
    if (savedRoutes) {
      try {
        const parsedRoutes = JSON.parse(savedRoutes);
        const r95 = Array.isArray(parsedRoutes) && parsedRoutes.find((r: any) => r.id === 'rt_95x');
        if (!r95 || !r95.pathWaypoints || r95.pathWaypoints.length < 10) {
          this.routes = [...INITIAL_ROUTES];
          this.saveRoutes();
        } else {
          this.routes = parsedRoutes;
        }
      } catch (e) {
        this.routes = [...INITIAL_ROUTES];
      }
    } else {
      this.routes = [...INITIAL_ROUTES];
      this.saveRoutes();
    }

    // Load or seed Stops
    const savedStops = safeGetItem(STORAGE_KEYS.STOPS);
    if (savedStops) {
      try {
        this.stops = JSON.parse(savedStops);
      } catch (e) {
        this.stops = [...INITIAL_STOPS];
      }
    } else {
      this.stops = [...INITIAL_STOPS];
      this.saveStops();
    }

    // Load or seed Users
    const savedUsers = safeGetItem(STORAGE_KEYS.USERS);
    if (savedUsers) {
      try {
        this.users = JSON.parse(savedUsers);
      } catch (e) {
        this.users = [...INITIAL_USERS];
      }
    } else {
      this.users = [...INITIAL_USERS];
      this.saveUsers();
    }
  }

  private loadUserSession() {
    const saved = safeGetItem(STORAGE_KEYS.USER);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && parsed.id && parsed.email) {
          this.currentUser = parsed;
        } else {
          this.currentUser = null;
          safeRemoveItem(STORAGE_KEYS.USER);
        }
      } catch (e) {
        this.currentUser = null;
        safeRemoveItem(STORAGE_KEYS.USER);
      }
    } else {
      this.currentUser = null;
    }
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  // --- User & Auth ---
  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  public setCurrentUser(user: User | null) {
    this.currentUser = user;
    if (user) {
      safeSetItem(STORAGE_KEYS.USER, JSON.stringify(user));
      if (user.role !== 'admin') {
        setAdminToken(null);
      }
    } else {
      safeRemoveItem(STORAGE_KEYS.USER);
      setAdminToken(null);
    }
    this.notify();
  }

  public updateCurrentUserProfile(updates: { name?: string; avatar?: string }): User | null {
    if (!this.currentUser) return null;
    const nextName =
      typeof updates.name === 'string' && updates.name.trim().length >= 2
        ? updates.name.trim().slice(0, 80)
        : this.currentUser.name;
    const nextAvatar =
      updates.avatar !== undefined
        ? updates.avatar.trim() || undefined
        : this.currentUser.avatar;

    const updatedUser: User = {
      ...this.currentUser,
      name: nextName,
      avatar: nextAvatar,
    };

    this.currentUser = updatedUser;
    safeSetItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));

    const idx = this.users.findIndex((u) => u.id === updatedUser.id || u.email === updatedUser.email);
    if (idx !== -1) {
      this.users[idx] = { ...this.users[idx], name: nextName, avatar: nextAvatar };
      this.saveUsers();
    }

    this.notify();
    return updatedUser;
  }

  public getAllUsers(): User[] {
    return this.users;
  }

  public addUser(user: User) {
    this.users.push(user);
    this.saveUsers();
    this.notify();
  }

  public updateUserRole(userId: string, role: 'passenger' | 'admin') {
    const u = this.users.find((x) => x.id === userId);
    if (u) {
      u.role = role;
      if (this.currentUser?.id === userId) {
        this.currentUser.role = role;
        safeSetItem(STORAGE_KEYS.USER, JSON.stringify(this.currentUser));
        if (role !== 'admin') {
          setAdminToken(null);
        }
      }
      this.saveUsers();
      this.notify();
    }
  }

  public updateUserStatus(userId: string, status: 'active' | 'suspended') {
    const u = this.users.find((x) => x.id === userId);
    if (u) {
      u.status = status;
      this.saveUsers();
      this.notify();
    }
  }

  // --- Buses ---
  public getBuses(): Bus[] {
    return this.buses;
  }

  public getDatasetRoutes(): BusRoute[] {
    if (this.datasetRoutes.length > 0) {
      return this.datasetRoutes;
    }
    return this.routes;
  }

  public getDatasetBuses(): Bus[] {
    if (this.datasetBuses.length > 0) {
      const coreById = new Map(this.buses.map((b) => [b.id, b]));
      const extraBuses = this.datasetBuses.filter((b) => !coreById.has(b.id));
      return [...this.buses, ...extraBuses];
    }
    return this.buses;
  }

  public getDatasetStops(): BusStop[] {
    if (this.datasetStops.length > 0) {
      return this.datasetStops;
    }
    const derived = extractDatasetStops(this.getDatasetRoutes(), this.stops);
    return derived.length > 0 ? derived : this.stops;
  }

  public getLastSheetsSyncError(): string | null {
    return this.lastSheetsSyncError;
  }

  public setActiveMapBusIds(ids: string[]) {
    this.activeMapBusIds = new Set(ids);
  }

  public async hydrateDatasetFromServer(): Promise<void> {
    if (this.sheetsRoutesLoaded || this.datasetHydrating || this.datasetHydrated) return;
    if (typeof fetch !== 'function') return;

    this.datasetHydrating = true;
    try {
      const res = await fetch('/api/transit/routes-db');
      if (!res.ok) return;
      const data = await res.json();
      const rawRoutes: RawRouteRecord[] = Array.isArray(data?.routes) ? data.routes : [];
      if (rawRoutes.length === 0) return;

      // Don't overwrite if Google Sheets already loaded live routes while awaiting fetch
      if (this.sheetsRoutesLoaded) return;

      const built = buildDatasetRoutesAndBuses(rawRoutes, this.routes, this.buses);
      this.datasetRoutes = built.routes;
      // Preserve any cached roadWaypoints already present on this.routes
      this.datasetRoutes.forEach((dr) => {
        const local = this.routes.find((r) => r.id === dr.id);
        if (local?.roadWaypoints && local.roadWaypoints.length > 2 && !dr.roadWaypoints) {
          dr.roadWaypoints = local.roadWaypoints;
        }
      });
      this.datasetBuses = built.buses;
      this.datasetStops = extractDatasetStops(this.datasetRoutes, this.stops);
      this.datasetHydrated = true;
      void syncBusesToBackend(this.getDatasetBuses());
      void this.refreshCrowdOverlaysFromServer();
      this.notify();
    } catch (err) {
      console.warn('Dataset hydration skipped:', err);
    } finally {
      this.datasetHydrating = false;
    }
  }

  public async refreshCrowdOverlaysFromServer(): Promise<void> {
    if (typeof fetch !== 'function') return;
    const status = await fetchPublicCrowdStatus();
    if (!status?.busOverlays) return;
    Object.entries(status.busOverlays).forEach(([busId, overlay]: [string, any]) => {
      this.applyCrowdOverlayToMemory(busId, overlay);
    });
    this.notify();
  }

  private applyCrowdOverlayToMemory(busId: string, overlay: any) {
    const targets = [
      this.buses.find((b) => b.id === busId),
      this.datasetBuses.find((b) => b.id === busId),
    ].filter(Boolean) as Bus[];

    targets.forEach((bus) => {
      if (typeof overlay.manualOverrideEnabled === 'boolean') {
        bus.manualOverrideEnabled = overlay.manualOverrideEnabled;
      }
      if (overlay.aiCrowdEstimate) {
        bus.aiCrowdEstimate = overlay.aiCrowdEstimate;
      }
      if (overlay.staffCrowdReport) {
        bus.staffCrowdReport = overlay.staffCrowdReport;
      }
      if (overlay.crowdDiscrepancy !== undefined) {
        bus.crowdDiscrepancy = overlay.crowdDiscrepancy;
      }

      // AI remains PRIMARY whenever available; Staff Report is fallback only when AI is absent
      if (bus.aiCrowdEstimate) {
        bus.currentPassengers = bus.aiCrowdEstimate.passengerCount;
        bus.crowdPercentage = bus.aiCrowdEstimate.crowdPercentage;
        bus.crowdCategory = bus.aiCrowdEstimate.crowdCategory;
        bus.crowdDataSource = 'AI DETECTED';
      } else if (bus.staffCrowdReport) {
        bus.currentPassengers = bus.staffCrowdReport.passengerCount;
        bus.crowdPercentage = bus.staffCrowdReport.crowdPercentage;
        bus.crowdCategory = bus.staffCrowdReport.crowdCategory;
        bus.crowdDataSource = bus.staffCrowdReport.sourceLabel;
      }
    });
  }

  public getBusById(id: string): Bus | undefined {
    return this.buses.find((b) => b.id === id) || this.datasetBuses.find((b) => b.id === id);
  }

  public addBus(bus: Bus) {
    this.buses.push(bus);
    if (this.datasetBuses.length > 0 && !this.datasetBuses.some((b) => b.id === bus.id)) {
      this.datasetBuses.push({ ...bus });
    }
    this.saveBuses();
    void syncBusesToBackend([bus]);
    this.syncToSheetsIfConnected('syncBus', bus);
    this.notify();
  }

  public updateBus(id: string, updates: Partial<Bus>) {
    const idx = this.buses.findIndex((b) => b.id === id);
    if (idx !== -1) {
      this.buses[idx] = { ...this.buses[idx], ...updates, lastUpdated: new Date().toISOString() };
      this.saveBuses();
      this.syncToSheetsIfConnected('syncBus', this.buses[idx]);
    }
    const dsIdx = this.datasetBuses.findIndex((b) => b.id === id);
    if (dsIdx !== -1) {
      this.datasetBuses[dsIdx] = {
        ...this.datasetBuses[dsIdx],
        ...updates,
        lastUpdated: new Date().toISOString(),
      };
    }
    this.notify();
  }

  public deleteBus(id: string) {
    this.buses = this.buses.filter((b) => b.id !== id);
    this.datasetBuses = this.datasetBuses.filter((b) => b.id !== id);
    this.saveBuses();
    this.notify();
  }

  // Admin Manual GPS Update (Rule: changes source to MANUAL)
  public manualUpdateBusGPS(id: string, lat: number, lng: number, speed = 30) {
    const bus = this.buses.find((b) => b.id === id) || this.datasetBuses.find((b) => b.id === id);
    if (bus) {
      bus.latitude = lat;
      bus.longitude = lng;
      bus.speedKmh = speed;
      bus.locationSource = 'MANUAL';
      bus.lastUpdated = new Date().toISOString();
      this.logGPS(bus.id, bus.busNumber, lat, lng, speed, 'MANUAL');
      this.saveBuses();
      this.notify();
    }
  }

  // PRIMARY: AI Vision Passenger Estimation (Never overwritten by staff manual reports)
  public applyAICrowdEstimate(
    id: string,
    passengers: number,
    capacity?: number,
    detectionSource = 'AI_VISION'
  ) {
    const targets = [
      this.buses.find((b) => b.id === id),
      this.datasetBuses.find((b) => b.id === id),
    ].filter(Boolean) as Bus[];

    if (targets.length === 0) return;

    const nowIso = new Date().toISOString();
    const refBus = targets[0];
    const cap = capacity && capacity > 0 ? capacity : refBus.capacity || 50;
    const clampedPax = Math.max(0, Math.round(passengers));
    const pct = Math.min(100, Math.round((clampedPax / cap) * 100));
    const cat = this.classifyCrowd(pct);

    const aiRecord = {
      passengerCount: clampedPax,
      capacity: cap,
      crowdPercentage: pct,
      crowdCategory: cat,
      detectionSource,
      timestamp: nowIso,
    };

    targets.forEach((bus) => {
      bus.capacity = cap;
      bus.aiCrowdEstimate = aiRecord;
      bus.currentPassengers = clampedPax;
      bus.crowdPercentage = pct;
      bus.crowdCategory = cat;
      bus.crowdDataSource = 'AI DETECTED';
      bus.lastUpdated = nowIso;
      if (bus.staffCrowdReport) {
        const delta = Math.abs(clampedPax - bus.staffCrowdReport.passengerCount);
        bus.crowdDiscrepancy = {
          hasDiscrepancy:
            cat !== bus.staffCrowdReport.crowdCategory ||
            delta >= Math.max(8, Math.round(cap * 0.2)),
          aiLevel: cat,
          staffLevel: bus.staffCrowdReport.crowdCategory,
          deltaPassengers: delta,
          reviewedByAdmin: false,
        };
      }
    });

    this.saveBuses();
    this.notify();
    void recordAIEstimateOnServer({
      busId: refBus.id,
      busNumber: refBus.busNumber,
      routeNumber: refBus.routeNumber,
      passengerCount: clampedPax,
      capacity: cap,
      detectionSource,
    });
  }

  // Apply backend-authorized Staff / Admin Manual Crowd Report cleanly alongside AI Estimate
  public applyStaffCrowdOverlay(
    id: string,
    overlay: {
      staffCrowdReport: Bus['staffCrowdReport'];
      aiCrowdEstimate?: Bus['aiCrowdEstimate'];
      crowdDiscrepancy?: Bus['crowdDiscrepancy'];
    }
  ) {
    this.applyCrowdOverlayToMemory(id, overlay);
    this.saveBuses();
    this.notify();
  }

  // Legacy/Admin helper: Manual Crowd Override (never overwrites existing AI Estimate)
  public manualUpdateBusCrowd(id: string, passengers: number, capacity?: number) {
    const targets = [
      this.buses.find((b) => b.id === id),
      this.datasetBuses.find((b) => b.id === id),
    ].filter(Boolean) as Bus[];
    if (targets.length === 0) return;

    const nowIso = new Date().toISOString();
    const refBus = targets[0];
    const cap = capacity && capacity > 0 ? capacity : refBus.capacity || 50;
    const pax = Math.max(0, Math.round(passengers));
    const pct = Math.min(100, Math.round((pax / cap) * 100));
    const cat = this.classifyCrowd(pct);

    const staffReport: Bus['staffCrowdReport'] = {
      passengerCount: pax,
      capacity: cap,
      crowdPercentage: pct,
      crowdCategory: cat,
      staffRole: 'admin',
      sourceLabel: 'MANUAL OVERRIDE',
      timestamp: nowIso,
    };

    this.applyCrowdOverlayToMemory(id, {
      staffCrowdReport: staffReport,
      crowdDiscrepancy: refBus.aiCrowdEstimate
        ? {
            hasDiscrepancy:
              refBus.aiCrowdEstimate.crowdCategory !== cat ||
              Math.abs(refBus.aiCrowdEstimate.passengerCount - pax) >=
                Math.max(8, Math.round(cap * 0.2)),
            aiLevel: refBus.aiCrowdEstimate.crowdCategory,
            staffLevel: cat,
            deltaPassengers: Math.abs(refBus.aiCrowdEstimate.passengerCount - pax),
            reviewedByAdmin: false,
          }
        : undefined,
    });

    this.saveBuses();
    this.notify();
  }

  // --- Routes & Stops ---
  public getRoutes(): BusRoute[] {
    return this.routes;
  }

  public getStops(): BusStop[] {
    return this.stops;
  }

  public addRoute(route: BusRoute) {
    this.routes.push(route);
    this.saveRoutes();
    this.notify();
  }

  public updateRoute(id: string, updates: Partial<BusRoute>) {
    const idx = this.routes.findIndex((r) => r.id === id);
    if (idx !== -1) {
      this.routes[idx] = { ...this.routes[idx], ...updates };
      this.saveRoutes();
      this.notify();
    }
  }

  public deleteRoute(id: string) {
    this.routes = this.routes.filter((r) => r.id !== id);
    this.saveRoutes();
    this.notify();
  }

  public updateRouteRoadGeometry(routeIdentifier: string, roadWaypoints: [number, number][]) {
    if (!roadWaypoints || roadWaypoints.length < 2) return;
    let updated = false;

    const applyTo = (list: BusRoute[]) => {
      const byId = list.find((r) => r.id === routeIdentifier);
      const target =
        byId ||
        list.find((r) => r.routeNumber.toLowerCase() === routeIdentifier.toLowerCase());
      if (target && (!target.roadWaypoints || target.roadWaypoints.length !== roadWaypoints.length)) {
        target.roadWaypoints = roadWaypoints;
        return true;
      }
      return false;
    };

    if (applyTo(this.routes)) {
      this.saveRoutes();
      updated = true;
    }
    if (applyTo(this.datasetRoutes)) {
      updated = true;
    }
    if (updated) {
      this.notify();
    }
  }

  public addStop(stop: BusStop) {
    this.stops.push(stop);
    this.saveStops();
    this.notify();
  }

  public updateStop(id: string, updates: Partial<BusStop>) {
    const idx = this.stops.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.stops[idx] = { ...this.stops[idx], ...updates };
      this.saveStops();
      this.notify();
    }
  }

  public deleteStop(id: string) {
    this.stops = this.stops.filter((s) => s.id !== id);
    this.saveStops();
    this.notify();
  }

  // --- Arrivals ---
  public getNextArrivals(stopId?: string): NextBusArrival[] {
    const dynamicArrivals: NextBusArrival[] = [];
    const activeRoutesPool = this.getDatasetRoutes();
    const activeBusesPool = this.getDatasetBuses();
    const seenKeys = new Set<string>();

    const routeById = new Map<string, BusRoute>();
    const routeByNum = new Map<string, BusRoute>();
    activeRoutesPool.forEach((r) => {
      routeById.set(r.id, r);
      if (r.routeNumber && !routeByNum.has(r.routeNumber.toLowerCase())) {
        routeByNum.set(r.routeNumber.toLowerCase(), r);
      }
    });

    const targetStopObj =
      stopId && stopId !== 'ALL'
        ? this.getDatasetStops().find((s) => s.id === stopId)
        : undefined;
    const targetStopNorm = targetStopObj?.name.toLowerCase().trim();

    // Dynamically derive upcoming arrivals from active fleet (core + hydrated Chennai dataset)
    activeBusesPool.forEach((bus) => {
      if (bus.status === 'out_of_service' || bus.status === 'maintenance') return;
      const route =
        routeById.get(bus.routeId) ||
        routeByNum.get((bus.routeNumber || bus.busNumber || '').toLowerCase());
      const destination = route?.endPoint || route?.routeName || 'Terminal';

      const stopIdVal = bus.nextStopId || '';
      const stopNameVal = bus.nextStopName || '';
      if (!stopIdVal || !stopNameVal) return;

      if (targetStopNorm) {
        const matchesStop =
          stopIdVal === stopId ||
          stopNameVal.toLowerCase().trim() === targetStopNorm ||
          (route?.stops || []).some(
            (st) => st.stopId === stopId || st.stopName.toLowerCase().trim() === targetStopNorm
          );
        if (!matchesStop) return;
      }

      const key = `${stopIdVal}_${bus.routeNumber || bus.busNumber}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      const eta = Math.max(1, bus.etaNextStopMin || 2);
      dynamicArrivals.push({
        id: `arr_${bus.id}_${stopIdVal}`,
        stopId: stopIdVal,
        stopName: stopNameVal,
        busId: bus.id,
        busNumber: bus.busNumber || bus.routeNumber,
        routeNumber: bus.routeNumber || bus.busNumber,
        destination,
        estimatedArrivalMin: eta,
        scheduledTime: new Date(Date.now() + eta * 60000).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        crowdCategory: bus.crowdCategory,
        expectedCrowdCategory: bus.crowdCategory,
        crowdPercentage: bus.crowdPercentage,
        distanceKm: Number(
          (bus.speedKmh > 0 ? bus.speedKmh * (eta / 60) : 0.4).toFixed(1)
        ),
        acType: bus.acType || 'Non-AC',
      });
    });

    // Merge static entries for stops that don't currently have a live bus approaching
    INITIAL_ARRIVALS.forEach((initArr) => {
      const key = `${initArr.stopId}_${initArr.routeNumber}`;
      if (!seenKeys.has(key)) {
        if (!stopId || stopId === 'ALL' || initArr.stopId === stopId) {
          dynamicArrivals.push(initArr);
          seenKeys.add(key);
        }
      }
    });

    dynamicArrivals.sort((a, b) => a.estimatedArrivalMin - b.estimatedArrivalMin);
    if (!stopId || stopId === 'ALL') {
      return dynamicArrivals.slice(0, 60);
    }
    return dynamicArrivals;
  }

  // --- GPS Logs ---
  public getGPSLogs(): GPSLogEntry[] {
    return this.gpsLogs;
  }

  private logGPS(
    busId: string,
    busNumber: string,
    lat: number,
    lng: number,
    speed: number,
    source: 'SIMULATED' | 'MANUAL' | 'REAL-TIME GPS'
  ) {
    const entry: GPSLogEntry = {
      id: `gps_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      busId,
      busNumber,
      latitude: lat,
      longitude: lng,
      speedKmh: speed,
      locationSource: source,
      timestamp: new Date().toISOString(),
    };
    this.gpsLogs.unshift(entry);
    if (this.gpsLogs.length > 100) this.gpsLogs.pop();
  }

  // --- Settings ---
  public getSettings(): AppSettings {
    return this.settings;
  }

  public updateSettings(partial: Partial<AppSettings>) {
    this.settings = { ...this.settings, ...partial };
    safeSetItem(STORAGE_KEYS.SETTINGS, JSON.stringify(this.settings));
    this.notify();
  }

  // Helper for Crowd Classification: 0-30 LOW, 31-70 MEDIUM, 71-100 HIGH (Configurable)
  public classifyCrowd(percentage: number): CrowdLevel {
    const lowMax = this.settings.crowdThresholdLow ?? 30;
    const medMax = this.settings.crowdThresholdMedium ?? 70;
    if (percentage <= lowMax) return 'LOW';
    if (percentage <= medMax) return 'MEDIUM';
    return 'HIGH';
  }

  // --- Real-time Simulation Engine ---
  // High-precision progressive movement strictly along road route polylines
  private stepBusAlongRoute(bus: Bus, route: BusRoute | undefined): boolean {
    if (bus.status === 'out_of_service' || bus.status === 'maintenance') return false;
    if (!route || !route.pathWaypoints || route.pathWaypoints.length < 2) return false;

    // Check if bus is dwelling at a designated bus stop
    if (bus.dwellRemainingTicks && bus.dwellRemainingTicks > 0) {
      bus.dwellRemainingTicks -= 1;
      bus.speedKmh = 0;
      bus.lastUpdated = new Date().toISOString();
      return true;
    }

    // Use high-resolution road curves from Google Routes API when available
    const P =
      route.roadWaypoints && route.roadWaypoints.length > 2
        ? route.roadWaypoints
        : route.pathWaypoints;
    let idx = bus.currentWaypointIndex ?? 0;
    let prog = bus.segmentProgress ?? 0;

    // Ensure valid segment index
    if (idx >= P.length - 1) {
      idx = 0;
      prog = 0;
      bus.lastServicedStopId = undefined;
    }

    // Check if bus has arrived at an intermediate or terminus designated stop
    if (route.stops && route.stops.length > 0) {
      const reachedStop = route.stops.find((s) => {
        const dist = Math.hypot(s.latitude - bus.latitude, s.longitude - bus.longitude);
        return dist < 0.00065 && bus.lastServicedStopId !== s.stopId;
      });

      if (reachedStop) {
        bus.lastServicedStopId = reachedStop.stopId;
        const speedMult = this.settings.simulationSpeedMultiplier || 1;
        // Dwell for 2 ticks at 1x speed to allow realistic passenger boarding/alighting
        bus.dwellRemainingTicks = Math.max(1, Math.round(2 / Math.min(2, speedMult)));
        bus.speedKmh = 0;

        // Realistic passenger exchange ONLY when running in simulated crowd mode
        const isSimulatedCrowd =
          !bus.aiCrowdEstimate &&
          !bus.staffCrowdReport &&
          (!bus.crowdDataSource ||
            bus.crowdDataSource === 'DEMO_SIMULATION' ||
            bus.crowdDataSource === 'SIMULATED');
        if (isSimulatedCrowd) {
          const change = Math.floor(Math.random() * 7) - 3;
          bus.currentPassengers = Math.max(4, Math.min(bus.capacity, bus.currentPassengers + change));
          bus.crowdPercentage = Math.round((bus.currentPassengers / bus.capacity) * 100);
          bus.crowdCategory = this.classifyCrowd(bus.crowdPercentage);
          bus.crowdDataSource = 'SIMULATED';
        }

        // Determine subsequent stop
        const curStopIdx = route.stops.findIndex((s) => s.stopId === reachedStop.stopId);
        const nextStop =
          curStopIdx >= 0 && curStopIdx < route.stops.length - 1
            ? route.stops[curStopIdx + 1]
            : route.stops[0];

        if (nextStop) {
          bus.nextStopName = nextStop.stopName;
          bus.nextStopId = nextStop.stopId;
          const typical = nextStop.typicalTimeMinutes || 3;
          bus.etaNextStopMin = Math.max(1, Math.round(typical / (1.28 * speedMult)));
        }

        bus.lastUpdated = new Date().toISOString();
        return true;
      }
    }

    // Clear serviced stop once bus has traveled beyond proximity threshold
    if (bus.lastServicedStopId && route.stops) {
      const lastStop = route.stops.find((s) => s.stopId === bus.lastServicedStopId);
      if (
        lastStop &&
        Math.hypot(lastStop.latitude - bus.latitude, lastStop.longitude - bus.longitude) > 0.0018
      ) {
        bus.lastServicedStopId = undefined;
      }
    }

    const pA = P[idx];
    const pB = P[idx + 1];
    const segDist = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]);

    // Progressive step calculation: simulation speed increased by approximately 30% (0.064 * 1.30 = 0.084)
    const speedMult = this.settings.simulationSpeedMultiplier || 1;
    const baseStep = 0.084 * speedMult;
    const step = Math.min(0.34, Math.max(0.034, baseStep / Math.max(0.005, segDist * 10)));
    prog += step;

    if (prog >= 1.0) {
      prog = 0.0;
      idx = (idx + 1) % (P.length - 1);
      if (idx === 0) {
        bus.lastServicedStopId = undefined;
      }

      // Minor passenger fluctuation ONLY when running in simulated crowd mode
      const isSimCrowd =
        !bus.aiCrowdEstimate &&
        !bus.staffCrowdReport &&
        (!bus.crowdDataSource ||
          bus.crowdDataSource === 'DEMO_SIMULATION' ||
          bus.crowdDataSource === 'SIMULATED');
      if (isSimCrowd) {
        const change = Math.floor(Math.random() * 3) - 1;
        bus.currentPassengers = Math.max(4, Math.min(bus.capacity, bus.currentPassengers + change));
        bus.crowdPercentage = Math.round((bus.currentPassengers / bus.capacity) * 100);
        bus.crowdCategory = this.classifyCrowd(bus.crowdPercentage);
        bus.crowdDataSource = 'SIMULATED';
      }

      // Update Next Stop based on route stops
      if (route.stops && route.stops.length > 0) {
        const aheadStops = route.stops.filter((st) => {
          const d = Math.hypot(st.latitude - bus.latitude, st.longitude - bus.longitude);
          return d > 0.0008;
        });
        const nextStop = aheadStops[0] || route.stops[0];
        if (nextStop) {
          bus.nextStopName = nextStop.stopName;
          bus.nextStopId = nextStop.stopId;
        }
      }
    }

    bus.currentWaypointIndex = idx;
    bus.segmentProgress = Number(prog.toFixed(4));

    // Position MUST be mathematically interpolated between pA and pB on the polyline:
    const curA = P[idx];
    const curB = P[idx + 1];
    const newLat = curA[0] + (curB[0] - curA[0]) * prog;
    const newLng = curA[1] + (curB[1] - curA[1]) * prog;
    bus.latitude = Number(newLat.toFixed(6));
    bus.longitude = Number(newLng.toFixed(6));

    // Exact heading orientation aligned with segment vector
    const dLat = curB[0] - curA[0];
    const dLng = (curB[1] - curA[1]) * Math.cos((((curA[0] + curB[0]) / 2) * Math.PI) / 180);
    bus.heading = Math.round(((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360);

    // Displayed cruising speed: scaled by 30% to 46-59 km/h (average ~53 km/h on express corridors)
    const baseCruisingSpeed = Math.floor(46 + Math.random() * 14);
    bus.speedKmh = Math.round(
      baseCruisingSpeed * (speedMult > 1 ? 1 + (speedMult - 1) * 0.25 : 1)
    );
    bus.lastUpdated = new Date().toISOString();
    if (bus.locationSource !== 'MANUAL') {
      bus.locationSource = 'SIMULATED';
    }

    // ETA to next stop consistent with updated 30% faster movement
    bus.etaNextStopMin = Math.max(1, Math.round(((1.0 - prog) * 2.8) / speedMult + 1));
    return true;
  }

  private startSimulation() {
    if (this.simulationTimer) clearInterval(this.simulationTimer);

    // 1000ms tick rate for smooth progressive movement along the polyline
    this.simulationTimer = setInterval(() => {
      if (!this.settings.simulationActive) return;

      const activeRoutesPool = this.getDatasetRoutes();
      const findRouteForBus = (bus: Bus) =>
        activeRoutesPool.find((r) => r.id === bus.routeId) ||
        activeRoutesPool.find((r) => r.routeNumber.toLowerCase() === bus.routeNumber.toLowerCase());

      let coreChanged = false;
      const coreIds = new Set<string>();
      this.buses.forEach((bus) => {
        coreIds.add(bus.id);
        if (this.stepBusAlongRoute(bus, findRouteForBus(bus))) {
          coreChanged = true;
        }
      });

      let extraChanged = false;
      if (this.activeMapBusIds.size > 0 && this.datasetBuses.length > 0) {
        this.datasetBuses.forEach((bus) => {
          if (coreIds.has(bus.id) || !this.activeMapBusIds.has(bus.id)) return;
          if (this.stepBusAlongRoute(bus, findRouteForBus(bus))) {
            extraChanged = true;
          }
        });
      }

      if (coreChanged) {
        this.saveBuses();
      }
      if (coreChanged || extraChanged) {
        this.notify();
      }
    }, 1000);
  }

  private saveBuses() {
    safeSetItem(STORAGE_KEYS.BUSES, JSON.stringify(this.buses));
  }

  private saveRoutes() {
    safeSetItem(STORAGE_KEYS.ROUTES, JSON.stringify(this.routes));
  }

  private saveStops() {
    safeSetItem(STORAGE_KEYS.STOPS, JSON.stringify(this.stops));
  }

  private saveUsers() {
    safeSetItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
  }

  /**
   * Pull live Routes, Route_Stops, Stops, and Buses from Google Sheets tabs
   * when GOOGLE_SHEETS_API_URL is configured. Preserves existing Chennai dataset
   * if Sheets returns empty/unmapped tabs so Bus Routes never drops to 0.
   */
  public async syncWithGoogleSheets(): Promise<boolean> {
    if (!this.settings.isSheetsConnected || !this.settings.googleSheetsApiUrl) return false;

    const getField = (row: Record<string, any>, ...keys: string[]): any => {
      if (!row || typeof row !== 'object') return undefined;
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== '') return row[k];
      }
      const lowerMap = new Map<string, any>();
      Object.keys(row).forEach((rk) => {
        lowerMap.set(rk.trim().toLowerCase().replace(/[\s-]+/g, '_'), row[rk]);
      });
      for (const k of keys) {
        const normKey = k.trim().toLowerCase().replace(/[\s-]+/g, '_');
        const val = lowerMap.get(normKey);
        if (val !== undefined && val !== '') return val;
      }
      return undefined;
    };

    try {
      const [routesRes, routeStopsRes, stopsRes, busesRes] = await Promise.all([
        fetchSheetDataSafe(this.settings.googleSheetsApiUrl, 'Routes'),
        fetchSheetDataSafe(this.settings.googleSheetsApiUrl, 'Route_Stops'),
        fetchSheetDataSafe(this.settings.googleSheetsApiUrl, 'Stops'),
        fetchSheetDataSafe(this.settings.googleSheetsApiUrl, 'Buses'),
      ]);

      const sheetRoutes = routesRes.records;
      const sheetRouteStops = routeStopsRes.records;
      const sheetStops = stopsRes.records;
      const sheetBuses = busesRes.records;

      if (!routesRes.ok && routesRes.error) {
        this.lastSheetsSyncError = routesRes.error;
      } else {
        this.lastSheetsSyncError = null;
      }

      // Update Stops if valid stops are returned from Google Sheets
      if (Array.isArray(sheetStops) && sheetStops.length > 0) {
        const mappedStops: BusStop[] = sheetStops
          .map((s: any, idx: number) => {
            const name = String(getField(s, 'name', 'stop_name', 'stop') || '').trim();
            if (!name) return null;
            const id = String(getField(s, 'id', 'stop_id') || `stp_gs_${idx}`);
            const code = String(getField(s, 'code', 'stop_code') || `CHN-${idx + 1}`);
            const coords = getCoordinatesForStop(name);
            const lat = Number(getField(s, 'latitude', 'lat')) || coords?.[0] || 0;
            const lng = Number(getField(s, 'longitude', 'lng', 'lon')) || coords?.[1] || 0;
            return {
              id,
              code,
              name,
              latitude: lat,
              longitude: lng,
              city: String(getField(s, 'city') || 'Chennai'),
              address: getField(s, 'address') ? String(getField(s, 'address')) : undefined,
              shelterAvailable:
                getField(s, 'shelter_available', 'shelter') === true ||
                String(getField(s, 'shelter_available', 'shelter')).toUpperCase() === 'TRUE',
            } as BusStop;
          })
          .filter(Boolean) as BusStop[];

        if (mappedStops.length > 0) {
          this.stops = mappedStops;
          this.saveStops();
        }
      }

      // Update Buses if valid buses are returned from Google Sheets
      if (Array.isArray(sheetBuses) && sheetBuses.length > 0) {
        const mappedBuses: Bus[] = sheetBuses
          .map((b: any, idx: number) => {
            const routeNum = String(getField(b, 'route_number', 'routeNumber', 'bus_number', 'busNumber') || '').trim();
            const busNum = String(getField(b, 'bus_number', 'busNumber', 'route_number') || routeNum).trim();
            if (!busNum && !routeNum) return null;
            const cap = Number(getField(b, 'capacity')) || 50;
            const curr = Number(getField(b, 'current_passengers', 'currentPassengers')) || 15;
            const pct = Number(getField(b, 'crowd_percentage', 'crowdPercentage')) || Math.round((curr / cap) * 100);
            return {
              id: String(getField(b, 'id') || `bus_gs_${idx}`),
              busNumber: busNum || routeNum,
              routeId: String(getField(b, 'route_id', 'routeId') || `rt_${routeNum}`),
              routeName: String(getField(b, 'route_name', 'routeName') || ''),
              routeNumber: routeNum || busNum,
              capacity: cap,
              currentPassengers: curr,
              crowdPercentage: pct,
              crowdCategory: (getField(b, 'crowd_category', 'crowdCategory') as any) || this.classifyCrowd(pct),
              latitude: Number(getField(b, 'latitude', 'lat')) || 12.901,
              longitude: Number(getField(b, 'longitude', 'lng')) || 80.2279,
              speedKmh: Number(getField(b, 'speed_kmh', 'speedKmh')) || 30,
              heading: 180,
              status: (getField(b, 'status') as any) || 'active',
              locationSource: (getField(b, 'location_source', 'locationSource') as any) || 'SIMULATED',
              lastUpdated: String(getField(b, 'last_updated', 'lastUpdated') || new Date().toISOString()),
              nextStopId: String(getField(b, 'next_stop_id') || 'stp_next'),
              nextStopName: String(getField(b, 'next_stop_name', 'nextStopName') || 'Upcoming Stop'),
              etaNextStopMin: Number(getField(b, 'eta_next_stop_min', 'etaNextStopMin')) || 5,
              acType: 'Electric EV',
              licensePlate: 'TN-01-EV-9501',
            } as Bus;
          })
          .filter(Boolean) as Bus[];

        if (mappedBuses.length > 0) {
          this.buses = mappedBuses;
          this.saveBuses();
        }
      }

      // Update Routes & Route_Stops if Google Sheets actually returned route records
      if (Array.isArray(sheetRoutes) && sheetRoutes.length > 0) {
        // Detect if sheetRows follow CSV-style flat schema (route, origin, destination, via)
        // vs relational 10-tab schema (id, route_number, start_point, end_point + Route_Stops)
        const flatRawRecords: RawRouteRecord[] = [];
        const relationalRoutes: BusRoute[] = [];

        sheetRoutes.forEach((r: any, idx: number) => {
          const rNum = String(getField(r, 'route_number', 'routeNumber', 'route') || '').trim();
          const startPt = String(getField(r, 'start_point', 'startPoint', 'origin') || '').trim();
          const endPt = String(getField(r, 'end_point', 'endPoint', 'destination') || '').trim();
          const viaStr = String(getField(r, 'via', 'via_stops') || '').trim();
          const notesStr = getField(r, 'notes') ? String(getField(r, 'notes')) : undefined;
          const catStr = getField(r, 'category') ? String(getField(r, 'category')) : undefined;
          const rId = String(getField(r, 'id', 'route_id') || `rt_${rNum || idx}`).trim();
          const rName = String(getField(r, 'route_name', 'routeName') || (startPt && endPt ? `${startPt} ⇄ ${endPt}` : rNum)).trim();

          if (!rNum) return;

          const matchingRouteStops = Array.isArray(sheetRouteStops)
            ? sheetRouteStops
                .filter((rs: any) => {
                  const rsRouteId = String(getField(rs, 'route_id', 'routeId', 'route_number', 'route') || '').trim();
                  return (
                    rsRouteId === rId ||
                    rsRouteId.toLowerCase() === rNum.toLowerCase()
                  );
                })
                .sort(
                  (a: any, b: any) =>
                    (Number(getField(a, 'sequence_order', 'sequenceOrder', 'seq')) || 0) -
                    (Number(getField(b, 'sequence_order', 'sequenceOrder', 'seq')) || 0)
                )
            : [];

          if (matchingRouteStops.length >= 2) {
            const builtStops = matchingRouteStops
              .map((rs: any, sIdx: number) => {
                const rsStopId = String(getField(rs, 'stop_id', 'stopId', 'stop_name', 'stop') || '').trim();
                const stopObj = this.stops.find(
                  (s) => s.id === rsStopId || s.code === rsStopId || s.name.toLowerCase() === rsStopId.toLowerCase()
                );
                const stopName = String(getField(rs, 'stop_name', 'stopName') || stopObj?.name || rsStopId).trim();
                const coords =
                  stopObj && stopObj.latitude && stopObj.longitude
                    ? ([stopObj.latitude, stopObj.longitude] as [number, number])
                    : getCoordinatesForStop(stopName);
                return {
                  stopId: stopObj?.id || rsStopId || `stp_${sIdx}`,
                  stopName,
                  sequenceOrder: Number(getField(rs, 'sequence_order', 'sequenceOrder', 'seq')) || sIdx + 1,
                  distanceFromStartKm: Number(getField(rs, 'distance_from_start_km', 'distanceFromStartKm')) || sIdx * 2,
                  typicalTimeMinutes: Number(getField(rs, 'typical_time_min', 'typicalTimeMinutes')) || sIdx * 4,
                  latitude: coords?.[0] || 0,
                  longitude: coords?.[1] || 0,
                };
              })
              .filter((st) => st.stopName);

            const waypoints: [number, number][] = builtStops
              .filter((st) => st.latitude !== 0 && st.longitude !== 0)
              .map((st) => [st.latitude, st.longitude]);

            relationalRoutes.push({
              id: rId,
              routeNumber: rNum,
              routeName: rName,
              startPoint: startPt || builtStops[0]?.stopName || '',
              endPoint: endPt || builtStops[builtStops.length - 1]?.stopName || '',
              distanceKm: Number(getField(r, 'distance_km', 'distanceKm')) || Math.max(5, builtStops.length * 1.8),
              estimatedDurationMin: Number(getField(r, 'estimated_duration_min', 'estimatedDurationMin')) || Math.max(15, builtStops.length * 4),
              city: String(getField(r, 'city') || 'Chennai'),
              frequencyMinutes: 10,
              color: '#3b82f6',
              stops: builtStops,
              pathWaypoints: waypoints.length >= 2 ? waypoints : [[12.901, 80.2279], [12.871, 80.082]],
            });
          } else if (startPt && endPt) {
            flatRawRecords.push({
              route: rNum,
              origin: startPt,
              destination: endPt,
              via: viaStr,
              notes: notesStr,
              category: catStr,
            });
          }
        });

        if (flatRawRecords.length > 0 || relationalRoutes.length > 0) {
          const baseForBuild = relationalRoutes.length > 0 ? relationalRoutes : this.routes;
          const built = buildDatasetRoutesAndBuses(flatRawRecords, baseForBuild, this.buses);
          if (built.routes.length > 0) {
            this.datasetRoutes = built.routes;
            this.datasetBuses = built.buses;
            this.datasetStops = extractDatasetStops(built.routes, this.stops);
            this.sheetsRoutesLoaded = true;
            if (relationalRoutes.length > 0) {
              this.routes = relationalRoutes;
              this.saveRoutes();
            }
          }
        }
      }

      void syncBusesToBackend(this.getDatasetBuses());
      void this.refreshCrowdOverlaysFromServer();
      this.notify();
      return routesRes.ok;
    } catch (err: any) {
      this.lastSheetsSyncError = err?.message || 'Failed to sync data from Google Sheets';
      console.warn('Failed to sync data from Google Sheets:', err);
      return false;
    }
  }

  private async syncToSheetsIfConnected(action: string, data: any) {
    if (!this.settings.isSheetsConnected || !this.settings.googleSheetsApiUrl) return;
    try {
      await fetch('/api/sheets/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: this.settings.googleSheetsApiUrl,
          payload: { action, data },
        }),
      });
    } catch (e) {
      console.warn('Sheets sync skipped:', e);
    }
  }
}

export const storageService = new StorageService();

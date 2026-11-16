export type UserRole = 'passenger' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash?: string;
  salt?: string;
  createdAt: string;
  status: 'active' | 'suspended';
  avatar?: string;
}

export type CrowdLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type LocationSource = 'SIMULATED' | 'MANUAL' | 'REAL-TIME GPS';

export interface BusStop {
  id: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  city: string;
  address?: string;
  shelterAvailable?: boolean;
}

export interface RouteStopItem {
  stopId: string;
  stopName: string;
  sequenceOrder: number;
  distanceFromStartKm: number;
  typicalTimeMinutes: number;
  latitude: number;
  longitude: number;
}

export interface BusRoute {
  id: string;
  routeNumber: string;
  routeName: string;
  startPoint: string;
  endPoint: string;
  distanceKm: number;
  estimatedDurationMin: number;
  city: string;
  frequencyMinutes: number;
  stops: RouteStopItem[];
  pathWaypoints: [number, number][]; // [lat, lng] path
  roadWaypoints?: [number, number][]; // High-precision road geometry from Google Routes API
  color: string;
}

export type CrowdDataSourceLabel =
  | 'AI DETECTED'
  | 'STAFF REPORTED'
  | 'SIMULATED'
  | 'MANUAL OVERRIDE'
  | 'AI_VISION_VERIFIED'
  | 'DEMO_SIMULATION';

export interface AICrowdEstimateRecord {
  passengerCount: number;
  capacity: number;
  crowdPercentage: number;
  crowdCategory: CrowdLevel;
  detectionSource: string;
  timestamp: string;
}

export interface StaffCrowdReportRecord {
  passengerCount: number;
  capacity: number;
  crowdPercentage: number;
  crowdCategory: CrowdLevel;
  staffRole: 'driver' | 'conductor' | 'admin';
  sourceLabel: 'STAFF REPORTED' | 'MANUAL OVERRIDE';
  timestamp: string;
}

export interface CrowdDiscrepancyRecord {
  hasDiscrepancy: boolean;
  aiLevel: CrowdLevel;
  staffLevel: CrowdLevel;
  deltaPassengers: number;
  reviewedByAdmin?: boolean;
  reviewedAt?: string;
}

export type StaffRole = 'driver' | 'conductor';
export type StaffVerificationStatus = 'pending' | 'verified' | 'rejected';
export type StaffEmploymentStatus = 'active' | 'inactive' | 'suspended' | 'revoked';
export type CrowdPolicyMode =
  | 'AI_PRIMARY_WITH_STAFF_SUPPLEMENTARY'
  | 'AI_PRIMARY_WITH_STAFF_FALLBACK';

export interface StaffMember {
  id: string;
  staffId: string;
  fullName: string;
  role: StaffRole;
  mobileLast4: string;
  assignedBusId: string;
  assignedBusNumber?: string;
  assignedRouteNumber?: string;
  shiftLabel: string;
  shiftActive: boolean;
  employmentStatus: StaffEmploymentStatus;
  verificationStatus: StaffVerificationStatus;
  verificationMethod: 'mobile_otp' | 'admin_approved' | 'document_assisted';
  hasSupportingDocument: boolean;
  pendingDocumentId?: string;
  documentPurgedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffSession {
  token: string;
  staff: StaffMember;
  verifiedAt: string;
}

export interface StaffCrowdAuditEntry {
  id: string;
  busId: string;
  busNumber: string;
  routeNumber: string;
  staffId: string;
  staffName: string;
  staffRole: 'driver' | 'conductor' | 'admin';
  passengerCount: number;
  capacity: number;
  crowdPercentage: number;
  crowdLevel: CrowdLevel;
  sourceLabel: 'STAFF REPORTED' | 'MANUAL OVERRIDE' | 'AI DETECTED';
  aiLevelAtTime?: CrowdLevel;
  aiCountAtTime?: number;
  discrepancyDetected: boolean;
  discrepancyReviewed: boolean;
  exceededCapacityWarning: boolean;
  timestamp: string;
}

export interface StaffOverridePolicy {
  globalManualOverrideEnabled: boolean;
  crowdPolicy: CrowdPolicyMode;
}

export interface Bus {
  id: string; // Internal database relationship ID (e.g. bus_95x_01)
  busNumber: string; // Public passenger-facing label: e.g. "95X" or "95X (Bus #1)"
  routeId: string;
  routeName: string;
  routeNumber: string; // Actual MTC route number e.g. "95X", "555S", "21G"
  capacity: number;
  currentPassengers: number;
  crowdPercentage: number;
  crowdCategory: CrowdLevel;
  crowdDataSource?: CrowdDataSourceLabel;
  aiCrowdEstimate?: AICrowdEstimateRecord;
  staffCrowdReport?: StaffCrowdReportRecord;
  crowdDiscrepancy?: CrowdDiscrepancyRecord;
  manualOverrideEnabled?: boolean;
  vehicleUnitId?: string; // Physical vehicle registration unit (e.g. TN-01-N-9501)
  latitude: number;
  longitude: number;
  speedKmh: number;
  heading: number; // 0-360 degrees
  status: 'active' | 'maintenance' | 'out_of_service' | 'delayed';
  locationSource: LocationSource;
  lastUpdated: string;
  nextStopId: string;
  nextStopName: string;
  etaNextStopMin: number;
  acType: 'AC' | 'Non-AC' | 'Electric EV';
  driverName?: string;
  licensePlate: string;
  currentWaypointIndex?: number;
  segmentProgress?: number; // 0.0 to 1.0 along the current route segment
  dwellRemainingTicks?: number; // Ticks remaining while stopped at a designated stop
  lastServicedStopId?: string; // Identifier of the stop currently/recently serviced
}

export interface BoundingBox {
  id: string;
  label: string;
  confidence: number;
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000 or 0-1
}

export interface AIDetectionResult {
  passengerCount: number;
  capacity: number;
  crowdPercentage: number;
  crowdCategory: CrowdLevel;
  confidenceAverage: number;
  boundingBoxes: BoundingBox[];
  processingTimeMs: number;
  detectionSource: 'GEMINI_AI_VISION' | 'YOLO_FASTAPI' | 'YOLO_OPENCV_REAL' | 'DEMO_SIMULATION';
  isDemoMode: boolean;
  timestamp: string;
  imageDimensions?: { width: number; height: number };
}

export interface NextBusArrival {
  id: string;
  stopId: string;
  stopName: string;
  busId: string;
  busNumber: string;
  routeNumber: string;
  destination: string;
  estimatedArrivalMin: number;
  scheduledTime: string;
  crowdCategory: CrowdLevel;
  expectedCrowdCategory: CrowdLevel;
  crowdPercentage: number;
  distanceKm: number;
  acType: 'AC' | 'Non-AC' | 'Electric EV';
}

export interface GPSLogEntry {
  id: string;
  busId: string;
  busNumber: string;
  latitude: number;
  longitude: number;
  speedKmh: number;
  locationSource: LocationSource;
  timestamp: string;
}

export interface CrowdReport {
  id: string;
  busId: string;
  busNumber: string;
  reportedBy: string;
  crowdLevel: CrowdLevel;
  passengerEstimate: number;
  comment?: string;
  timestamp: string;
  verified: boolean;
}

export interface AppSettings {
  googleSheetsApiUrl: string;
  isSheetsConnected: boolean;
  lastSheetsSync?: string;
  googleMapsApiKey: string;
  yoloFastApiUrl: string;
  simulationSpeedMultiplier: number;
  simulationActive: boolean;
  selectedCity: string;
  crowdThresholdLow?: number; // default 30 (0-30% LOW)
  crowdThresholdMedium?: number; // default 70 (31-70% MEDIUM, 71-100% HIGH)
}

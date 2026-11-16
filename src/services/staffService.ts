import {
  Bus,
  CrowdLevel,
  CrowdPolicyMode,
  StaffCrowdAuditEntry,
  StaffMember,
  StaffOverridePolicy,
  StaffRole,
  StaffSession,
} from '../types';

const ADMIN_TOKEN_KEY = 'smartbus_admin_token';
const STAFF_SESSION_KEY = 'smartbus_staff_session';

const hasSessionStorage = () =>
  typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';

export function getAdminToken(): string | null {
  try {
    return hasSessionStorage() ? sessionStorage.getItem(ADMIN_TOKEN_KEY) : null;
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null) {
  try {
    if (!hasSessionStorage()) return;
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {}
}

export function getStoredStaffSession(): StaffSession | null {
  try {
    if (!hasSessionStorage()) return null;
    const raw = sessionStorage.getItem(STAFF_SESSION_KEY);
    return raw ? (JSON.parse(raw) as StaffSession) : null;
  } catch {
    return null;
  }
}

const staffSessionListeners = new Set<() => void>();

export function subscribeStaffSession(listener: () => void): () => void {
  staffSessionListeners.add(listener);
  return () => {
    staffSessionListeners.delete(listener);
  };
}

function notifyStaffSessionListeners() {
  staffSessionListeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

export function setStoredStaffSession(session: StaffSession | null) {
  try {
    if (hasSessionStorage()) {
      if (session) sessionStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session));
      else sessionStorage.removeItem(STAFF_SESSION_KEY);
    }
  } catch {}
  notifyStaffSessionListeners();
}

export async function syncBusesToBackend(buses: Bus[]): Promise<void> {
  if (!buses || buses.length === 0 || typeof fetch !== 'function') return;
  try {
    const payload = buses.map((b) => ({
      id: b.id,
      busNumber: b.busNumber,
      routeId: b.routeId,
      routeNumber: b.routeNumber,
      routeName: b.routeName,
      capacity: b.capacity,
    }));
    await fetch('/api/staff/buses/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buses: payload }),
    });
  } catch {
    // Non-blocking background sync
  }
}

export async function requestStaffOtp(
  staffId: string,
  role: StaffRole,
  mobileNumber: string
): Promise<{ success: boolean; maskedMobile?: string; expiresInSeconds?: number; error?: string }> {
  const res = await fetch('/api/staff/otp/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffId, role, mobileNumber }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { success: false, error: data.error || 'Failed to request OTP.' };
  }
  return data;
}

export async function submitSupportingIdentity(params: {
  staffId: string;
  role: StaffRole;
  fullName?: string;
  mobileNumber?: string;
  documentDataUrl?: string;
}): Promise<{ success: boolean; message?: string; staff?: StaffMember; error?: string }> {
  const res = await fetch('/api/staff/identity-submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    return { success: false, error: data.error || 'Identity submission failed.' };
  }
  return data;
}

export async function verifyStaffSession(params: {
  staffId: string;
  role: StaffRole;
  verificationMethod: 'admin_approved' | 'mobile_otp';
  otp?: string;
}): Promise<{
  success: boolean;
  session?: StaffSession;
  policy?: StaffOverridePolicy;
  error?: string;
}> {
  const res = await fetch('/api/staff/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    return { success: false, error: data.error || 'Verification failed.' };
  }
  const session: StaffSession = {
    token: data.token,
    staff: data.staff,
    verifiedAt: new Date().toISOString(),
  };
  setStoredStaffSession(session);
  return { success: true, session, policy: data.policy };
}

export async function validateCurrentStaffSession(token: string): Promise<{
  valid: boolean;
  staff?: StaffMember;
  policy?: StaffOverridePolicy;
  error?: string;
}> {
  const res = await fetch('/api/staff/session', {
    headers: { 'X-Staff-Token': token },
  });
  const data = await res.json();
  if (!res.ok) {
    return { valid: false, error: data.error || 'Session expired or revoked.' };
  }
  return { valid: true, staff: data.staff, policy: data.policy };
}

export async function submitManualCrowdUpdate(params: {
  busId: string;
  busNumber?: string;
  routeNumber?: string;
  capacity?: number;
  passengerCount: number;
  requestedCrowdLevel?: CrowdLevel;
  confirmOverCapacity?: boolean;
  authMode: 'staff' | 'admin';
}): Promise<{
  success: boolean;
  requiresConfirmation?: boolean;
  exceededCapacityWarning?: boolean;
  capacity?: number;
  enteredCount?: number;
  staffCrowdReport?: any;
  aiCrowdEstimate?: any;
  crowdDiscrepancy?: any;
  auditEntry?: StaffCrowdAuditEntry;
  error?: string;
}> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (params.authMode === 'admin') {
    const adminToken = getAdminToken();
    if (adminToken) headers['X-Admin-Token'] = adminToken;
  } else {
    const staffSession = getStoredStaffSession();
    if (staffSession?.token) headers['X-Staff-Token'] = staffSession.token;
  }

  const res = await fetch('/api/staff/crowd-update', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    return {
      success: false,
      requiresConfirmation: data.requiresConfirmation,
      exceededCapacityWarning: data.exceededCapacityWarning,
      capacity: data.capacity,
      enteredCount: data.enteredCount,
      error: data.error || 'Crowd update rejected by server authorization.',
    };
  }
  return data;
}

export async function recordAIEstimateOnServer(params: {
  busId: string;
  busNumber: string;
  routeNumber: string;
  passengerCount: number;
  capacity: number;
  detectionSource: string;
}): Promise<any> {
  try {
    const res = await fetch('/api/crowd/ai-estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchPublicCrowdStatus(): Promise<{
  policy?: StaffOverridePolicy;
  busOverlays?: Record<string, any>;
} | null> {
  try {
    const res = await fetch('/api/staff/crowd-status');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// --- Admin Endpoints ---
export async function fetchAdminStaffRegistry(): Promise<{
  ok: boolean;
  staff?: StaffMember[];
  policy?: StaffOverridePolicy;
  auditLogs?: StaffCrowdAuditEntry[];
  busOverrideSettings?: any[];
  error?: string;
}> {
  const token = getAdminToken();
  if (!token) return { ok: false, error: 'Admin session token missing.' };
  const res = await fetch('/api/admin/staff', {
    headers: { 'X-Admin-Token': token },
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.error || 'Unauthorized.' };
  return { ok: true, ...data };
}

export async function adminSaveStaff(payload: {
  id?: string;
  staffId: string;
  fullName: string;
  role: StaffRole;
  mobileNumber?: string;
  assignedBusId: string;
  assignedBusNumber?: string;
  assignedRouteNumber?: string;
  shiftLabel: string;
  shiftActive: boolean;
  employmentStatus: 'active' | 'inactive' | 'suspended' | 'revoked';
  verificationStatus: 'pending' | 'verified' | 'rejected';
}): Promise<{ success: boolean; staff?: StaffMember; error?: string }> {
  const token = getAdminToken();
  if (!token) return { success: false, error: 'Admin authorization required.' };
  const res = await fetch('/api/admin/staff', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': token,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error || 'Failed to save staff record.' };
  return data;
}

export async function adminUpdateStaffStatus(
  id: string,
  updates: {
    verificationStatus?: 'pending' | 'verified' | 'rejected';
    employmentStatus?: 'active' | 'inactive' | 'suspended' | 'revoked';
    shiftActive?: boolean;
    purgeDocument?: boolean;
  }
): Promise<{ success: boolean; staff?: StaffMember; error?: string }> {
  const token = getAdminToken();
  if (!token) return { success: false, error: 'Admin authorization required.' };
  const res = await fetch(`/api/admin/staff/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': token,
    },
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error || 'Status update failed.' };
  return data;
}

export async function adminIssueStaffOtp(
  id: string
): Promise<{ success: boolean; staffId?: string; dispatchCode?: string; error?: string }> {
  const token = getAdminToken();
  if (!token) return { success: false, error: 'Admin authorization required.' };
  const res = await fetch(`/api/admin/staff/${encodeURIComponent(id)}/otp-issue`, {
    method: 'POST',
    headers: { 'X-Admin-Token': token },
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error || 'Failed to issue OTP.' };
  return data;
}

export async function adminFetchSupportingDocument(
  docId: string
): Promise<{ ok: boolean; dataUrl?: string; expiresAt?: string; error?: string }> {
  const token = getAdminToken();
  if (!token) return { ok: false, error: 'Admin authorization required.' };
  const res = await fetch(`/api/admin/staff/document/${encodeURIComponent(docId)}`, {
    headers: { 'X-Admin-Token': token },
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.error || 'Document unavailable.' };
  return { ok: true, dataUrl: data.dataUrl, expiresAt: data.expiresAt };
}

export async function adminUpdateCrowdPolicy(updates: {
  globalManualOverrideEnabled?: boolean;
  crowdPolicy?: CrowdPolicyMode;
  busId?: string;
  busManualOverrideEnabled?: boolean;
  markDiscrepancyReviewedBusId?: string;
}): Promise<{ success: boolean; policy?: StaffOverridePolicy; error?: string }> {
  const token = getAdminToken();
  if (!token) return { success: false, error: 'Admin authorization required.' };
  const res = await fetch('/api/admin/crowd-policy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': token,
    },
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error || 'Policy update failed.' };
  return data;
}

export interface AdminIntegrationsSnapshot {
  googleMaps: {
    configured: boolean;
    status: 'configured' | 'client_managed' | string;
    restrictionMode: string;
    note: string;
  };
  googleRoutes: {
    configured: boolean;
    serviceEndpoint: string;
    status: 'operational' | 'degraded' | 'untested';
    lastTestedAt: string | null;
    lastSuccessfulTestAt: string | null;
    lastResult: {
      success: boolean;
      distanceMeters?: number;
      duration?: string;
      message?: string;
    } | null;
    errorCount: number;
    lastError: string | null;
  };
  googleSheets: {
    configured: boolean;
    configurationSource: string;
    status: 'connected' | 'disconnected' | 'untested';
    lastTestedAt: string | null;
    lastSuccessfulSyncAt: string | null;
    availableSheetsCount: number;
    errorCount: number;
    lastError: string | null;
  };
  systemHealth: {
    serverStatus: string;
    uptimeSeconds: number;
    totalApiErrors: number;
    lastSuccessfulConnectionAt: string;
    recentErrors: Array<{ service: string; message: string; timestamp: string }>;
    services: {
      transitRoutesDb: { available: boolean; routesCount: number; stopsCount: number };
      aiVision: { available: boolean; mode: string };
      routesApiProxy: { available: boolean };
      sheetsProxy: { available: boolean };
    };
  };
}

export async function fetchAdminIntegrationsStatus(
  clientSheetsConfigured: boolean
): Promise<{ ok: boolean; data?: AdminIntegrationsSnapshot; error?: string }> {
  const token = getAdminToken();
  if (!token) return { ok: false, error: 'Admin authorization required.' };
  const res = await fetch(
    `/api/admin/integrations/status?clientSheetsConfigured=${clientSheetsConfigured ? 'true' : 'false'}`,
    { headers: { 'X-Admin-Token': token } }
  );
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.error || 'Failed to fetch integration status.' };
  return { ok: true, data };
}

export async function adminTestRoutesIntegration(): Promise<{
  success: boolean;
  message?: string;
  distanceMeters?: number;
  duration?: string;
  testedAt?: string;
  snapshot?: AdminIntegrationsSnapshot;
  error?: string;
}> {
  const token = getAdminToken();
  if (!token) return { success: false, error: 'Admin authorization required.' };
  const res = await fetch('/api/admin/integrations/test-routes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
  });
  const data = await res.json();
  if (!res.ok && !data.snapshot) {
    return { success: false, error: data.error || data.message || 'Routes API diagnostic failed.' };
  }
  return data;
}

export async function adminTestSheetsIntegration(
  url?: string,
  mode: 'ping' | 'readWrite' = 'ping'
): Promise<{
  success: boolean;
  message?: string;
  latencyMs?: number;
  availableSheetsCount?: number;
  testedAt?: string;
  snapshot?: AdminIntegrationsSnapshot;
  error?: string;
}> {
  const token = getAdminToken();
  if (!token) return { success: false, error: 'Admin authorization required.' };
  const res = await fetch('/api/admin/integrations/test-sheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
    body: JSON.stringify({ url, mode }),
  });
  const data = await res.json();
  if (!res.ok && !data.snapshot) {
    return { success: false, error: data.error || data.message || 'Sheets diagnostic failed.' };
  }
  return data;
}

export async function adminRunAllIntegrationDiagnostics(url?: string): Promise<{
  ok: boolean;
  testedAt?: string;
  routesApi?: any;
  googleSheets?: any;
  transitDb?: any;
  snapshot?: AdminIntegrationsSnapshot;
  error?: string;
}> {
  const token = getAdminToken();
  if (!token) return { ok: false, error: 'Admin authorization required.' };
  const res = await fetch('/api/admin/integrations/test-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.error || 'Full diagnostics check failed.' };
  return { ok: true, ...data };
}

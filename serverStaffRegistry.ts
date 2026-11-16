import crypto from 'crypto';
import type { Request, Response, NextFunction, Express } from 'express';

export type StaffRole = 'driver' | 'conductor';
export type StaffVerificationStatus = 'pending' | 'verified' | 'rejected';
export type StaffEmploymentStatus = 'active' | 'inactive' | 'suspended' | 'revoked';
export type CrowdLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type CrowdPolicyMode =
  | 'AI_PRIMARY_WITH_STAFF_SUPPLEMENTARY'
  | 'AI_PRIMARY_WITH_STAFF_FALLBACK';

export interface ServerBusRecord {
  id: string;
  busNumber: string;
  routeId: string;
  routeNumber: string;
  routeName: string;
  capacity: number;
  manualOverrideEnabled: boolean;
  aiCrowdEstimate?: {
    passengerCount: number;
    capacity: number;
    crowdPercentage: number;
    crowdCategory: CrowdLevel;
    detectionSource: string;
    timestamp: string;
  };
  staffCrowdReport?: {
    passengerCount: number;
    capacity: number;
    crowdPercentage: number;
    crowdCategory: CrowdLevel;
    staffRole: 'driver' | 'conductor' | 'admin';
    sourceLabel: 'STAFF REPORTED' | 'MANUAL OVERRIDE';
    timestamp: string;
  };
  crowdDiscrepancy?: {
    hasDiscrepancy: boolean;
    aiLevel: CrowdLevel;
    staffLevel: CrowdLevel;
    deltaPassengers: number;
    reviewedByAdmin: boolean;
    reviewedAt?: string;
  };
}

interface InternalStaffRecord {
  id: string;
  staffId: string;
  fullName: string;
  role: StaffRole;
  mobileHash: string;
  mobileLast4: string;
  assignedBusId: string;
  assignedBusNumber: string;
  assignedRouteNumber: string;
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

interface SupportingDocumentEntry {
  id: string;
  staffRecordId: string;
  mimeType: string;
  dataUrl: string;
  uploadedAt: string;
  expiresAt: number;
}

interface OtpChallengeEntry {
  otpHash: string;
  salt: string;
  expiresAt: number;
  attempts: number;
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

// Ephemeral server-only HMAC signing secret (generated per process if env var is unset)
const TOKEN_SECRET = (process.env.SMARTBUS_AUTH_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');

const staffRegistry = new Map<string, InternalStaffRecord>(); // key: internal id
const staffByCode = new Map<string, string>(); // normalized staffId -> internal id
const busRegistry = new Map<string, ServerBusRecord>(); // busId -> record
const supportingDocuments = new Map<string, SupportingDocumentEntry>();
const otpChallenges = new Map<string, OtpChallengeEntry>(); // normalized staffId -> OTP
const crowdAuditLogs: StaffCrowdAuditEntry[] = [];

const crowdPolicyState: {
  globalManualOverrideEnabled: boolean;
  crowdPolicy: CrowdPolicyMode;
} = {
  globalManualOverrideEnabled: true,
  crowdPolicy: 'AI_PRIMARY_WITH_STAFF_SUPPLEMENTARY',
};

// Purge expired supporting documents automatically every 60 seconds (strict privacy retention)
setInterval(() => {
  const now = Date.now();
  supportingDocuments.forEach((doc, docId) => {
    if (now >= doc.expiresAt) {
      supportingDocuments.delete(docId);
      const staff = staffRegistry.get(doc.staffRecordId);
      if (staff && staff.pendingDocumentId === docId) {
        staff.pendingDocumentId = undefined;
        staff.hasSupportingDocument = false;
        staff.documentPurgedAt = new Date().toISOString();
      }
    }
  });
  otpChallenges.forEach((entry, code) => {
    if (now >= entry.expiresAt) {
      otpChallenges.delete(code);
    }
  });
}, 60 * 1000).unref();

function normalizeStaffId(id: string): string {
  return String(id || '').trim().toUpperCase();
}

function normalizeMobile(mobile: string): string {
  return String(mobile || '').replace(/\D/g, '').slice(-10);
}

function hashValue(val: string, salt: string): string {
  return crypto.createHash('sha256').update(`${salt}:${val}`).digest('hex');
}

function classifyCrowd(percentage: number): CrowdLevel {
  if (percentage <= 30) return 'LOW';
  if (percentage <= 70) return 'MEDIUM';
  return 'HIGH';
}

function sanitizeStaff(rec: InternalStaffRecord) {
  return {
    id: rec.id,
    staffId: rec.staffId,
    fullName: rec.fullName,
    role: rec.role,
    mobileLast4: rec.mobileLast4,
    assignedBusId: rec.assignedBusId,
    assignedBusNumber: rec.assignedBusNumber,
    assignedRouteNumber: rec.assignedRouteNumber,
    shiftLabel: rec.shiftLabel,
    shiftActive: rec.shiftActive,
    employmentStatus: rec.employmentStatus,
    verificationStatus: rec.verificationStatus,
    verificationMethod: rec.verificationMethod,
    hasSupportingDocument: rec.hasSupportingDocument,
    pendingDocumentId: rec.pendingDocumentId,
    documentPurgedAt: rec.documentPurgedAt,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

function signToken(payload: Record<string, any>, ttlSeconds: number): string {
  const fullPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken<T extends Record<string, any>>(token: string | undefined): T | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!parsed.exp || Math.floor(Date.now() / 1000) > parsed.exp) {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

export function issueAdminToken(user: { id: string; email: string; name: string; role: string }): string {
  return signToken(
    {
      type: 'admin',
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    8 * 60 * 60
  );
}

function extractBearerToken(req: Request, headerName: string): string | undefined {
  const customHeader = req.headers[headerName.toLowerCase()];
  if (typeof customHeader === 'string' && customHeader.trim()) {
    return customHeader.trim();
  }
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return undefined;
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): any {
  const token = extractBearerToken(req, 'x-admin-token');
  const decoded = verifyToken<{ type: string; id: string; email: string; name: string; role: string }>(token);
  if (!decoded || decoded.type !== 'admin' || decoded.role !== 'admin') {
    return res.status(403).json({
      error: 'Admin authorization required. Sign in as an authorized transit administrator.',
    });
  }
  (req as any).adminUser = decoded;
  next();
}

function validateLiveStaffAuthorization(
  staffInternalId: string,
  targetBusId?: string
): { ok: true; staff: InternalStaffRecord } | { ok: false; status: number; error: string } {
  const staff = staffRegistry.get(staffInternalId);
  if (!staff) {
    return { ok: false, status: 403, error: 'Staff record not found in Transit Staff Registry.' };
  }
  if (staff.employmentStatus !== 'active') {
    return {
      ok: false,
      status: 403,
      error: `Staff access denied: employment status is '${staff.employmentStatus}'.`,
    };
  }
  if (staff.verificationStatus !== 'verified') {
    return {
      ok: false,
      status: 403,
      error: `Identity verification incomplete (current status: '${staff.verificationStatus}'). Admin approval required.`,
    };
  }
  if (!staff.shiftActive) {
    return {
      ok: false,
      status: 403,
      error: 'Manual crowd update is disabled outside your active assigned shift.',
    };
  }
  if (!staff.assignedBusId) {
    return {
      ok: false,
      status: 403,
      error: 'No bus is currently assigned to your staff profile.',
    };
  }
  if (targetBusId && staff.assignedBusId !== targetBusId) {
    return {
      ok: false,
      status: 403,
      error: `Unauthorized bus modification blocked: you are only authorized for assigned bus ${staff.assignedBusNumber || staff.assignedBusId}.`,
    };
  }
  return { ok: true, staff };
}

function purgeSupportingDocument(docId?: string) {
  if (!docId) return;
  const doc = supportingDocuments.get(docId);
  supportingDocuments.delete(docId);
  if (doc) {
    const staff = staffRegistry.get(doc.staffRecordId);
    if (staff) {
      staff.pendingDocumentId = undefined;
      staff.hasSupportingDocument = false;
      staff.documentPurgedAt = new Date().toISOString();
    }
  }
}

export function upsertServerBuses(
  buses: Array<{
    id: string;
    busNumber: string;
    routeId?: string;
    routeNumber?: string;
    routeName?: string;
    capacity?: number;
    manualOverrideEnabled?: boolean;
  }>,
  allowOverrideFlagUpdate = false
) {
  buses.forEach((b) => {
    if (!b || !b.id) return;
    const existing = busRegistry.get(b.id);
    if (existing) {
      existing.busNumber = b.busNumber || existing.busNumber;
      existing.routeId = b.routeId || existing.routeId;
      existing.routeNumber = b.routeNumber || existing.routeNumber;
      existing.routeName = b.routeName || existing.routeName;
      existing.capacity = Number(b.capacity) > 0 ? Number(b.capacity) : existing.capacity;
      if (allowOverrideFlagUpdate && typeof b.manualOverrideEnabled === 'boolean') {
        existing.manualOverrideEnabled = b.manualOverrideEnabled;
      }
    } else {
      busRegistry.set(b.id, {
        id: b.id,
        busNumber: b.busNumber || b.routeNumber || b.id,
        routeId: b.routeId || '',
        routeNumber: b.routeNumber || b.busNumber || '',
        routeName: b.routeName || '',
        capacity: Number(b.capacity) > 0 ? Number(b.capacity) : 50,
        manualOverrideEnabled:
          allowOverrideFlagUpdate && typeof b.manualOverrideEnabled === 'boolean'
            ? b.manualOverrideEnabled
            : true,
      });
    }
  });
}

function computeDiscrepancy(bus: ServerBusRecord): ServerBusRecord['crowdDiscrepancy'] {
  if (!bus.aiCrowdEstimate || !bus.staffCrowdReport) return undefined;
  const ai = bus.aiCrowdEstimate;
  const st = bus.staffCrowdReport;
  const levelDiffers = ai.crowdCategory !== st.crowdCategory;
  const delta = Math.abs(ai.passengerCount - st.passengerCount);
  const threshold = Math.max(8, Math.round(bus.capacity * 0.2));
  const hasDiscrepancy = levelDiffers || delta >= threshold;
  return {
    hasDiscrepancy,
    aiLevel: ai.crowdCategory,
    staffLevel: st.crowdCategory,
    deltaPassengers: delta,
    reviewedByAdmin: false,
  };
}

export function registerStaffRoutes(
  app: Express,
  proxySheetsWrite?: (action: string, data: any) => Promise<void>
) {
  // 1. Sync eligible buses from client/Google Sheets without letting unauthenticated callers disable protections
  app.post('/api/staff/buses/sync', (req: Request, res: Response): any => {
    const incoming = Array.isArray(req.body?.buses) ? req.body.buses : [];
    if (incoming.length === 0) {
      return res.json({ success: true, count: busRegistry.size });
    }
    upsertServerBuses(incoming, false);
    return res.json({ success: true, count: busRegistry.size });
  });

  // 2. Public/Passenger-Safe Crowd Status & Policy (NO PII, NO staff names/IDs/docs/OTPs)
  app.get('/api/staff/crowd-status', (_req: Request, res: Response): any => {
    const busOverlays: Record<string, any> = {};
    busRegistry.forEach((b, id) => {
      if (
        b.aiCrowdEstimate ||
        b.staffCrowdReport ||
        b.crowdDiscrepancy ||
        b.manualOverrideEnabled === false
      ) {
        busOverlays[id] = {
          manualOverrideEnabled: b.manualOverrideEnabled,
          aiCrowdEstimate: b.aiCrowdEstimate,
          staffCrowdReport: b.staffCrowdReport,
          crowdDiscrepancy: b.crowdDiscrepancy,
        };
      }
    });
    return res.json({
      policy: crowdPolicyState,
      busOverlays,
      registeredBusCount: busRegistry.size,
    });
  });

  // 3. Record AI Estimate as PRIMARY source when AI Camera Vision runs
  app.post('/api/crowd/ai-estimate', (req: Request, res: Response): any => {
    const { busId, busNumber, routeNumber, passengerCount, capacity, detectionSource } = req.body || {};
    if (!busId || typeof passengerCount !== 'number') {
      return res.status(400).json({ error: 'busId and numeric passengerCount are required.' });
    }

    if (!busRegistry.has(busId)) {
      upsertServerBuses([
        {
          id: busId,
          busNumber: busNumber || busId,
          routeNumber: routeNumber || busNumber || '',
          capacity: Number(capacity) || 50,
        },
      ]);
    }
    const bus = busRegistry.get(busId)!;
    const cap = Math.max(10, Number(capacity) || bus.capacity || 50);
    const pax = Math.max(0, Math.round(passengerCount));
    const pct = Math.min(100, Math.round((pax / cap) * 100));
    const cat = classifyCrowd(pct);
    const nowIso = new Date().toISOString();

    bus.aiCrowdEstimate = {
      passengerCount: pax,
      capacity: cap,
      crowdPercentage: pct,
      crowdCategory: cat,
      detectionSource: detectionSource || 'AI_VISION',
      timestamp: nowIso,
    };
    bus.crowdDiscrepancy = computeDiscrepancy(bus);

    crowdAuditLogs.unshift({
      id: `aud_ai_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      busId: bus.id,
      busNumber: bus.busNumber,
      routeNumber: bus.routeNumber,
      staffId: 'AI_SYSTEM',
      staffName: 'Onboard AI Vision',
      staffRole: 'admin',
      passengerCount: pax,
      capacity: cap,
      crowdPercentage: pct,
      crowdLevel: cat,
      sourceLabel: 'AI DETECTED',
      aiLevelAtTime: cat,
      aiCountAtTime: pax,
      discrepancyDetected: !!bus.crowdDiscrepancy?.hasDiscrepancy,
      discrepancyReviewed: false,
      exceededCapacityWarning: pax > cap,
      timestamp: nowIso,
    });
    if (crowdAuditLogs.length > 300) crowdAuditLogs.pop();

    return res.json({
      success: true,
      sourceLabel: 'AI DETECTED',
      aiCrowdEstimate: bus.aiCrowdEstimate,
      crowdDiscrepancy: bus.crowdDiscrepancy,
    });
  });

  // 4. Staff Mobile OTP Request (NEVER exposes OTP in HTTP response)
  app.post('/api/staff/otp/request', (req: Request, res: Response): any => {
    const { staffId, role, mobileNumber } = req.body || {};
    const code = normalizeStaffId(staffId);
    if (!code || (role !== 'driver' && role !== 'conductor')) {
      return res.status(400).json({ error: 'Select Driver or Conductor and enter a registered Staff ID.' });
    }

    const internalId = staffByCode.get(code);
    const staff = internalId ? staffRegistry.get(internalId) : undefined;
    if (!staff || staff.role !== role) {
      return res.status(404).json({ error: 'Staff ID and selected role were not found in the Staff Registry.' });
    }

    const authCheck = validateLiveStaffAuthorization(staff.id);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    if (staff.mobileHash) {
      const cleanedMobile = normalizeMobile(mobileNumber || '');
      if (!cleanedMobile || hashValue(cleanedMobile, staff.id) !== staff.mobileHash) {
        return res.status(403).json({ error: 'Entered mobile number does not match the registered mobile on file.' });
      }
    }

    const otp = String(crypto.randomInt(100000, 999999));
    const salt = crypto.randomBytes(8).toString('hex');
    otpChallenges.set(code, {
      otpHash: hashValue(otp, salt),
      salt,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    });

    return res.json({
      success: true,
      maskedMobile: `******${staff.mobileLast4 || '****'}`,
      expiresInSeconds: 300,
      message: 'One-time verification challenge generated on server for registered mobile.',
    });
  });

  // 5. Optional Supporting ID Document Submission (NEVER grants access alone; auto-purges)
  app.post('/api/staff/identity-submit', (req: Request, res: Response): any => {
    const { staffId, role, fullName, mobileNumber, documentDataUrl } = req.body || {};
    const code = normalizeStaffId(staffId);
    if (!code || (role !== 'driver' && role !== 'conductor')) {
      return res.status(400).json({ error: 'Valid Staff ID and role (Driver or Conductor) are required.' });
    }

    let internalId = staffByCode.get(code);
    let staff = internalId ? staffRegistry.get(internalId) : undefined;
    const nowIso = new Date().toISOString();

    if (!staff) {
      if (!fullName || !String(fullName).trim()) {
        return res.status(400).json({
          error: 'Full name is required to submit a new staff verification request for Admin review.',
        });
      }
      const newInternalId = `stf_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const cleanedMobile = normalizeMobile(mobileNumber || '');
      staff = {
        id: newInternalId,
        staffId: code,
        fullName: String(fullName).trim(),
        role,
        mobileHash: cleanedMobile ? hashValue(cleanedMobile, newInternalId) : '',
        mobileLast4: cleanedMobile ? cleanedMobile.slice(-4) : '0000',
        assignedBusId: '',
        assignedBusNumber: '',
        assignedRouteNumber: '',
        shiftLabel: 'Pending Assignment',
        shiftActive: false,
        employmentStatus: 'inactive', // NEVER active until Admin confirms employment
        verificationStatus: 'pending',
        verificationMethod: 'document_assisted',
        hasSupportingDocument: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      staffRegistry.set(newInternalId, staff);
      staffByCode.set(code, newInternalId);
    } else if (staff.role !== role) {
      return res.status(403).json({ error: 'Selected role does not match existing Staff Registry profile.' });
    }

    if (documentDataUrl && typeof documentDataUrl === 'string') {
      if (!documentDataUrl.startsWith('data:image/') || documentDataUrl.length > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'Supporting ID must be an image under 5 MB.' });
      }
      if (staff.pendingDocumentId) {
        supportingDocuments.delete(staff.pendingDocumentId);
      }
      const docId = `doc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const mimeMatch = documentDataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
      supportingDocuments.set(docId, {
        id: docId,
        staffRecordId: staff.id,
        mimeType: mimeMatch?.[1] || 'image/jpeg',
        dataUrl: documentDataUrl,
        uploadedAt: nowIso,
        expiresAt: Date.now() + 15 * 60 * 1000, // Automatic 15-min retention limit
      });
      staff.pendingDocumentId = docId;
      staff.hasSupportingDocument = true;
      staff.verificationMethod = 'document_assisted';
    }

    // Document submission NEVER verifies or activates a staff member automatically
    if (staff.verificationStatus !== 'verified') {
      staff.verificationStatus = 'pending';
    }
    staff.updatedAt = nowIso;

    return res.status(202).json({
      success: true,
      pendingAdminApproval: true,
      message:
        'Identity request recorded for restricted Admin review. Supporting ID documents alone do not grant access until employment, bus assignment, and shift are approved by an Admin.',
      staff: sanitizeStaff(staff),
    });
  });

  // 6. Staff Verification & Session Token Issuance
  app.post('/api/staff/verify', (req: Request, res: Response): any => {
    const { staffId, role, verificationMethod = 'admin_approved', otp } = req.body || {};
    const code = normalizeStaffId(staffId);
    if (!code || (role !== 'driver' && role !== 'conductor')) {
      return res.status(400).json({ error: 'Please select Driver or Conductor and enter your Staff ID.' });
    }

    const internalId = staffByCode.get(code);
    const staff = internalId ? staffRegistry.get(internalId) : undefined;
    if (!staff) {
      return res.status(404).json({
        error: 'Staff ID not found in the Admin Staff Registry. Contact your Transit Administrator to register.',
      });
    }
    if (staff.role !== role) {
      return res.status(403).json({
        error: `Role mismatch: Staff ID ${code} is registered as a ${staff.role.toUpperCase()}, not ${role.toUpperCase()}.`,
      });
    }

    if (verificationMethod === 'mobile_otp') {
      const challenge = otpChallenges.get(code);
      if (!challenge || Date.now() > challenge.expiresAt) {
        return res.status(401).json({ error: 'OTP expired or not requested. Please request a new OTP.' });
      }
      if (challenge.attempts >= 5) {
        otpChallenges.delete(code);
        return res.status(429).json({ error: 'Too many invalid OTP attempts. Request a new challenge.' });
      }
      const submittedHash = hashValue(String(otp || '').trim(), challenge.salt);
      if (submittedHash !== challenge.otpHash) {
        challenge.attempts += 1;
        return res.status(401).json({ error: 'Invalid verification OTP.' });
      }
      otpChallenges.delete(code);
    }

    const authCheck = validateLiveStaffAuthorization(staff.id);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const assignedBus = busRegistry.get(staff.assignedBusId);
    const token = signToken(
      {
        type: 'staff',
        internalId: staff.id,
        staffId: staff.staffId,
        role: staff.role,
        assignedBusId: staff.assignedBusId,
      },
      6 * 60 * 60
    );

    return res.json({
      success: true,
      token,
      staff: sanitizeStaff(staff),
      assignedBus: assignedBus || null,
      policy: crowdPolicyState,
    });
  });

  // 7. Staff Session Status Check (re-validates live registry state so instant revocation takes effect immediately)
  app.get('/api/staff/session', (req: Request, res: Response): any => {
    const token = extractBearerToken(req, 'x-staff-token');
    const decoded = verifyToken<{ type: string; internalId: string }>(token);
    if (!decoded || decoded.type !== 'staff') {
      return res.status(401).json({ error: 'Invalid or expired staff session.' });
    }
    const authCheck = validateLiveStaffAuthorization(decoded.internalId);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }
    return res.json({
      success: true,
      staff: sanitizeStaff(authCheck.staff),
      assignedBus: busRegistry.get(authCheck.staff.assignedBusId) || null,
      policy: crowdPolicyState,
    });
  });

  // 8. Backend-Enforced Manual Crowd Update (Driver / Conductor / Admin)
  app.post('/api/staff/crowd-update', async (req: Request, res: Response): Promise<any> => {
    const {
      busId,
      passengerCount,
      requestedCrowdLevel,
      confirmOverCapacity = false,
      busNumber,
      routeNumber,
      capacity: clientCapacity,
    } = req.body || {};

    if (!busId || typeof passengerCount !== 'number' || isNaN(passengerCount) || passengerCount < 0) {
      return res.status(400).json({ error: 'Valid busId and non-negative passengerCount are required.' });
    }

    // Check caller auth: either Admin token OR verified Staff token
    const adminToken = extractBearerToken(req, 'x-admin-token');
    const adminDecoded = verifyToken<{ type: string; id: string; name: string; role: string }>(adminToken);

    const staffToken = extractBearerToken(req, 'x-staff-token');
    const staffDecoded = verifyToken<{ type: string; internalId: string }>(staffToken);

    let actorId = '';
    let actorName = '';
    let actorRole: 'driver' | 'conductor' | 'admin' = 'driver';
    let sourceLabel: 'STAFF REPORTED' | 'MANUAL OVERRIDE' = 'STAFF REPORTED';

    if (adminDecoded && adminDecoded.type === 'admin' && adminDecoded.role === 'admin') {
      actorId = adminDecoded.id;
      actorName = adminDecoded.name || 'Transit Admin';
      actorRole = 'admin';
      sourceLabel = 'MANUAL OVERRIDE';
    } else if (staffDecoded && staffDecoded.type === 'staff') {
      if (!crowdPolicyState.globalManualOverrideEnabled) {
        return res.status(403).json({
          error: 'Manual crowd override is currently disabled globally by the Transit Administrator.',
        });
      }
      const authCheck = validateLiveStaffAuthorization(staffDecoded.internalId, busId);
      if (!authCheck.ok) {
        return res.status(authCheck.status).json({ error: authCheck.error });
      }
      actorId = authCheck.staff.staffId;
      actorName = authCheck.staff.fullName;
      actorRole = authCheck.staff.role;
      sourceLabel = 'STAFF REPORTED';
    } else {
      return res.status(401).json({
        error: 'Unauthorized: Verified Driver, Conductor, or Admin credentials are required.',
      });
    }

    // Ensure bus exists in registry (all existing & newly added buses supported)
    if (!busRegistry.has(busId)) {
      upsertServerBuses([
        {
          id: busId,
          busNumber: busNumber || busId,
          routeNumber: routeNumber || busNumber || '',
          capacity: Number(clientCapacity) || 50,
        },
      ]);
    }
    const bus = busRegistry.get(busId)!;

    if (actorRole !== 'admin' && bus.manualOverrideEnabled === false) {
      return res.status(403).json({
        error: `Manual crowd override is disabled for bus ${bus.busNumber} by an administrator.`,
      });
    }

    const cap = Math.max(10, bus.capacity || Number(clientCapacity) || 50);
    const pax = Math.round(passengerCount);
    const exceededCapacity = pax > cap;

    if (exceededCapacity && !confirmOverCapacity) {
      return res.status(422).json({
        requiresConfirmation: true,
        exceededCapacityWarning: true,
        capacity: cap,
        enteredCount: pax,
        error: `Entered passenger count (${pax}) exceeds bus capacity (${cap} seats). Review count or confirm standing/crush load.`,
      });
    }

    const pct = Math.min(100, Math.round((pax / cap) * 100));
    const computedCat = classifyCrowd(pct);
    const finalCat: CrowdLevel =
      requestedCrowdLevel === 'LOW' || requestedCrowdLevel === 'MEDIUM' || requestedCrowdLevel === 'HIGH'
        ? requestedCrowdLevel
        : computedCat;

    const nowIso = new Date().toISOString();
    bus.staffCrowdReport = {
      passengerCount: pax,
      capacity: cap,
      crowdPercentage: pct,
      crowdCategory: finalCat,
      staffRole: actorRole,
      sourceLabel,
      timestamp: nowIso,
    };

    // Preserve AI estimate completely untouched; compute discrepancy if AI estimate exists
    bus.crowdDiscrepancy = computeDiscrepancy(bus);

    const auditEntry: StaffCrowdAuditEntry = {
      id: `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      busId: bus.id,
      busNumber: bus.busNumber,
      routeNumber: bus.routeNumber,
      staffId: actorId,
      staffName: actorName,
      staffRole: actorRole,
      passengerCount: pax,
      capacity: cap,
      crowdPercentage: pct,
      crowdLevel: finalCat,
      sourceLabel,
      aiLevelAtTime: bus.aiCrowdEstimate?.crowdCategory,
      aiCountAtTime: bus.aiCrowdEstimate?.passengerCount,
      discrepancyDetected: !!bus.crowdDiscrepancy?.hasDiscrepancy,
      discrepancyReviewed: false,
      exceededCapacityWarning: exceededCapacity,
      timestamp: nowIso,
    };
    crowdAuditLogs.unshift(auditEntry);
    if (crowdAuditLogs.length > 300) crowdAuditLogs.pop();

    // Non-destructive mirror to Google Sheets Crowd_Reports / Staff_Crowd_Logs if configured
    if (proxySheetsWrite) {
      void proxySheetsWrite('reportCrowd', {
        id: auditEntry.id,
        busId: bus.id,
        reportedBy: `${actorRole}:${actorId}`,
        crowdLevel: finalCat,
        comment: `${sourceLabel} (${pax}/${cap})`,
      });
    }

    return res.json({
      success: true,
      exceededCapacityWarning: exceededCapacity,
      staffCrowdReport: bus.staffCrowdReport,
      aiCrowdEstimate: bus.aiCrowdEstimate || null,
      crowdDiscrepancy: bus.crowdDiscrepancy || null,
      auditEntry,
      policy: crowdPolicyState,
    });
  });

  // =========================================================================
  // ADMIN-ONLY STAFF & CROWD GOVERNANCE ENDPOINTS
  // =========================================================================
  app.get('/api/admin/staff', requireAdminAuth, (_req: Request, res: Response): any => {
    const list = Array.from(staffRegistry.values()).map(sanitizeStaff);
    return res.json({
      staff: list,
      policy: crowdPolicyState,
      auditLogs: crowdAuditLogs,
      busOverrideSettings: Array.from(busRegistry.values())
        .filter((b) => b.manualOverrideEnabled === false || b.crowdDiscrepancy?.hasDiscrepancy)
        .map((b) => ({
          busId: b.id,
          busNumber: b.busNumber,
          manualOverrideEnabled: b.manualOverrideEnabled,
          crowdDiscrepancy: b.crowdDiscrepancy,
        })),
    });
  });

  app.post('/api/admin/staff', requireAdminAuth, (req: Request, res: Response): any => {
    const {
      id,
      staffId,
      fullName,
      role,
      mobileNumber,
      assignedBusId,
      assignedBusNumber,
      assignedRouteNumber,
      shiftLabel = 'Morning (05:30 - 13:30)',
      shiftActive = true,
      employmentStatus = 'active',
      verificationStatus = 'verified',
    } = req.body || {};

    const code = normalizeStaffId(staffId);
    if (!code || !fullName || (role !== 'driver' && role !== 'conductor')) {
      return res.status(400).json({ error: 'staffId, fullName, and role (driver or conductor) are required.' });
    }

    const nowIso = new Date().toISOString();
    const existingById = id ? staffRegistry.get(id) : undefined;
    const existingCodeOwnerId = staffByCode.get(code);
    const existing = existingById || (existingCodeOwnerId ? staffRegistry.get(existingCodeOwnerId) : undefined);

    if (assignedBusId && !busRegistry.has(assignedBusId)) {
      upsertServerBuses([
        {
          id: assignedBusId,
          busNumber: assignedBusNumber || assignedBusId,
          routeNumber: assignedRouteNumber || '',
        },
      ]);
    }
    const assignedBus = assignedBusId ? busRegistry.get(assignedBusId) : undefined;

    if (existing) {
      if (existing.staffId !== code && staffByCode.has(code)) {
        return res.status(400).json({ error: `Staff ID ${code} is already assigned to another record.` });
      }
      staffByCode.delete(existing.staffId);
      existing.staffId = code;
      staffByCode.set(code, existing.id);

      existing.fullName = String(fullName).trim();
      existing.role = role;
      if (mobileNumber && normalizeMobile(mobileNumber)) {
        const cleaned = normalizeMobile(mobileNumber);
        existing.mobileHash = hashValue(cleaned, existing.id);
        existing.mobileLast4 = cleaned.slice(-4);
      }
      existing.assignedBusId = assignedBusId || '';
      existing.assignedBusNumber = assignedBus?.busNumber || assignedBusNumber || '';
      existing.assignedRouteNumber = assignedBus?.routeNumber || assignedRouteNumber || '';
      existing.shiftLabel = shiftLabel;
      existing.shiftActive = Boolean(shiftActive);
      existing.employmentStatus = employmentStatus;
      existing.verificationStatus = verificationStatus;
      existing.updatedAt = nowIso;

      if (verificationStatus === 'verified' || verificationStatus === 'rejected') {
        purgeSupportingDocument(existing.pendingDocumentId);
      }

      return res.json({ success: true, staff: sanitizeStaff(existing) });
    }

    const internalId = `stf_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const cleaned = normalizeMobile(mobileNumber || '');
    const record: InternalStaffRecord = {
      id: internalId,
      staffId: code,
      fullName: String(fullName).trim(),
      role,
      mobileHash: cleaned ? hashValue(cleaned, internalId) : '',
      mobileLast4: cleaned ? cleaned.slice(-4) : '0000',
      assignedBusId: assignedBusId || '',
      assignedBusNumber: assignedBus?.busNumber || assignedBusNumber || '',
      assignedRouteNumber: assignedBus?.routeNumber || assignedRouteNumber || '',
      shiftLabel,
      shiftActive: Boolean(shiftActive),
      employmentStatus,
      verificationStatus,
      verificationMethod: 'admin_approved',
      hasSupportingDocument: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    staffRegistry.set(internalId, record);
    staffByCode.set(code, internalId);

    return res.status(201).json({ success: true, staff: sanitizeStaff(record) });
  });

  app.post('/api/admin/staff/:id/status', requireAdminAuth, (req: Request, res: Response): any => {
    const staff = staffRegistry.get(req.params.id);
    if (!staff) {
      return res.status(404).json({ error: 'Staff record not found.' });
    }
    const { verificationStatus, employmentStatus, shiftActive, purgeDocument } = req.body || {};
    if (
      verificationStatus === 'pending' ||
      verificationStatus === 'verified' ||
      verificationStatus === 'rejected'
    ) {
      staff.verificationStatus = verificationStatus;
      if (verificationStatus === 'verified' || verificationStatus === 'rejected') {
        purgeSupportingDocument(staff.pendingDocumentId);
      }
    }
    if (
      employmentStatus === 'active' ||
      employmentStatus === 'inactive' ||
      employmentStatus === 'suspended' ||
      employmentStatus === 'revoked'
    ) {
      staff.employmentStatus = employmentStatus;
    }
    if (typeof shiftActive === 'boolean') {
      staff.shiftActive = shiftActive;
    }
    if (purgeDocument) {
      purgeSupportingDocument(staff.pendingDocumentId);
    }
    staff.updatedAt = new Date().toISOString();
    return res.json({ success: true, staff: sanitizeStaff(staff) });
  });

  // Admin-only single-use OTP issuance for staff onboarding when SMS gateway is offline
  app.post('/api/admin/staff/:id/otp-issue', requireAdminAuth, (req: Request, res: Response): any => {
    const staff = staffRegistry.get(req.params.id);
    if (!staff) {
      return res.status(404).json({ error: 'Staff record not found.' });
    }
    const otp = String(crypto.randomInt(100000, 999999));
    const salt = crypto.randomBytes(8).toString('hex');
    otpChallenges.set(staff.staffId, {
      otpHash: hashValue(otp, salt),
      salt,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    });
    return res.json({
      success: true,
      staffId: staff.staffId,
      dispatchCode: otp,
      expiresInSeconds: 300,
    });
  });

  // Restricted Admin-only supporting document viewer (never accessible without admin token)
  app.get('/api/admin/staff/document/:docId', requireAdminAuth, (req: Request, res: Response): any => {
    const doc = supportingDocuments.get(req.params.docId);
    if (!doc) {
      return res.status(404).json({ error: 'Supporting document expired or already purged.' });
    }
    return res.json({
      id: doc.id,
      mimeType: doc.mimeType,
      dataUrl: doc.dataUrl,
      uploadedAt: doc.uploadedAt,
      expiresAt: new Date(doc.expiresAt).toISOString(),
    });
  });

  // Admin Global & Per-Bus Manual Crowd Override Policy + Discrepancy Review
  app.post('/api/admin/crowd-policy', requireAdminAuth, (req: Request, res: Response): any => {
    const { globalManualOverrideEnabled, crowdPolicy, busId, busManualOverrideEnabled, markDiscrepancyReviewedBusId } =
      req.body || {};

    if (typeof globalManualOverrideEnabled === 'boolean') {
      crowdPolicyState.globalManualOverrideEnabled = globalManualOverrideEnabled;
    }
    if (
      crowdPolicy === 'AI_PRIMARY_WITH_STAFF_SUPPLEMENTARY' ||
      crowdPolicy === 'AI_PRIMARY_WITH_STAFF_FALLBACK'
    ) {
      crowdPolicyState.crowdPolicy = crowdPolicy;
    }
    if (busId && typeof busManualOverrideEnabled === 'boolean') {
      if (!busRegistry.has(busId)) {
        upsertServerBuses([{ id: busId, busNumber: busId, manualOverrideEnabled: busManualOverrideEnabled }], true);
      } else {
        busRegistry.get(busId)!.manualOverrideEnabled = busManualOverrideEnabled;
      }
    }
    if (markDiscrepancyReviewedBusId) {
      const bus = busRegistry.get(markDiscrepancyReviewedBusId);
      if (bus?.crowdDiscrepancy) {
        bus.crowdDiscrepancy.reviewedByAdmin = true;
        bus.crowdDiscrepancy.reviewedAt = new Date().toISOString();
      }
      crowdAuditLogs.forEach((a) => {
        if (a.busId === markDiscrepancyReviewedBusId && a.discrepancyDetected) {
          a.discrepancyReviewed = true;
        }
      });
    }

    return res.json({
      success: true,
      policy: crowdPolicyState,
    });
  });
}

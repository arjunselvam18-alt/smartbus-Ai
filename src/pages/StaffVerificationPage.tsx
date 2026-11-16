import React, { useState, useEffect } from 'react';
import { Bus, CrowdLevel, StaffOverridePolicy, StaffRole, StaffSession } from '../types';
import { CrowdBadge } from '../components/common/CrowdBadge';
import { CrowdSourceDetails } from '../components/common/CrowdSourceDetails';
import {
  getStoredStaffSession,
  requestStaffOtp,
  setStoredStaffSession,
  submitManualCrowdUpdate,
  submitSupportingIdentity,
  validateCurrentStaffSession,
  verifyStaffSession,
} from '../services/staffService';
import { storageService } from '../services/storage';
import {
  BadgeCheck,
  Bus as BusIcon,
  ShieldCheck,
  Smartphone,
  Upload,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  LogOut,
  Lock,
  Cpu,
  Sliders,
  FileWarning,
} from 'lucide-react';

interface StaffVerificationPageProps {
  buses: Bus[];
  onNavigate: (page: string) => void;
}

export const StaffVerificationPage: React.FC<StaffVerificationPageProps> = ({
  buses,
  onNavigate,
}) => {
  const [role, setRole] = useState<StaffRole>('driver');
  const [staffId, setStaffId] = useState('');
  const [verificationMode, setVerificationMode] = useState<'admin_approved' | 'mobile_otp' | 'supporting_id'>('admin_approved');
  const [mobileNumber, setMobileNumber] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpChallengeSent, setOtpChallengeSent] = useState(false);
  const [maskedMobile, setMaskedMobile] = useState('');

  // Optional Supporting Document upload (for pending admin review only)
  const [fullName, setFullName] = useState('');
  const [docPreviewName, setDocPreviewName] = useState<string>('');
  const [docDataUrl, setDocDataUrl] = useState<string>('');

  // Active Verified Staff Session
  const [session, setSession] = useState<StaffSession | null>(() => getStoredStaffSession());
  const [policy, setPolicy] = useState<StaffOverridePolicy>({
    globalManualOverrideEnabled: true,
    crowdPolicy: 'AI_PRIMARY_WITH_STAFF_SUPPLEMENTARY',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  // Manual Crowd Update Inputs
  const assignedBus = session
    ? buses.find((b) => b.id === session.staff.assignedBusId) ||
      storageService.getBusById(session.staff.assignedBusId)
    : undefined;

  const [passengerCount, setPassengerCount] = useState<number>(assignedBus?.currentPassengers || 0);
  const [selectedCrowdLevel, setSelectedCrowdLevel] = useState<'AUTO' | CrowdLevel>('AUTO');
  const [overCapacityWarning, setOverCapacityWarning] = useState<string | null>(null);
  const [confirmOverCapacity, setConfirmOverCapacity] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Validate existing staff token against live backend registry on mount (enforces instant revocation)
  useEffect(() => {
    let active = true;
    const existing = getStoredStaffSession();
    if (!existing?.token) return;
    validateCurrentStaffSession(existing.token).then((res) => {
      if (!active) return;
      if (res.valid && res.staff) {
        const refreshed: StaffSession = { ...existing, staff: res.staff };
        setStoredStaffSession(refreshed);
        setSession(refreshed);
        if (res.policy) setPolicy(res.policy);
      } else {
        setStoredStaffSession(null);
        setSession(null);
        if (res.error) setAuthError(res.error);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (assignedBus) {
      setPassengerCount(
        assignedBus.staffCrowdReport?.passengerCount ?? assignedBus.currentPassengers ?? 0
      );
    }
  }, [assignedBus?.id]);

  const handleRequestOtp = async () => {
    setAuthError(null);
    setAuthNotice(null);
    setIsLoading(true);
    try {
      const res = await requestStaffOtp(staffId, role, mobileNumber);
      if (!res.success) {
        setAuthError(res.error || 'OTP request failed.');
      } else {
        setOtpChallengeSent(true);
        setMaskedMobile(res.maskedMobile || 'registered mobile');
        setAuthNotice(
          `One-time verification challenge issued for ${res.maskedMobile}. Obtain the code from your Transit Dispatch / SMS and enter it below.`
        );
      }
    } catch (e: any) {
      setAuthError(e.message || 'Network error requesting OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setAuthError('Document image must be under 4 MB.');
      return;
    }
    setDocPreviewName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setDocDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitSupportingDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);
    setIsLoading(true);
    try {
      const res = await submitSupportingIdentity({
        staffId,
        role,
        fullName,
        mobileNumber,
        documentDataUrl: docDataUrl || undefined,
      });
      if (!res.success) {
        setAuthError(res.error || 'Submission failed.');
      } else {
        setAuthNotice(
          res.message ||
            'Submitted for Admin verification. Supporting ID alone does not grant access until approved by an Admin.'
        );
        setDocDataUrl('');
        setDocPreviewName('');
      }
    } catch (e: any) {
      setAuthError(e.message || 'Submission failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);
    setIsLoading(true);
    try {
      const res = await verifyStaffSession({
        staffId,
        role,
        verificationMethod: verificationMode === 'mobile_otp' ? 'mobile_otp' : 'admin_approved',
        otp: verificationMode === 'mobile_otp' ? otpInput : undefined,
      });
      if (!res.success || !res.session) {
        setAuthError(res.error || 'Staff verification rejected.');
      } else {
        setSession(res.session);
        if (res.policy) setPolicy(res.policy);
        setOtpInput('');
        setOtpChallengeSent(false);
      }
    } catch (e: any) {
      setAuthError(e.message || 'Verification failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOutStaff = () => {
    setStoredStaffSession(null);
    setSession(null);
    setUpdateSuccess(null);
    setUpdateError(null);
    setOverCapacityWarning(null);
    setConfirmOverCapacity(false);
  };

  const handleSubmitCrowdUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !assignedBus) return;
    setUpdateError(null);
    setUpdateSuccess(null);

    const capacity = assignedBus.capacity || 50;
    if (passengerCount > capacity && !confirmOverCapacity) {
      setOverCapacityWarning(
        `Warning: Entered count (${passengerCount}) exceeds vehicle capacity (${capacity} seats). Confirm standing/crush load to proceed.`
      );
      return;
    }

    setIsLoading(true);
    try {
      const res = await submitManualCrowdUpdate({
        busId: assignedBus.id,
        busNumber: assignedBus.busNumber,
        routeNumber: assignedBus.routeNumber,
        capacity,
        passengerCount,
        requestedCrowdLevel: selectedCrowdLevel === 'AUTO' ? undefined : selectedCrowdLevel,
        confirmOverCapacity,
        authMode: 'staff',
      });

      if (!res.success) {
        if (res.requiresConfirmation) {
          setOverCapacityWarning(res.error || 'Count exceeds vehicle capacity.');
        } else {
          setUpdateError(res.error || 'Update denied by backend authorization.');
          // Re-check session in case access was revoked by Admin
          const check = await validateCurrentStaffSession(session.token);
          if (!check.valid) {
            handleSignOutStaff();
            setAuthError(check.error || 'Staff authorization revoked.');
          }
        }
        return;
      }

      storageService.applyStaffCrowdOverlay(assignedBus.id, {
        staffCrowdReport: res.staffCrowdReport,
        aiCrowdEstimate: res.aiCrowdEstimate,
        crowdDiscrepancy: res.crowdDiscrepancy,
      });

      setOverCapacityWarning(null);
      setConfirmOverCapacity(false);
      setUpdateSuccess(
        `Staff crowd report recorded at ${new Date(
          res.staffCrowdReport.timestamp
        ).toLocaleTimeString()}. AI Vision remains the primary estimator.`
      );
    } catch (err: any) {
      setUpdateError(err.message || 'Failed to submit manual crowd update.');
    } finally {
      setIsLoading(false);
    }
  };

  const capacity = assignedBus?.capacity || 50;
  const computedPct = Math.min(100, Math.round((Math.max(0, passengerCount) / capacity) * 100));
  const computedLevel: CrowdLevel =
    selectedCrowdLevel !== 'AUTO'
      ? selectedCrowdLevel
      : computedPct <= 30
      ? 'LOW'
      : computedPct <= 70
      ? 'MEDIUM'
      : 'HIGH';

  return (
    <div className="space-y-6">
      {/* Institutional Transit Staff Header */}
      <div className="p-5 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-700/60">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-2 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
            <BadgeCheck className="w-3.5 h-3.5" />
            <span>Official Transit Crew Authorization</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            Verified Driver & Conductor Manual Crowd Portal
          </h1>
          <p className="mt-1 text-xs text-slate-300 max-w-2xl leading-relaxed">
            Optional crew crowd reporting for verified on-duty staff. AI Camera Vision remains the primary crowd estimation system; verified staff reports provide labelled supplementary & fallback telemetry.
          </p>
        </div>

        <button
          onClick={() => onNavigate('vision')}
          className="self-start md:self-auto px-4 py-2 text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-700 rounded-xl flex items-center gap-2 shadow-md transition-all shrink-0"
        >
          <Cpu className="w-4 h-4" />
          <span>Primary AI Vision Module</span>
        </button>
      </div>

      {/* Primary AI Policy Notice */}
      <div className="p-4 bg-cyan-50/80 border border-cyan-200 rounded-2xl flex items-start gap-3 text-xs text-cyan-900">
        <Cpu className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
        <div>
          <strong className="font-bold block">AI-First Crowd Policy Active:</strong>
          <span>
            AI Vision (<code className="font-mono font-bold">AI DETECTED</code>) is always the primary estimation source and is never overwritten by manual entries. Manual updates require verified active staff credentials, an active shift, and match only your assigned bus.
          </span>
        </div>
      </div>

      {!session ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Official Transit ID Card Reference Preview (7 Cols) */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <span>Step 1–3: Staff Identity Verification</span>
              </h2>
              <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                Registry Enforced
              </span>
            </div>

            {/* Step 1: Role Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                1. Select Assigned Duty Role
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { id: 'driver', title: 'Bus Driver', sub: 'Steering & Cockpit Duty' },
                    { id: 'conductor', title: 'Bus Conductor', sub: 'Ticketing & Cabin Crowd' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setRole(item.id);
                      setAuthError(null);
                    }}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      role === item.id
                        ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-extrabold text-slate-900">{item.title}</span>
                      <UserCheck
                        className={`w-4 h-4 ${
                          role === item.id ? 'text-blue-600' : 'text-slate-400'
                        }`}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{item.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Verification Method Tabs */}
            <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setVerificationMode('admin_approved');
                  setAuthError(null);
                  setAuthNotice(null);
                }}
                className={`flex-1 py-2 px-3 rounded-lg transition-all cursor-pointer ${
                  verificationMode === 'admin_approved'
                    ? 'bg-white text-blue-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Admin-Approved ID
              </button>
              <button
                type="button"
                onClick={() => {
                  setVerificationMode('mobile_otp');
                  setAuthError(null);
                  setAuthNotice(null);
                }}
                className={`flex-1 py-2 px-3 rounded-lg transition-all cursor-pointer ${
                  verificationMode === 'mobile_otp'
                    ? 'bg-white text-blue-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Registered Mobile OTP
              </button>
              <button
                type="button"
                onClick={() => {
                  setVerificationMode('supporting_id');
                  setAuthError(null);
                  setAuthNotice(null);
                }}
                className={`flex-1 py-2 px-3 rounded-lg transition-all cursor-pointer ${
                  verificationMode === 'supporting_id'
                    ? 'bg-white text-blue-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Submit Supporting ID
              </button>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {authNotice && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authNotice}</span>
              </div>
            )}

            {verificationMode !== 'supporting_id' ? (
              <form onSubmit={handleVerifyStaff} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    2. Registered Staff ID
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter Admin-registered Staff ID (e.g. MTC-DRV-101)"
                    value={staffId}
                    onChange={(e) => setStaffId(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2.5 text-sm font-mono uppercase bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {verificationMode === 'mobile_otp' && (
                  <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        3. Registered Mobile Number (10 digits)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="tel"
                          required
                          placeholder="Registered 10-digit mobile"
                          value={mobileNumber}
                          onChange={(e) => setMobileNumber(e.target.value)}
                          className="flex-1 px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-xl"
                        />
                        <button
                          type="button"
                          onClick={handleRequestOtp}
                          disabled={isLoading || !staffId}
                          className="px-3.5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl shrink-0 disabled:opacity-50 cursor-pointer"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Smartphone className="w-3.5 h-3.5" />
                            <span>{otpChallengeSent ? 'Resend OTP' : 'Send OTP'}</span>
                          </span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Enter 6-Digit Verification OTP {maskedMobile ? `(${maskedMobile})` : ''}
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        placeholder="6-digit OTP"
                        value={otpInput}
                        onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-3 py-2 text-sm font-mono tracking-widest bg-white border border-slate-300 rounded-xl"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || !staffId}
                  className="w-full py-2.5 px-4 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {isLoading
                      ? 'Verifying Registry & Active Shift...'
                      : 'Verify Employment, Bus Assignment & Unlock Controls'}
                  </span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleSubmitSupportingDoc} className="space-y-4">
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-2">
                  <FileWarning className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Strict Verification Rule:</strong> Uploading a Driving Licence or ID card is optional and assists Admin onboarding only. An uploaded document alone never grants staff access; an Admin must confirm employment, bus assignment, and active shift. Documents are auto-purged after review (max 15 min retention).
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Staff ID</label>
                    <input
                      type="text"
                      required
                      placeholder="Desired / Assigned Staff ID"
                      value={staffId}
                      onChange={(e) => setStaffId(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 text-xs font-mono uppercase bg-slate-50 border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Official staff name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Registered Mobile Number
                  </label>
                  <input
                    type="tel"
                    placeholder="10-digit mobile for OTP verification"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Optional Supporting ID / Driving Licence Image (Admin Review Only)
                  </label>
                  <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer text-xs text-slate-600">
                    <Upload className="w-4 h-4 text-blue-600" />
                    <span>{docPreviewName || 'Select ID image (restricted access, auto-purged)'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !staffId || !fullName}
                  className="w-full py-2.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  <span>Submit for Admin Verification</span>
                </button>
              </form>
            )}
          </div>

          {/* Right: Smart Transit Staff Credential Card Design (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-2xl overflow-hidden border border-slate-300 shadow-lg bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100">
              {/* Official Card Top Strip (Driving Licence inspired structured header) */}
              <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 px-5 py-3 text-white flex items-center justify-between border-b-2 border-amber-400">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4 text-amber-300" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest uppercase text-amber-300">
                      Metropolitan Transit Authority
                    </p>
                    <p className="text-xs font-extrabold tracking-tight">
                      CREW AUTHORIZATION SMART CARD
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-white/10 rounded border border-white/20 uppercase">
                  {role}
                </span>
              </div>

              {/* Card Body */}
              <div className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  {/* Smart Chip Visual */}
                  <div className="w-11 h-8 rounded-md bg-gradient-to-br from-amber-200 via-amber-300 to-amber-500 border border-amber-600/40 shadow-inner flex items-center justify-center">
                    <div className="w-6 h-4 border border-amber-700/40 rounded-xs grid grid-cols-2 gap-px p-0.5">
                      <span className="border-r border-amber-700/30" />
                      <span />
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-[10px] text-slate-400 uppercase block">Staff ID</span>
                    <strong className="text-sm font-extrabold text-slate-900">
                      {staffId || 'PENDING ENTRY'}
                    </strong>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 p-3 bg-white/90 rounded-xl border border-slate-200 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Duty Role
                    </span>
                    <strong className="text-slate-800 uppercase">{role}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Verification
                    </span>
                    <strong className="text-amber-700 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>Required</span>
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Shift & Bus Binding
                    </span>
                    <span className="text-slate-600 font-medium">Checked on Backend</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Privacy Shield
                    </span>
                    <span className="text-emerald-700 font-semibold">No Public PII</span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Authorized staff credentials are managed in Admin Operations → Staff Registry. Passengers never see driver names, licence numbers, DOBs, mobile numbers, or document images.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* VERIFIED STAFF WORKSPACE */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Verified Official Staff Credential Card & Assignment Lock (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-2xl overflow-hidden border border-emerald-300 shadow-md bg-white">
              <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 px-5 py-3.5 text-white flex items-center justify-between border-b-2 border-emerald-400">
                <div className="flex items-center gap-2.5">
                  <BadgeCheck className="w-5 h-5 text-emerald-300" />
                  <div>
                    <p className="text-[10px] font-bold tracking-widest uppercase text-emerald-300">
                      Authorized Transit Crew
                    </p>
                    <p className="text-sm font-extrabold">{session.staff.fullName}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSignOutStaff}
                  className="px-2.5 py-1 text-[11px] font-bold bg-white/10 hover:bg-white/20 rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <LogOut className="w-3 h-3" />
                  <span>End Session</span>
                </button>
              </div>

              <div className="p-5 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Staff ID
                    </span>
                    <strong className="font-mono text-slate-900">{session.staff.staffId}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Verified Role
                    </span>
                    <strong className="uppercase text-blue-700">{session.staff.role}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Assigned Bus
                    </span>
                    <strong className="font-mono text-slate-900">
                      {assignedBus?.busNumber || session.staff.assignedBusNumber || session.staff.assignedBusId}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Active Shift
                    </span>
                    <strong className="text-emerald-700">{session.staff.shiftLabel}</strong>
                  </div>
                </div>

                {assignedBus && (
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        <BusIcon className="w-4 h-4 text-blue-600" />
                        <span>Live Bus Telemetry ({assignedBus.busNumber})</span>
                      </span>
                      <CrowdBadge
                        level={assignedBus.crowdCategory}
                        percentage={assignedBus.crowdPercentage}
                        size="sm"
                      />
                    </div>
                    <CrowdSourceDetails bus={assignedBus} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Optional Manual Crowd Update Controls for Assigned Bus Only (7 Cols) */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-blue-600" />
                  <span>Optional Manual Crowd Update (Assigned Bus Only)</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Updates are strictly bound to bus{' '}
                  <strong>{assignedBus?.busNumber || session.staff.assignedBusNumber}</strong> and logged to the audit trail.
                </p>
              </div>
              <span className="px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                STAFF REPORTED
              </span>
            </div>

            {!policy.globalManualOverrideEnabled || assignedBus?.manualOverrideEnabled === false ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0" />
                <span>
                  Manual crowd overrides are currently disabled by the Transit Administrator. AI Vision continues operating normally.
                </span>
              </div>
            ) : (
              <form onSubmit={handleSubmitCrowdUpdate} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Vehicle Capacity
                    </span>
                    <strong className="text-sm font-mono text-slate-900">{capacity} pax</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Calculated Occupancy
                    </span>
                    <strong className="text-sm font-mono text-blue-700">{computedPct}%</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Crowd Category
                    </span>
                    <CrowdBadge level={computedLevel} percentage={computedPct} size="sm" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">
                    Current Onboard Passenger Count
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setPassengerCount((c) => Math.max(0, c - 1));
                        setOverCapacityWarning(null);
                        setConfirmOverCapacity(false);
                      }}
                      className="px-3.5 py-2 text-sm font-bold bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={150}
                      value={passengerCount}
                      onChange={(e) => {
                        setPassengerCount(Math.max(0, parseInt(e.target.value, 10) || 0));
                        setOverCapacityWarning(null);
                        setConfirmOverCapacity(false);
                      }}
                      className="w-28 px-3 py-2 text-center text-base font-mono font-extrabold bg-white border border-slate-300 rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setPassengerCount((c) => Math.min(150, c + 1));
                        setOverCapacityWarning(null);
                        setConfirmOverCapacity(false);
                      }}
                      className="px-3.5 py-2 text-sm font-bold bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Crowd Level Assessment (Optional Override)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(['AUTO', 'LOW', 'MEDIUM', 'HIGH'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setSelectedCrowdLevel(lvl)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                          selectedCrowdLevel === lvl
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {lvl === 'AUTO' ? 'Auto from Count' : lvl}
                      </button>
                    ))}
                  </div>
                </div>

                {overCapacityWarning && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2">
                    <div className="flex items-start gap-2 font-semibold">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>{overCapacityWarning}</span>
                    </div>
                    <label className="flex items-center gap-2 font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmOverCapacity}
                        onChange={(e) => setConfirmOverCapacity(e.target.checked)}
                      />
                      <span>Confirm standing/over-capacity load ({passengerCount} &gt; {capacity})</span>
                    </label>
                  </div>
                )}

                {updateError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{updateError}</span>
                  </div>
                )}

                {updateSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{updateSuccess}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isLoading ? 'Submitting Authorized Report...' : 'Submit Optional Staff Crowd Report'}</span>
                </button>
              </form>
            )}

            {/* Last Submitted Staff Update */}
            {assignedBus?.staffCrowdReport && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 block">Last Submitted Staff Report</span>
                  <span className="text-slate-500">
                    {assignedBus.staffCrowdReport.passengerCount}/{assignedBus.staffCrowdReport.capacity} passengers ({assignedBus.staffCrowdReport.crowdCategory}) •{' '}
                    <span className="font-mono">{assignedBus.staffCrowdReport.sourceLabel}</span>
                  </span>
                </div>
                <span className="font-mono text-slate-500 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(assignedBus.staffCrowdReport.timestamp).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import {
  Bus,
  CrowdPolicyMode,
  StaffCrowdAuditEntry,
  StaffMember,
  StaffOverridePolicy,
  StaffRole,
} from '../../types';
import {
  adminFetchSupportingDocument,
  adminIssueStaffOtp,
  adminSaveStaff,
  adminUpdateCrowdPolicy,
  adminUpdateStaffStatus,
  fetchAdminStaffRegistry,
  getAdminToken,
  setAdminToken,
  submitManualCrowdUpdate,
} from '../../services/staffService';
import { storageService } from '../../services/storage';
import { AdminAuthGate } from './AdminAuthGate';
import {
  BadgeCheck,
  ShieldAlert,
  UserPlus,
  Lock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  Trash2,
  Clock,
  KeyRound,
  Search,
  Sliders,
  RefreshCw,
} from 'lucide-react';

interface AdminStaffControlPanelProps {
  allBuses: Bus[];
}

export const AdminStaffControlPanel: React.FC<AdminStaffControlPanelProps> = ({ allBuses }) => {
  const [hasAdminToken, setHasAdminToken] = useState<boolean>(() => !!getAdminToken());

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [auditLogs, setAuditLogs] = useState<StaffCrowdAuditEntry[]>([]);
  const [policy, setPolicy] = useState<StaffOverridePolicy>({
    globalManualOverrideEnabled: true,
    crowdPolicy: 'AI_PRIMARY_WITH_STAFF_SUPPLEMENTARY',
  });
  const [busOverrideMap, setBusOverrideMap] = useState<Record<string, boolean>>({});
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add / Edit Staff Form State
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [staffIdInput, setStaffIdInput] = useState('');
  const [fullNameInput, setFullNameInput] = useState('');
  const [roleInput, setRoleInput] = useState<StaffRole>('driver');
  const [mobileInput, setMobileInput] = useState('');
  const [busSearch, setBusSearch] = useState('');
  const [assignedBusId, setAssignedBusId] = useState(allBuses[0]?.id || '');
  const [shiftLabel, setShiftLabel] = useState('Morning (05:30 - 13:30)');
  const [shiftActive, setShiftActive] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState<'verified' | 'pending' | 'rejected'>('verified');

  // Per-bus Override & Discrepancy Control State
  const [policyBusSearch, setPolicyBusSearch] = useState('');
  const [selectedPolicyBusId, setSelectedPolicyBusId] = useState(allBuses[0]?.id || '');

  // Restricted Admin Document Preview Modal
  const [docPreviewModal, setDocPreviewModal] = useState<{
    staffName: string;
    staffId: string;
    dataUrl: string;
    expiresAt: string;
  } | null>(null);

  // Admin OTP Dispatch Challenge Modal
  const [issuedOtpNotice, setIssuedOtpNotice] = useState<{
    staffId: string;
    code: string;
  } | null>(null);

  const filteredAssignBuses = useMemo(() => {
    const q = busSearch.trim().toLowerCase();
    const list = q
      ? allBuses.filter(
          (b) =>
            b.busNumber.toLowerCase().includes(q) ||
            b.routeNumber.toLowerCase().includes(q) ||
            b.routeName.toLowerCase().includes(q)
        )
      : allBuses;
    return list.slice(0, 80);
  }, [allBuses, busSearch]);

  const filteredPolicyBuses = useMemo(() => {
    const q = policyBusSearch.trim().toLowerCase();
    const list = q
      ? allBuses.filter(
          (b) =>
            b.busNumber.toLowerCase().includes(q) ||
            b.routeNumber.toLowerCase().includes(q) ||
            b.routeName.toLowerCase().includes(q)
        )
      : allBuses;
    return list.slice(0, 80);
  }, [allBuses, policyBusSearch]);

  const loadAdminData = async () => {
    const res = await fetchAdminStaffRegistry();
    if (!res.ok) {
      if (res.error?.toLowerCase().includes('admin')) {
        setHasAdminToken(false);
        setAdminToken(null);
      }
      return;
    }
    setStaffList(res.staff || []);
    setAuditLogs(res.auditLogs || []);
    if (res.policy) setPolicy(res.policy);
    if (Array.isArray(res.busOverrideSettings)) {
      const map: Record<string, boolean> = {};
      res.busOverrideSettings.forEach((b: any) => {
        map[b.busId] = b.manualOverrideEnabled;
      });
      setBusOverrideMap(map);
    }
  };

  useEffect(() => {
    if (hasAdminToken) {
      void loadAdminData();
    }
  }, [hasAdminToken]);

  useEffect(() => {
    if (!assignedBusId && allBuses[0]?.id) setAssignedBusId(allBuses[0].id);
    if (!selectedPolicyBusId && allBuses[0]?.id) setSelectedPolicyBusId(allBuses[0].id);
  }, [allBuses.length]);

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusNotice(null);
    const chosenBus = allBuses.find((b) => b.id === assignedBusId);
    const res = await adminSaveStaff({
      id: editingId,
      staffId: staffIdInput,
      fullName: fullNameInput,
      role: roleInput,
      mobileNumber: mobileInput || undefined,
      assignedBusId,
      assignedBusNumber: chosenBus?.busNumber,
      assignedRouteNumber: chosenBus?.routeNumber,
      shiftLabel,
      shiftActive,
      employmentStatus: 'active',
      verificationStatus,
    });
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to save staff.');
      return;
    }
    setStatusNotice(
      `Saved ${roleInput.toUpperCase()} ${staffIdInput} assigned to bus ${chosenBus?.busNumber || assignedBusId}.`
    );
    setEditingId(undefined);
    setStaffIdInput('');
    setFullNameInput('');
    setMobileInput('');
    await loadAdminData();
  };

  const handleEditStaff = (s: StaffMember) => {
    setEditingId(s.id);
    setStaffIdInput(s.staffId);
    setFullNameInput(s.fullName);
    setRoleInput(s.role);
    setMobileInput('');
    setAssignedBusId(s.assignedBusId || allBuses[0]?.id || '');
    setShiftLabel(s.shiftLabel || 'Morning (05:30 - 13:30)');
    setShiftActive(s.shiftActive);
    setVerificationStatus(s.verificationStatus);
  };

  const handleStaffStatusAction = async (
    id: string,
    updates: {
      verificationStatus?: 'pending' | 'verified' | 'rejected';
      employmentStatus?: 'active' | 'inactive' | 'suspended' | 'revoked';
      shiftActive?: boolean;
      purgeDocument?: boolean;
    },
    notice: string
  ) => {
    setErrorMsg(null);
    const res = await adminUpdateStaffStatus(id, updates);
    if (!res.success) {
      setErrorMsg(res.error || 'Status update failed.');
      return;
    }
    setStatusNotice(notice);
    await loadAdminData();
  };

  const handlePreviewSupportingDoc = async (s: StaffMember) => {
    if (!s.pendingDocumentId) return;
    setErrorMsg(null);
    const res = await adminFetchSupportingDocument(s.pendingDocumentId);
    if (!res.ok || !res.dataUrl) {
      setErrorMsg(res.error || 'Supporting document expired or already purged.');
      await loadAdminData();
      return;
    }
    setDocPreviewModal({
      staffName: s.fullName,
      staffId: s.staffId,
      dataUrl: res.dataUrl,
      expiresAt: res.expiresAt || '',
    });
  };

  const handleIssueOtp = async (s: StaffMember) => {
    setErrorMsg(null);
    const res = await adminIssueStaffOtp(s.id);
    if (!res.success || !res.dispatchCode) {
      setErrorMsg(res.error || 'Failed to generate OTP challenge.');
      return;
    }
    setIssuedOtpNotice({ staffId: s.staffId, code: res.dispatchCode });
  };

  const handleToggleGlobalOverride = async () => {
    const nextVal = !policy.globalManualOverrideEnabled;
    const res = await adminUpdateCrowdPolicy({ globalManualOverrideEnabled: nextVal });
    if (res.success && res.policy) {
      setPolicy(res.policy);
      setStatusNotice(`Global manual crowd override ${nextVal ? 'ENABLED' : 'DISABLED'}.`);
    }
  };

  const handleChangePolicyMode = async (mode: CrowdPolicyMode) => {
    const res = await adminUpdateCrowdPolicy({ crowdPolicy: mode });
    if (res.success && res.policy) {
      setPolicy(res.policy);
      setStatusNotice(`Crowd priority policy updated to ${mode}.`);
    }
  };

  const handleTogglePerBusOverride = async (busId: string, enable: boolean) => {
    const res = await adminUpdateCrowdPolicy({ busId, busManualOverrideEnabled: enable });
    if (res.success) {
      setBusOverrideMap((prev) => ({ ...prev, [busId]: enable }));
      storageService.updateBus(busId, { manualOverrideEnabled: enable });
      setStatusNotice(`Manual crowd override ${enable ? 'enabled' : 'disabled'} for bus ${busId}.`);
    }
  };

  const handleReviewDiscrepancy = async (busId: string) => {
    const res = await adminUpdateCrowdPolicy({ markDiscrepancyReviewedBusId: busId });
    if (res.success) {
      await storageService.refreshCrowdOverlaysFromServer();
      await loadAdminData();
      setStatusNotice(`Marked AI vs Staff discrepancy as reviewed for bus ${busId}.`);
    }
  };

  if (!hasAdminToken) {
    return (
      <AdminAuthGate
        title="Authorize Backend Admin Session"
        description="Staff Registry management, document inspection, OTP issuance, and manual crowd policies require a verified server-side Admin token."
        onAuthenticated={() => setHasAdminToken(true)}
      />
    );
  }

  const selectedPolicyBus = allBuses.find((b) => b.id === selectedPolicyBusId) || allBuses[0];
  const isPolicyBusEnabled = selectedPolicyBus
    ? busOverrideMap[selectedPolicyBus.id] ?? selectedPolicyBus.manualOverrideEnabled ?? true
    : true;

  return (
    <div className="space-y-6">
      {statusNotice && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusNotice}</span>
          </span>
          <button onClick={() => setStatusNotice(null)} className="text-emerald-700 font-bold">
            ×
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-700 font-bold">
            ×
          </button>
        </div>
      )}

      {issuedOtpNotice && (
        <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-indigo-600" />
            <span>
              Single-use verification OTP for <strong>{issuedOtpNotice.staffId}</strong>:{' '}
              <code className="px-2 py-0.5 bg-white rounded border border-indigo-300 font-mono font-extrabold text-sm">
                {issuedOtpNotice.code}
              </code>{' '}
              (expires in 5 minutes; never exposed to passengers)
            </span>
          </div>
          <button
            onClick={() => setIssuedOtpNotice(null)}
            className="text-xs font-bold text-indigo-700 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 1. Global Policy & Per-Bus Controls */}
      <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-purple-600" />
              <span>AI Primary & Manual Crowd Governance ({allBuses.length} Eligible Buses)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              AI Vision remains the primary crowd system. Configure global/per-bus manual override permissions dynamically across every bus in the fleet.
            </p>
          </div>
          <button
            onClick={handleToggleGlobalOverride}
            className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer shrink-0 ${
              policy.globalManualOverrideEnabled
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
            }`}
          >
            Global Manual Override: {policy.globalManualOverrideEnabled ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <label className="font-bold text-slate-700 block">Crowd Estimation Priority Policy</label>
            <select
              value={policy.crowdPolicy}
              onChange={(e) => handleChangePolicyMode(e.target.value as CrowdPolicyMode)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800"
            >
              <option value="AI_PRIMARY_WITH_STAFF_SUPPLEMENTARY">
                AI Primary + Staff Report Supplementary (Always preserve AI primary)
              </option>
              <option value="AI_PRIMARY_WITH_STAFF_FALLBACK">
                AI Primary + Labelled Staff Fallback when AI unavailable
              </option>
            </select>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <label className="font-bold text-slate-700 block">
              Per-Bus Manual Override Permission (Search All {allBuses.length} Buses)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter bus / route..."
                  value={policyBusSearch}
                  onChange={(e) => setPolicyBusSearch(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <select
                value={selectedPolicyBusId}
                onChange={(e) => setSelectedPolicyBusId(e.target.value)}
                className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold text-xs"
              >
                {filteredPolicyBuses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.busNumber} ({b.routeNumber})
                  </option>
                ))}
              </select>
              {selectedPolicyBus && (
                <button
                  type="button"
                  onClick={() =>
                    handleTogglePerBusOverride(selectedPolicyBus.id, !isPolicyBusEnabled)
                  }
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer shrink-0 ${
                    isPolicyBusEnabled
                      ? 'bg-emerald-600 text-white'
                      : 'bg-rose-600 text-white'
                  }`}
                >
                  {isPolicyBusEnabled ? 'Enabled' : 'Disabled'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Add / Edit Staff Assignment */}
      <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-purple-600" />
            <span>{editingId ? 'Edit Staff Assignment & Authorization' : 'Register & Assign Transit Staff'}</span>
          </h3>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(undefined);
                setStaffIdInput('');
                setFullNameInput('');
              }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <form onSubmit={handleSaveStaff} className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Staff ID *</label>
            <input
              type="text"
              required
              placeholder="e.g. MTC-DRV-204"
              value={staffIdInput}
              onChange={(e) => setStaffIdInput(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono uppercase"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Full Name *</label>
            <input
              type="text"
              required
              placeholder="Authorized staff name"
              value={fullNameInput}
              onChange={(e) => setFullNameInput(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Role *</label>
            <select
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value as StaffRole)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
            >
              <option value="driver">Bus Driver</option>
              <option value="conductor">Bus Conductor</option>
            </select>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">
              Registered Mobile (Hashed on Server for OTP)
            </label>
            <input
              type="tel"
              placeholder="10-digit mobile number"
              value={mobileInput}
              onChange={(e) => setMobileInput(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">
              Assign Bus (All {allBuses.length} Fleet Buses) *
            </label>
            <div className="space-y-1">
              <input
                type="text"
                placeholder="Search bus number or route..."
                value={busSearch}
                onChange={(e) => setBusSearch(e.target.value)}
                className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px]"
              />
              <select
                value={assignedBusId}
                onChange={(e) => setAssignedBusId(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
              >
                {filteredAssignBuses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.busNumber} – {b.routeName} ({b.capacity} seats)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Assigned Shift & Status</label>
            <select
              value={shiftLabel}
              onChange={(e) => setShiftLabel(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium mb-1.5"
            >
              <option value="Morning (05:30 - 13:30)">Morning (05:30 - 13:30)</option>
              <option value="Afternoon (13:30 - 21:30)">Afternoon (13:30 - 21:30)</option>
              <option value="Night (21:30 - 05:30)">Night (21:30 - 05:30)</option>
              <option value="Full Day">Full Day</option>
            </select>
            <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={shiftActive}
                onChange={(e) => setShiftActive(e.target.checked)}
              />
              <span>Shift Currently Active</span>
            </label>
          </div>

          <div className="md:col-span-3 flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-700">Identity Status:</span>
              <select
                value={verificationStatus}
                onChange={(e) => setVerificationStatus(e.target.value as any)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
              >
                <option value="verified">Verified (Admin Approved)</option>
                <option value="pending">Pending Review</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <button
              type="submit"
              className="px-5 py-2 font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs cursor-pointer"
            >
              {editingId ? 'Save Staff Changes' : 'Add Staff & Assign Duty'}
            </button>
          </div>
        </form>
      </div>

      {/* 3. Staff Registry Table */}
      <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <BadgeCheck className="w-5 h-5 text-purple-600" />
            <span>Admin-Managed Staff Registry ({staffList.length})</span>
          </h3>
          <button
            onClick={() => void loadAdminData()}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {staffList.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No staff profiles registered yet. Register a Driver or Conductor above to grant verified manual crowd reporting access.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-y border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Staff ID / Name</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Assigned Bus & Shift</th>
                  <th className="py-2.5 px-3">Verification</th>
                  <th className="py-2.5 px-3">Employment</th>
                  <th className="py-2.5 px-3 text-right">Governance Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffList.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-3">
                      <div className="font-mono font-bold text-slate-900">{s.staffId}</div>
                      <div className="text-slate-700 font-medium">{s.fullName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Mobile: ******{s.mobileLast4}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 font-bold uppercase text-[10px]">
                        {s.role}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-800">
                        {s.assignedBusNumber || s.assignedBusId || 'Unassigned'}
                      </div>
                      <div className="text-[11px] text-slate-500">{s.shiftLabel}</div>
                      <button
                        type="button"
                        onClick={() =>
                          void handleStaffStatusAction(
                            s.id,
                            { shiftActive: !s.shiftActive },
                            `Shift ${!s.shiftActive ? 'activated' : 'deactivated'} for ${s.staffId}.`
                          )
                        }
                        className={`mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          s.shiftActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {s.shiftActive ? 'Shift Active' : 'Shift Off'}
                      </button>
                    </td>
                    <td className="py-3 px-3 space-y-1">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase inline-block ${
                          s.verificationStatus === 'verified'
                            ? 'bg-emerald-100 text-emerald-800'
                            : s.verificationStatus === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {s.verificationStatus}
                      </span>
                      {s.hasSupportingDocument && s.pendingDocumentId && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handlePreviewSupportingDoc(s)}
                            className="text-[10px] font-bold text-blue-600 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Inspect ID</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleStaffStatusAction(
                                s.id,
                                { purgeDocument: true },
                                `Supporting ID purged from server for ${s.staffId}.`
                              )
                            }
                            className="text-[10px] font-bold text-rose-600 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Purge</span>
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          s.employmentStatus === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {s.employmentStatus}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right space-x-1 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleEditStaff(s)}
                        className="px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleIssueOtp(s)}
                        className="px-2 py-1 text-[11px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg cursor-pointer"
                        title="Issue single-use OTP challenge"
                      >
                        OTP
                      </button>
                      {s.verificationStatus !== 'verified' && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleStaffStatusAction(
                              s.id,
                              { verificationStatus: 'verified', employmentStatus: 'active' },
                              `Approved verification & activated ${s.staffId}. Supporting ID auto-purged.`
                            )
                          }
                          className="px-2 py-1 text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg cursor-pointer"
                        >
                          Approve
                        </button>
                      )}
                      {s.employmentStatus === 'active' ? (
                        <button
                          type="button"
                          onClick={() =>
                            void handleStaffStatusAction(
                              s.id,
                              { employmentStatus: 'revoked' },
                              `Access immediately revoked for ${s.staffId}.`
                            )
                          }
                          className="px-2 py-1 text-[11px] font-bold bg-rose-600 text-white hover:bg-rose-700 rounded-lg cursor-pointer"
                        >
                          Revoke
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            void handleStaffStatusAction(
                              s.id,
                              { employmentStatus: 'active' },
                              `Re-activated employment for ${s.staffId}.`
                            )
                          }
                          className="px-2 py-1 text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg cursor-pointer"
                        >
                          Activate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Staff Crowd Update Audit History & Discrepancy Review */}
      <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-600" />
          <span>Crowd Estimation & Staff Manual Override Audit Log ({auditLogs.length})</span>
        </h3>

        {auditLogs.length === 0 ? (
          <p className="text-xs text-slate-500">No AI or staff crowd updates logged in this session yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-y border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Bus</th>
                  <th className="py-2.5 px-3">Submitted By</th>
                  <th className="py-2.5 px-3">Report</th>
                  <th className="py-2.5 px-3">Source Label</th>
                  <th className="py-2.5 px-3">AI Comparison / Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-mono text-[11px]">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-bold text-slate-900">{log.busNumber}</span>
                      <span className="text-[10px] text-slate-400 block">{log.routeNumber}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-800">{log.staffName}</div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {log.staffId} ({log.staffRole})
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      <strong>{log.crowdLevel}</strong> ({log.passengerCount}/{log.capacity} • {log.crowdPercentage}%)
                      {log.exceededCapacityWarning && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-800 rounded font-bold">
                          Over Cap
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                          log.sourceLabel === 'AI DETECTED'
                            ? 'bg-cyan-100 text-cyan-800'
                            : log.sourceLabel === 'STAFF REPORTED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {log.sourceLabel}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {log.discrepancyDetected ? (
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-bold text-[10px]">
                            AI: {log.aiLevelAtTime} ({log.aiCountAtTime}) vs Staff: {log.crowdLevel}
                          </span>
                          {!log.discrepancyReviewed ? (
                            <button
                              type="button"
                              onClick={() => void handleReviewDiscrepancy(log.busId)}
                              className="px-2 py-0.5 bg-purple-600 text-white rounded text-[10px] font-bold cursor-pointer"
                            >
                              Mark Reviewed
                            </button>
                          ) : (
                            <span className="text-emerald-700 font-bold text-[10px]">Reviewed</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">Aligned / No Conflict</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Restricted Supporting Document Preview Modal */}
      {docPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Restricted Supporting ID Inspection
                </h4>
                <p className="text-[11px] text-slate-500">
                  {docPreviewModal.staffName} ({docPreviewModal.staffId}) • Auto-purges{' '}
                  {docPreviewModal.expiresAt
                    ? new Date(docPreviewModal.expiresAt).toLocaleTimeString()
                    : 'shortly'}
                </p>
              </div>
              <button
                onClick={() => setDocPreviewModal(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <img
              src={docPreviewModal.dataUrl}
              alt="Restricted staff supporting ID"
              className="w-full max-h-72 object-contain rounded-xl border border-slate-200 bg-slate-50"
            />
            <p className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
              Privacy Notice: Supporting ID images are accessible only to authenticated Admins and are automatically purged when verification is approved/rejected.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

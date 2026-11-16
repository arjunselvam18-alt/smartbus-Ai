import React, { useState, useEffect } from 'react';
import { AppSettings, StaffSession, User } from '../types';
import { getAdminToken } from '../services/staffService';
import { deriveActiveProfile } from '../utils/profileIdentity';
import {
  User as UserIcon,
  Mail,
  ShieldCheck,
  BadgeCheck,
  Bus,
  Clock,
  Edit3,
  Save,
  X,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Lock,
  Globe,
  Sun,
  Languages,
  ArrowRight,
  Settings,
  KeyRound,
} from 'lucide-react';

interface MyProfilePageProps {
  currentUser: User | null;
  staffSession: StaffSession | null;
  settings: AppSettings;
  onUpdateProfile: (updates: { name?: string; avatar?: string }) => void;
  onLogout: () => void;
  onEndStaffSession?: () => void;
  onNavigate: (page: string, params?: any) => void;
}

function formatDate(iso?: string): string {
  if (!iso) return 'Not available';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export const MyProfilePage: React.FC<MyProfilePageProps> = ({
  currentUser,
  staffSession,
  settings,
  onUpdateProfile,
  onLogout,
  onEndStaffSession,
  onNavigate,
}) => {
  const hasAdminToken = Boolean(getAdminToken());
  const profile = deriveActiveProfile(currentUser, staffSession, hasAdminToken);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [avatarBroken, setAvatarBroken] = useState(false);

  useEffect(() => {
    setAvatarBroken(false);
    if (profile) {
      setEditName(profile.fullName);
      setEditAvatar(profile.avatar || '');
    }
  }, [profile?.accountId, profile?.fullName, profile?.avatar]);

  if (!profile) {
    return (
      <div className="max-w-lg mx-auto my-10 p-6 bg-white rounded-2xl border border-slate-200 shadow-xs text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-full bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
          <UserIcon className="w-7 h-7" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-slate-900">Sign In Required</h1>
          <p className="text-xs text-slate-500 mt-1">
            No active Passenger, Crew Staff, or Administrator session was found. Sign in to view your profile details and account preferences.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => onNavigate('login')}
            className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs cursor-pointer"
          >
            Sign In / Register
          </button>
          <button
            type="button"
            onClick={() => onNavigate('staff')}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
          >
            Staff Crew Verification
          </button>
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl cursor-pointer"
          >
            Passenger Hub
          </button>
        </div>
      </div>
    );
  }

  const handleStartEdit = () => {
    setEditName(profile.fullName);
    setEditAvatar(profile.avatar || '');
    setEditError(null);
    setEditSuccess(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditError(null);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    setEditSuccess(null);

    const trimmedName = editName.trim();
    if (trimmedName.length < 2) {
      setEditError('Full name must be at least 2 characters.');
      return;
    }

    const trimmedAvatar = editAvatar.trim();
    if (
      trimmedAvatar &&
      !/^https?:\/\//i.test(trimmedAvatar) &&
      !trimmedAvatar.startsWith('data:image/')
    ) {
      setEditError('Profile photo URL must start with https://, http://, or be left blank.');
      return;
    }

    onUpdateProfile({
      name: trimmedName,
      avatar: trimmedAvatar,
    });
    setAvatarBroken(false);
    setIsEditing(false);
    setEditSuccess('Profile updated successfully.');
  };

  const roleBadgeClass =
    profile.roleKey === 'admin'
      ? 'bg-purple-50 text-purple-700 border-purple-200'
      : profile.roleKey === 'driver' || profile.roleKey === 'conductor'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-blue-50 text-blue-700 border-blue-200';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Profile Header Card */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          {profile.avatar && !avatarBroken ? (
            <img
              src={profile.avatar}
              alt={profile.fullName}
              onError={() => setAvatarBroken(true)}
              className="w-16 h-16 rounded-full object-cover border-2 border-blue-100 shadow-xs shrink-0"
            />
          ) : (
            <div className="flex items-center justify-center w-16 h-16 font-extrabold text-white bg-blue-600 rounded-full shadow-xs text-2xl shrink-0">
              {profile.initial}
            </div>
          )}

          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extrabold text-slate-900 truncate">
                {profile.fullName}
              </h1>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-lg border ${roleBadgeClass}`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{profile.roleTitle}</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 capitalize">
                {profile.status}
              </span>
            </div>

            <p className="text-xs text-slate-500 flex items-center gap-1.5 truncate">
              <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                {profile.email
                  ? profile.email
                  : profile.staffSession
                  ? `Staff ID: ${profile.staffSession.staff.staffId} • Mobile ••••••${profile.staffSession.staff.mobileLast4}`
                  : 'No email on file'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {profile.canEditProfile && !isEditing && (
            <button
              type="button"
              onClick={handleStartEdit}
              className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Profile</span>
            </button>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {editSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{editSuccess}</span>
        </div>
      )}

      {/* Profile Editing Panel (when editing supported accounts) */}
      {isEditing && profile.canEditProfile && (
        <form
          onSubmit={handleSaveEdit}
          className="p-6 bg-white rounded-2xl border border-blue-200 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-blue-600" />
              <span>Edit Profile Details</span>
            </h2>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              aria-label="Cancel profile editing"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {editError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Full Name</label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Profile Photo URL (Optional)
              </label>
              <input
                type="url"
                value={editAvatar}
                onChange={(e) => setEditAvatar(e.target.value)}
                placeholder="https://example.com/photo.jpg (leave blank for initials)"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="font-bold text-slate-500 block mb-1">
                Email Address (Read-Only)
              </label>
              <input
                type="text"
                readOnly
                disabled
                value={profile.email || 'Managed by authentication provider'}
                className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="font-bold text-slate-500 block mb-1">
                Account Role (RBAC Protected)
              </label>
              <input
                type="text"
                readOnly
                disabled
                value={profile.roleTitle}
                className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      )}

      {/* Main Profile Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Account Information (7 Cols) */}
        <div className="lg:col-span-7 p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BadgeCheck className="w-4 h-4 text-blue-600" />
              <span>Account Information</span>
            </h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
              {profile.roleLabel}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                Full Name
              </span>
              <strong className="text-slate-900 block mt-0.5">{profile.fullName}</strong>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                Account Role
              </span>
              <strong className="text-slate-900 block mt-0.5">{profile.roleTitle}</strong>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                {profile.source === 'staff' ? 'Staff ID' : 'Account ID'}
              </span>
              <strong className="font-mono text-slate-800 block mt-0.5 truncate">
                {profile.accountId}
              </strong>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                Email Address
              </span>
              <strong className="text-slate-800 block mt-0.5 truncate">
                {profile.email || 'Not linked (Crew ID Session)'}
              </strong>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                Account Status
              </span>
              <strong className="text-emerald-700 capitalize block mt-0.5">{profile.status}</strong>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                {profile.source === 'staff' ? 'Session Verified At' : 'Member Since'}
              </span>
              <strong className="text-slate-700 block mt-0.5">
                {formatDate(
                  profile.source === 'staff' ? profile.staffSession?.verifiedAt : profile.createdAt
                )}
              </strong>
            </div>
          </div>

          {/* Role-Specific Account Details */}
          {profile.roleKey === 'admin' && (
            <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-900 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-purple-700" />
                  <span>Administrator Access Status</span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                    profile.adminTokenActive
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {profile.adminTokenActive ? 'Verified Server Token' : 'Re-verification Required'}
                </span>
              </div>
              <p className="text-purple-800 leading-relaxed">
                {profile.adminTokenActive
                  ? 'Your server-issued Administrator token is active for Fleet Control, Staff Registry management, and Settings & External API Integrations.'
                  : 'Your stored profile is Administrator, but the server session token expired or was not present in this tab. Open Admin Dashboard to re-authenticate.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('admin')}
                  className="px-3 py-1.5 font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Open Admin Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('admin', { adminTab: 'settings' })}
                  className="px-3 py-1.5 font-semibold text-purple-800 bg-white border border-purple-200 hover:bg-purple-100 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Settings & Integrations</span>
                </button>
              </div>
            </div>
          )}

          {(profile.roleKey === 'driver' || profile.roleKey === 'conductor') &&
            profile.staffSession && (
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                    <Bus className="w-4 h-4 text-emerald-700" />
                    <span>Verified Duty Assignment (Registry-Managed)</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-emerald-100 text-emerald-800 uppercase">
                    {profile.staffSession.staff.verificationStatus}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div>
                    <span className="text-[10px] text-emerald-700/80 uppercase font-semibold block">
                      Assigned Bus
                    </span>
                    <strong className="font-mono text-emerald-950">
                      {profile.staffSession.staff.assignedBusNumber ||
                        profile.staffSession.staff.assignedBusId}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-700/80 uppercase font-semibold block">
                      Route
                    </span>
                    <strong className="font-mono text-emerald-950">
                      {profile.staffSession.staff.assignedRouteNumber || 'Assigned'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-700/80 uppercase font-semibold block">
                      Active Shift
                    </span>
                    <strong className="text-emerald-950">
                      {profile.staffSession.staff.shiftLabel}
                    </strong>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-[11px] text-emerald-800 bg-white/70 p-2.5 rounded-lg border border-emerald-200/80">
                  <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Crew identity, duty role, bus assignment, and shift status are controlled by Transit Administration and cannot be modified from self-service profile settings.
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('staff')}
                    className="px-3 py-1.5 font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Open Staff Crowd Portal</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  {onEndStaffSession && (
                    <button
                      type="button"
                      onClick={onEndStaffSession}
                      className="px-3 py-1.5 font-semibold text-emerald-800 bg-white border border-emerald-300 hover:bg-emerald-100 rounded-lg cursor-pointer"
                    >
                      End Duty Session
                    </button>
                  )}
                </div>
              </div>
            )}

          {profile.roleKey === 'passenger' && (
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-900 flex items-center gap-1.5">
                  <Bus className="w-4 h-4 text-blue-700" />
                  <span>Passenger Transit Access</span>
                </span>
                <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-blue-100 text-blue-800">
                  Standard Commuter
                </span>
              </div>
              <p className="text-blue-800 leading-relaxed">
                Access live bus tracking, route & stop schedules, journey planning, and real-time AI crowd occupancy indicators across Chennai MTC corridors.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('dashboard')}
                  className="px-3 py-1.5 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Go to Passenger Hub</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('tracking')}
                  className="px-3 py-1.5 font-semibold text-blue-800 bg-white border border-blue-200 hover:bg-blue-100 rounded-lg cursor-pointer"
                >
                  Live Bus Tracking
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Account Preferences & Security (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>Account Preferences</span>
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <div>
                    <span className="font-bold text-slate-800 block">Transit Region</span>
                    <span className="text-[11px] text-slate-500">Active bus corridor network</span>
                  </div>
                </div>
                <span className="font-semibold text-slate-700">
                  {settings.selectedCity || 'Chennai'}, India
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2.5">
                  <Sun className="w-4 h-4 text-amber-500" />
                  <div>
                    <span className="font-bold text-slate-800 block">Theme</span>
                    <span className="text-[11px] text-slate-500">Standard interface appearance</span>
                  </div>
                </div>
                <span className="font-semibold text-slate-600">Light (Default)</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2.5">
                  <Languages className="w-4 h-4 text-indigo-600" />
                  <div>
                    <span className="font-bold text-slate-800 block">Language</span>
                    <span className="text-[11px] text-slate-500">Display interface language</span>
                  </div>
                </div>
                <span className="font-semibold text-slate-600">English</span>
              </div>
            </div>
          </div>

          {/* Secure Session & Logout Card */}
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-rose-600" />
              <span>Session Security</span>
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Signing out clears your active user session, administrator authorization tokens, and any active crew verification tokens from this browser.
            </p>
            <button
              type="button"
              onClick={onLogout}
              className="w-full py-2.5 px-4 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out Securely</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

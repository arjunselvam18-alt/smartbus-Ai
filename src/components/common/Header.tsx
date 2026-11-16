import React, { useState, useEffect } from 'react';
import {
  Menu,
  ShieldCheck,
  User as UserIcon,
  Database,
  Globe,
  Radio,
  LogOut,
} from 'lucide-react';
import { User, AppSettings, StaffSession } from '../../types';
import { getAdminToken } from '../../services/staffService';
import { deriveActiveProfile } from '../../utils/profileIdentity';

interface HeaderProps {
  currentUser: User | null;
  staffSession?: StaffSession | null;
  settings: AppSettings;
  onOpenMobileMenu: () => void;
  onLogout: () => void;
  onNavigate: (page: string, params?: any) => void;
  onToggleRole: () => void;
  onCityChange: (city: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  staffSession = null,
  settings,
  onOpenMobileMenu,
  onLogout,
  onNavigate,
}) => {
  const [avatarImgError, setAvatarImgError] = useState(false);
  const activeProfile = deriveActiveProfile(currentUser, staffSession, Boolean(getAdminToken()));

  useEffect(() => {
    setAvatarImgError(false);
  }, [activeProfile?.avatar, activeProfile?.accountId]);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 bg-white/95 backdrop-blur border-b border-slate-200 shadow-xs sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="p-2 text-slate-600 rounded-lg lg:hidden hover:bg-slate-100 focus:outline-none"
          aria-label="Open navigation sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Fixed Transit Region: Chennai, India */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg border border-slate-200">
          <Globe className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-slate-500">Region:</span>
          <span className="font-bold text-slate-800">Chennai, India</span>
        </div>

        {/* GPS Source Indicator */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 rounded-lg border border-amber-200" title="Simulated waypoint GPS trajectory (No physical GPS hardware installed)">
          <Radio className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
          <span>GPS Source: <strong className="font-mono">SIMULATED</strong></span>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Google Sheets Status Indicator (Admin-Only Technical Access) */}
        {currentUser?.role === 'admin' && (
          <button
            onClick={() => onNavigate('admin', { adminTab: 'settings' })}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
              settings.isSheetsConnected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
            }`}
            title="Open Settings & External API Integrations in Admin Dashboard"
          >
            <Database className={`w-3.5 h-3.5 ${settings.isSheetsConnected ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span className="hidden sm:inline">Sheets:</span>
            <span className="font-semibold">{settings.isSheetsConnected ? 'Connected' : 'Unconfigured'}</span>
          </button>
        )}

        {/* Authenticated Role Badge (Admin elevation requires verified server login) */}
        {activeProfile && (
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border ${
              activeProfile.roleKey === 'admin'
                ? 'bg-purple-50 text-purple-700 border-purple-200'
                : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Role: {activeProfile.roleLabel}</span>
          </div>
        )}

        {/* User Profile & Sign Out */}
        {activeProfile ? (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="flex items-center gap-2 rounded-full xl:rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer hover:opacity-90 transition-opacity"
              title={`My Profile (${activeProfile.fullName})`}
              aria-label="Open My Profile"
            >
              {activeProfile.avatar && !avatarImgError ? (
                <img
                  src={activeProfile.avatar}
                  alt={activeProfile.fullName}
                  onError={() => setAvatarImgError(true)}
                  className="w-8 h-8 rounded-full object-cover shadow-xs"
                />
              ) : (
                <div className="flex items-center justify-center w-8 h-8 font-bold text-white bg-blue-600 rounded-full shadow-xs text-xs">
                  {activeProfile.initial}
                </div>
              )}
              <div className="hidden text-left xl:block">
                <p className="text-xs font-semibold text-slate-800 leading-tight">{activeProfile.fullName}</p>
                <p className="text-[10px] text-slate-500 capitalize">{activeProfile.roleLabel}</p>
              </div>
            </button>
            <button
              onClick={onLogout}
              className="p-1.5 text-slate-500 rounded-lg hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              title="Sign out of SmartBus AI"
              aria-label="Sign out of SmartBus AI"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => onNavigate('login')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-xs cursor-pointer"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
};

import React, { useState, useEffect } from 'react';
import { KeyRound, Lock, ShieldCheck, UserPlus, AlertCircle } from 'lucide-react';
import { setAdminToken, setStoredStaffSession } from '../../services/staffService';
import { storageService } from '../../services/storage';

interface AdminAuthGateProps {
  title?: string;
  description?: string;
  onAuthenticated?: () => void;
  onCancel?: () => void;
}

export const AdminAuthGate: React.FC<AdminAuthGateProps> = ({
  title = 'Admin Access Restricted',
  description = 'Only authenticated Transit Administrators can access Fleet Administration and Settings & External API Integrations.',
  onAuthenticated,
  onCancel,
}) => {
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [adminConfigured, setAdminConfigured] = useState<boolean>(true);
  const [setupTokenRequired, setSetupTokenRequired] = useState<boolean>(false);

  // Login State (no hardcoded credentials)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Initial One-Time Setup State
  const [setupName, setSetupName] = useState('');
  const [setupEmail, setSetupEmail] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/auth/admin-setup-status');
        const data = await res.json();
        if (active && res.ok) {
          setAdminConfigured(Boolean(data.adminConfigured));
          setSetupTokenRequired(Boolean(data.setupTokenRequired));
        }
      } catch {
        // Default to standard login if status check fails
      } finally {
        if (active) setCheckingStatus(false);
      }
    };
    void checkStatus();
    return () => {
      active = false;
    };
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.adminToken || data.user?.role !== 'admin') {
        setError(data.error || 'Valid Administrator credentials are required.');
        setLoading(false);
        return;
      }
      setStoredStaffSession(null);
      setAdminToken(data.adminToken);
      storageService.setCurrentUser(data.user);
      setPassword('');
      onAuthenticated?.();
    } catch (err: any) {
      setError(err?.message || 'Unable to authenticate with server.');
    } finally {
      setLoading(false);
    }
  };

  const handleInitialSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (setupPassword !== setupConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/setup-initial-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: setupName,
          email: setupEmail,
          password: setupPassword,
          confirmPassword: setupConfirmPassword,
          setupToken: setupTokenRequired ? setupToken : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.adminToken) {
        if (res.status === 403 && String(data.error || '').toLowerCase().includes('already configured')) {
          setAdminConfigured(true);
        }
        setError(data.error || 'Failed to create initial Administrator account.');
        setLoading(false);
        return;
      }
      setStoredStaffSession(null);
      setAdminToken(data.adminToken);
      storageService.setCurrentUser(data.user);
      setSetupPassword('');
      setSetupConfirmPassword('');
      setSetupToken('');
      onAuthenticated?.();
    } catch (err: any) {
      setError(err?.message || 'Unable to complete initial Admin setup.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingStatus) {
    return (
      <div className="max-w-lg mx-auto my-8 p-6 bg-white rounded-2xl border border-slate-200 shadow-xs text-center text-xs text-slate-500">
        Verifying administrator configuration status...
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto my-8 p-6 bg-white rounded-2xl border border-purple-200 shadow-lg space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-purple-100 text-purple-700">
          {adminConfigured ? <Lock className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-slate-900">
            {adminConfigured ? title : 'Initial Administrator Account Setup'}
          </h1>
          <p className="text-xs text-slate-500">
            {adminConfigured
              ? description
              : 'No Admin account is configured yet. Create your first Administrator account below. This one-time setup locks permanently once completed.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!adminConfigured ? (
        <form onSubmit={handleInitialSetupSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Administrator Full Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Transit Operations Lead"
              value={setupName}
              onChange={(e) => setSetupName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Administrator Email</label>
            <input
              type="email"
              required
              placeholder="Enter your admin email address"
              value={setupEmail}
              onChange={(e) => setSetupEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">
              Create Strong Password (min 8 chars, letters + numbers/symbols)
            </label>
            <input
              type="password"
              required
              minLength={8}
              placeholder="Create a secure admin password"
              value={setupPassword}
              onChange={(e) => setSetupPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Confirm Password</label>
            <input
              type="password"
              required
              minLength={8}
              placeholder="Re-enter your admin password"
              value={setupConfirmPassword}
              onChange={(e) => setSetupConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>
          {setupTokenRequired && (
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Server Setup Token (ADMIN_SETUP_TOKEN)
              </label>
              <input
                type="password"
                required
                placeholder="Enter server setup token"
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
              />
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2.5 font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Return to Passenger Hub
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>{loading ? 'Creating Admin...' : 'Create Initial Admin Account'}</span>
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleLoginSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Admin Email</label>
            <input
              type="email"
              required
              autoComplete="username"
              placeholder="Enter configured admin email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Admin Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="Enter administrator password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2.5 font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Return to Passenger Hub
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>{loading ? 'Signing in...' : 'Authenticate as Admin'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

import { StaffSession, User } from '../types';

export type ActiveProfileRole = 'passenger' | 'driver' | 'conductor' | 'admin';

export interface ActiveProfileIdentity {
  roleKey: ActiveProfileRole;
  roleLabel: 'Passenger' | 'Driver' | 'Conductor' | 'Admin';
  roleTitle: string;
  source: 'user' | 'staff';
  fullName: string;
  initial: string;
  email: string | null;
  avatar?: string;
  accountId: string;
  status: string;
  createdAt?: string;
  canEditProfile: boolean;
  adminTokenActive?: boolean;
  userRecord: User | null;
  staffSession: StaffSession | null;
}

export function computeUserInitial(name?: string | null, fallbackIdentifier?: string | null): string {
  const cleanName = String(name || '').trim();
  if (cleanName.length > 0) {
    const match = cleanName.match(/[A-Za-z0-9]/);
    return (match ? match[0] : cleanName.charAt(0)).toUpperCase();
  }
  const cleanFallback = String(fallbackIdentifier || '').trim();
  if (cleanFallback.length > 0) {
    const match = cleanFallback.match(/[A-Za-z0-9]/);
    return (match ? match[0] : cleanFallback.charAt(0)).toUpperCase();
  }
  return 'U';
}

export function deriveActiveProfile(
  currentUser: User | null,
  staffSession: StaffSession | null,
  hasAdminToken: boolean
): ActiveProfileIdentity | null {
  // 1. Active verified Admin session takes top priority
  if (currentUser?.role === 'admin' && hasAdminToken) {
    return {
      roleKey: 'admin',
      roleLabel: 'Admin',
      roleTitle: 'Transit Administrator',
      source: 'user',
      fullName: currentUser.name || currentUser.email,
      initial: computeUserInitial(currentUser.name, currentUser.email),
      email: currentUser.email,
      avatar: currentUser.avatar,
      accountId: currentUser.id,
      status: currentUser.status || 'active',
      createdAt: currentUser.createdAt,
      canEditProfile: true,
      adminTokenActive: true,
      userRecord: currentUser,
      staffSession: null,
    };
  }

  // 2. Active verified Driver / Conductor staff session
  if (staffSession?.staff) {
    const isDriver = staffSession.staff.role === 'driver';
    return {
      roleKey: staffSession.staff.role,
      roleLabel: isDriver ? 'Driver' : 'Conductor',
      roleTitle: isDriver ? 'Bus Driver' : 'Bus Conductor',
      source: 'staff',
      fullName: staffSession.staff.fullName,
      initial: computeUserInitial(staffSession.staff.fullName, staffSession.staff.staffId),
      email: currentUser?.email || null,
      avatar: undefined,
      accountId: staffSession.staff.staffId,
      status: staffSession.staff.employmentStatus || 'active',
      createdAt: staffSession.staff.createdAt,
      canEditProfile: false,
      userRecord: currentUser,
      staffSession,
    };
  }

  // 3. Stored Admin user awaiting token re-verification (e.g., new browser session)
  if (currentUser?.role === 'admin') {
    return {
      roleKey: 'admin',
      roleLabel: 'Admin',
      roleTitle: 'Transit Administrator',
      source: 'user',
      fullName: currentUser.name || currentUser.email,
      initial: computeUserInitial(currentUser.name, currentUser.email),
      email: currentUser.email,
      avatar: currentUser.avatar,
      accountId: currentUser.id,
      status: currentUser.status || 'active',
      createdAt: currentUser.createdAt,
      canEditProfile: true,
      adminTokenActive: false,
      userRecord: currentUser,
      staffSession: null,
    };
  }

  // 4. Signed-in Passenger account
  if (currentUser) {
    return {
      roleKey: 'passenger',
      roleLabel: 'Passenger',
      roleTitle: 'Passenger Commuter',
      source: 'user',
      fullName: currentUser.name || currentUser.email,
      initial: computeUserInitial(currentUser.name, currentUser.email),
      email: currentUser.email,
      avatar: currentUser.avatar,
      accountId: currentUser.id,
      status: currentUser.status || 'active',
      createdAt: currentUser.createdAt,
      canEditProfile: true,
      userRecord: currentUser,
      staffSession: null,
    };
  }

  return null;
}

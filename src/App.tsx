import React, { useState, useEffect } from 'react';
import { storageService } from './services/storage';
import {
  getStoredStaffSession,
  setAdminToken,
  setStoredStaffSession,
  subscribeStaffSession,
} from './services/staffService';
import { googleSignOut } from './services/firebaseAuth';
import { Bus, BusRoute, BusStop, NextBusArrival, StaffSession, User, AppSettings } from './types';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { PassengerDashboard } from './pages/PassengerDashboard';
import { LiveBusTracking } from './pages/LiveBusTracking';
import { AICameraVisionPage } from './pages/AICameraVisionPage';
import { BusRoutesPage } from './pages/BusRoutesPage';
import { BusStopsPage } from './pages/BusStopsPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { LoginPage } from './pages/LoginPage';
import { StaffVerificationPage } from './pages/StaffVerificationPage';
import { MyProfilePage } from './pages/MyProfilePage';
import { MatchedJourney } from './services/routeEngine';

export default function App() {
  const [currentPage, setCurrentPage] = useState<string>('dashboard');
  const [currentUser, setCurrentUser] = useState<User | null>(storageService.getCurrentUser());
  const [staffSession, setStaffSession] = useState<StaffSession | null>(getStoredStaffSession());
  const [buses, setBuses] = useState<Bus[]>(storageService.getBuses());
  const [routes, setRoutes] = useState<BusRoute[]>(storageService.getRoutes());
  const [datasetBuses, setDatasetBuses] = useState<Bus[]>(storageService.getDatasetBuses());
  const [datasetRoutes, setDatasetRoutes] = useState<BusRoute[]>(storageService.getDatasetRoutes());
  const [datasetStops, setDatasetStops] = useState<BusStop[]>(storageService.getDatasetStops());
  const [stops, setStops] = useState<BusStop[]>(storageService.getStops());
  const [users, setUsers] = useState<User[]>(storageService.getAllUsers());
  const [settings, setSettings] = useState<AppSettings>(storageService.getSettings());
  const [arrivals, setArrivals] = useState<NextBusArrival[]>(storageService.getNextArrivals());

  const [selectedBusId, setSelectedBusId] = useState<string | null>(buses[0]?.id || null);
  const [plannedJourney, setPlannedJourney] = useState<MatchedJourney | null>(null);
  const [adminTab, setAdminTab] = useState<
    'buses' | 'staff' | 'settings' | 'gps' | 'crowd' | 'users' | 'activity' | undefined
  >(undefined);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Subscribe to central storage service updates (simulation ticks, CRUD, settings) & staff session updates
  useEffect(() => {
    const unsubscribeStorage = storageService.subscribe(() => {
      setBuses([...storageService.getBuses()]);
      setRoutes([...storageService.getRoutes()]);
      setDatasetBuses([...storageService.getDatasetBuses()]);
      setDatasetRoutes([...storageService.getDatasetRoutes()]);
      setDatasetStops([...storageService.getDatasetStops()]);
      setStops([...storageService.getStops()]);
      setUsers([...storageService.getAllUsers()]);
      setSettings({ ...storageService.getSettings() });
      setCurrentUser(storageService.getCurrentUser());
      setArrivals([...storageService.getNextArrivals()]);
    });

    const unsubscribeStaff = subscribeStaffSession(() => {
      setStaffSession(getStoredStaffSession());
    });

    return () => {
      unsubscribeStorage();
      unsubscribeStaff();
    };
  }, []);

  const handleNavigate = (page: string, params?: any) => {
    const safePage = page === 'docs' || page === 'settings' ? 'dashboard' : page;
    setCurrentPage(safePage);
    if (params?.adminTab) {
      setAdminTab(params.adminTab);
    } else if (safePage !== 'admin') {
      setAdminTab(undefined);
    }
    if (params?.busId) {
      setSelectedBusId(params.busId);
    } else if (params?.plannedJourney !== undefined) {
      setSelectedBusId(null);
    }
    if (params?.plannedJourney !== undefined) {
      setPlannedJourney(params.plannedJourney);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleRole = () => {
    if (!currentUser) return;
    const newRole = currentUser.role === 'admin' ? 'passenger' : 'admin';
    storageService.updateUserRole(currentUser.id, newRole);
  };

  const handleLogout = () => {
    storageService.setCurrentUser(null);
    setAdminToken(null);
    setStoredStaffSession(null);
    void googleSignOut().catch(() => {});
    setCurrentPage('login');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLoginSuccess = (user: User) => {
    setStoredStaffSession(null);
    storageService.setCurrentUser(user);
    storageService.addUser(user);
    setCurrentPage('dashboard');
  };

  const handleCityChange = (city: string) => {
    storageService.updateSettings({ selectedCity: city });
  };

  const handleSelectBus = (bus: Bus) => {
    setSelectedBusId(bus.id);
  };

  const handleUpdateBusCrowd = (busId: string, count: number, capacity?: number) => {
    storageService.applyAICrowdEstimate(busId, count, capacity, 'AI_CAMERA_VISION');
  };

  return (
    <div className="flex min-h-screen bg-slate-100 font-sans text-slate-800 antialiased selection:bg-blue-600 selection:text-white">
      {/* Sidebar Navigation */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        userRole={currentUser?.role || 'passenger'}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Global Header */}
        <Header
          currentUser={currentUser}
          staffSession={staffSession}
          settings={settings}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onLogout={handleLogout}
          onNavigate={handleNavigate}
          onToggleRole={handleToggleRole}
          onCityChange={handleCityChange}
        />

        {/* Page Content Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {currentPage === 'dashboard' && (
            <PassengerDashboard
              currentUser={currentUser}
              buses={buses}
              routes={routes}
              datasetBuses={datasetBuses}
              datasetRoutes={datasetRoutes}
              googleMapsApiKey={settings.googleMapsApiKey}
              stops={datasetStops}
              arrivals={arrivals}
              onNavigate={handleNavigate}
              onSelectBus={handleSelectBus}
            />
          )}

          {currentPage === 'tracking' && (
            <LiveBusTracking
              buses={datasetBuses}
              routes={datasetRoutes}
              stops={datasetStops}
              settings={settings}
              selectedBusId={selectedBusId}
              onSelectBus={handleSelectBus}
              onUpdateSettings={(partial) => storageService.updateSettings(partial)}
              onManualGPSUpdate={(id, lat, lng, speed) =>
                storageService.manualUpdateBusGPS(id, lat, lng, speed)
              }
              plannedJourney={plannedJourney}
              onSelectJourney={(journey) => {
                setSelectedBusId(null);
                setPlannedJourney(journey);
              }}
              onClearPlannedJourney={() => setPlannedJourney(null)}
            />
          )}

          {currentPage === 'vision' && (
            <AICameraVisionPage
              buses={datasetBuses}
              selectedBusId={selectedBusId || undefined}
              onUpdateBusCrowd={handleUpdateBusCrowd}
              onNavigate={handleNavigate}
            />
          )}

          {currentPage === 'staff' && (
            <StaffVerificationPage
              buses={datasetBuses}
              onNavigate={handleNavigate}
            />
          )}

          {currentPage === 'routes' && (
            <BusRoutesPage
              routes={datasetRoutes}
              buses={datasetBuses}
              stops={datasetStops}
              onNavigate={handleNavigate}
            />
          )}

          {currentPage === 'stops' && (
            <BusStopsPage
              stops={datasetStops}
              routes={datasetRoutes}
              buses={datasetBuses}
              arrivals={arrivals}
              onNavigate={handleNavigate}
            />
          )}

          {currentPage === 'admin' && (
            <AdminDashboard
              currentUser={currentUser}
              buses={datasetBuses}
              routes={datasetRoutes}
              stops={datasetStops}
              users={users}
              settings={settings}
              initialTab={adminTab}
              onAddBus={(bus) => storageService.addBus(bus)}
              onUpdateBus={(id, updates) => storageService.updateBus(id, updates)}
              onDeleteBus={(id) => storageService.deleteBus(id)}
              onManualGPSUpdate={(id, lat, lng, speed) =>
                storageService.manualUpdateBusGPS(id, lat, lng, speed)
              }
              onManualCrowdUpdate={(id, count, cap) =>
                storageService.manualUpdateBusCrowd(id, count, cap)
              }
              onUpdateUserRole={(id, role) => storageService.updateUserRole(id, role)}
              onUpdateUserStatus={(id, status) => storageService.updateUserStatus(id, status)}
              onUpdateSettings={(partial) => storageService.updateSettings(partial)}
              onNavigate={handleNavigate}
            />
          )}

          {currentPage === 'profile' && (
            <MyProfilePage
              currentUser={currentUser}
              staffSession={staffSession}
              settings={settings}
              onUpdateProfile={(updates) => storageService.updateCurrentUserProfile(updates)}
              onLogout={handleLogout}
              onEndStaffSession={() => {
                setStoredStaffSession(null);
                handleNavigate('staff');
              }}
              onNavigate={handleNavigate}
            />
          )}

          {currentPage === 'login' && (
            <LoginPage
              onLoginSuccess={handleLoginSuccess}
              onNavigateHome={() => handleNavigate('dashboard')}
            />
          )}
        </main>
      </div>
    </div>
  );
}

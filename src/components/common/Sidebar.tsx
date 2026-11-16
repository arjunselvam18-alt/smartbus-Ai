import React from 'react';
import {
  Bus,
  MapPin,
  Camera,
  Route,
  LayoutDashboard,
  ShieldAlert,
  X,
  Radio,
  BadgeCheck,
} from 'lucide-react';
import { UserRole } from '../../types';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  userRole?: UserRole;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  userRole = 'passenger',
  isMobileOpen,
  onCloseMobile,
}) => {
  const passengerNavItems = [
    { id: 'dashboard', label: 'Passenger Hub', icon: LayoutDashboard },
    { id: 'tracking', label: 'Live Bus Tracking', icon: Bus, badge: 'Live GPS' },
    { id: 'vision', label: 'AI Camera Vision', icon: Camera, badge: 'AI Model' },
    { id: 'staff', label: 'Staff Crowd Portal', icon: BadgeCheck, badge: 'Driver/Cond' },
    { id: 'routes', label: 'Bus Routes', icon: Route },
    { id: 'stops', label: 'Bus Stops', icon: MapPin },
  ];

  const adminNavItems = [
    { id: 'admin', label: 'Admin Dashboard', icon: ShieldAlert, badge: 'Admin' },
  ];

  const handleItemClick = (pageId: string) => {
    onNavigate(pageId);
    onCloseMobile();
  };

  const navContent = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100">
      {/* Brand Header */}
      <div className="flex items-center justify-between h-16 px-5 border-b border-slate-800 bg-slate-950/60">
        <div
          onClick={() => handleItemClick('dashboard')}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-md shadow-blue-500/20 text-white">
            <Bus className="w-5 h-5 group-hover:scale-105 transition-transform" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold tracking-tight text-white text-base">SmartBus</span>
              <span className="px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide bg-blue-500/20 text-blue-400 rounded-md border border-blue-500/30">
                AI
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Crowd Transit Intelligence</p>
          </div>
        </div>

        <button
          onClick={onCloseMobile}
          className="p-1.5 text-slate-400 rounded-lg lg:hidden hover:text-white hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        {/* Transit Module */}
        <div>
          <p className="px-3 mb-2 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
            Transit Intelligence
          </p>
          <div className="space-y-1">
            {passengerNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className={`flex items-center justify-between w-full px-3 py-2.5 text-xs font-medium rounded-xl transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`px-1.5 py-0.5 text-[10px] rounded-md font-semibold ${
                        isActive
                          ? 'bg-blue-700 text-blue-100'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Administration Section */}
        <div>
          <p className="px-3 mb-2 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
            Fleet Operations
          </p>
          <div className="space-y-1">
            {adminNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className={`flex items-center justify-between w-full px-3 py-2.5 text-xs font-medium rounded-xl transition-all ${
                    isActive
                      ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-purple-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  <span className="px-1.5 py-0.5 text-[10px] rounded-md font-bold bg-purple-900/60 text-purple-300 border border-purple-700/40">
                    Control
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Live Status Banner */}
      <div className="p-3 mx-3 mb-4 rounded-xl bg-slate-800/60 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-1">
          <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span className="text-[11px] font-semibold text-slate-200">Simulation Active</span>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Simulating GPS & crowd metrics along predefined routes.
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:block w-64 h-screen sticky top-0 border-r border-slate-800 shrink-0 z-40">
        {navContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
          />
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl z-50">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
};

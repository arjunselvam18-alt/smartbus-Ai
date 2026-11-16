import React from 'react';
import { Bus } from '../types';
import { AICameraVision } from '../components/vision/AICameraVision';
import { Cpu, Terminal, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface AICameraVisionPageProps {
  buses: Bus[];
  selectedBusId?: string;
  onUpdateBusCrowd: (busId: string, count: number, capacity?: number) => void;
  onNavigate: (page: string) => void;
}

export const AICameraVisionPage: React.FC<AICameraVisionPageProps> = ({
  buses,
  selectedBusId,
  onUpdateBusCrowd,
  onNavigate,
}) => {
  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-2 text-xs font-semibold rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            <Cpu className="w-3.5 h-3.5" />
            <span>Computer Vision & Deep Learning Module</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            AI Passenger Detection & Crowd Analytics
          </h1>
          <p className="mt-1 text-xs text-slate-300 max-w-2xl leading-relaxed">
            Infers passenger count from bus interior cameras, detects standing and seated commuters using bounding box models, and dynamically calculates capacity percentages.
          </p>
        </div>
      </div>

      {/* Main Vision Component */}
      <AICameraVision
        buses={buses}
        selectedBusId={selectedBusId}
        onUpdateBusCrowd={onUpdateBusCrowd}
      />

      {/* Technical Architecture Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-blue-600 font-bold text-xs">
            <Cpu className="w-4 h-4" />
            <span>YOLOv8 & OpenCV Architecture</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Built for edge deployment on Raspberry Pi or NVIDIA Jetson boards mounted above the bus entrance and aisle. Runs at 25+ FPS for real-time passenger counting.
          </p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs">
            <Terminal className="w-4 h-4" />
            <span>REST API Endpoint</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Exposes <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 font-mono text-[11px]">POST /api/ai/detect</code> receiving frame buffers and returning JSON bounding boxes with confidence scores.
          </p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-amber-600 font-bold text-xs">
            <ShieldAlert className="w-4 h-4" />
            <span>Transparent Mode Indicator</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            System strictly flags when running in DEMO mode vs LIVE AI inference, ensuring complete honesty in data lineage per transit software safety regulations.
          </p>
        </div>
      </div>
    </div>
  );
};

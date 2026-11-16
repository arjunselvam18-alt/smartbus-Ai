import React from 'react';
import { Bus } from '../../types';
import { Cpu, UserCheck, AlertTriangle, Radio } from 'lucide-react';

export function resolveCrowdSourceLabel(bus: Bus): 'AI DETECTED' | 'STAFF REPORTED' | 'SIMULATED' | 'MANUAL OVERRIDE' {
  if (bus.aiCrowdEstimate || bus.crowdDataSource === 'AI DETECTED' || bus.crowdDataSource === 'AI_VISION_VERIFIED') {
    return 'AI DETECTED';
  }
  if (bus.crowdDataSource === 'MANUAL OVERRIDE' || bus.staffCrowdReport?.sourceLabel === 'MANUAL OVERRIDE') {
    return 'MANUAL OVERRIDE';
  }
  if (bus.crowdDataSource === 'STAFF REPORTED' || bus.staffCrowdReport?.sourceLabel === 'STAFF REPORTED') {
    return 'STAFF REPORTED';
  }
  return 'SIMULATED';
}

interface CrowdSourceDetailsProps {
  bus: Bus;
  compact?: boolean;
}

export const CrowdSourceDetails: React.FC<CrowdSourceDetailsProps> = ({ bus, compact = false }) => {
  const activeSource = resolveCrowdSourceLabel(bus);

  const badgeStyle =
    activeSource === 'AI DETECTED'
      ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
      : activeSource === 'STAFF REPORTED'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : activeSource === 'MANUAL OVERRIDE'
      ? 'bg-purple-50 text-purple-800 border-purple-200'
      : 'bg-amber-50 text-amber-800 border-amber-200';

  return (
    <div className={`${compact ? 'space-y-1 text-[10px]' : 'space-y-1.5 text-xs'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-500">Crowd Source:</span>
        <span className={`px-1.5 py-0.5 rounded font-mono font-bold border text-[10px] ${badgeStyle}`}>
          {activeSource}
        </span>
      </div>

      {bus.aiCrowdEstimate && (
        <div className="flex items-center justify-between gap-2 text-slate-600">
          <span className="inline-flex items-center gap-1 text-cyan-700 font-semibold">
            <Cpu className="w-3 h-3" />
            <span>AI Estimate:</span>
          </span>
          <span className="font-mono">
            <strong>{bus.aiCrowdEstimate.crowdCategory}</strong> ({bus.aiCrowdEstimate.passengerCount}/{bus.aiCrowdEstimate.capacity}) •{' '}
            {new Date(bus.aiCrowdEstimate.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      {bus.staffCrowdReport && (
        <div className="flex items-center justify-between gap-2 text-slate-600">
          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
            <UserCheck className="w-3 h-3" />
            <span>{bus.staffCrowdReport.sourceLabel === 'MANUAL OVERRIDE' ? 'Admin Report:' : 'Staff Report:'}</span>
          </span>
          <span className="font-mono">
            <strong>{bus.staffCrowdReport.crowdCategory}</strong> ({bus.staffCrowdReport.passengerCount}/{bus.staffCrowdReport.capacity}) •{' '}
            {new Date(bus.staffCrowdReport.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      {!bus.aiCrowdEstimate && !bus.staffCrowdReport && !compact && (
        <div className="flex items-center gap-1 text-[10px] text-amber-700">
          <Radio className="w-3 h-3" />
          <span>AI Vision primary baseline (no manual report submitted)</span>
        </div>
      )}

      {bus.crowdDiscrepancy?.hasDiscrepancy && (
        <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-between gap-1.5 text-[10px]">
          <span className="inline-flex items-center gap-1 font-bold">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>
              Discrepancy: AI {bus.crowdDiscrepancy.aiLevel} vs Staff {bus.crowdDiscrepancy.staffLevel} (Δ{bus.crowdDiscrepancy.deltaPassengers})
            </span>
          </span>
          {bus.crowdDiscrepancy.reviewedByAdmin && (
            <span className="px-1 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold">Reviewed</span>
          )}
        </div>
      )}
    </div>
  );
};

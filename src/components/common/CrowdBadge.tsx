import React from 'react';
import { CrowdLevel } from '../../types';
import { CROWD_COLORS } from '../../data/mockData';
import { Users, AlertCircle, CheckCircle2 } from 'lucide-react';

interface CrowdBadgeProps {
  level: CrowdLevel;
  percentage?: number;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const CrowdBadge: React.FC<CrowdBadgeProps> = ({
  level,
  percentage,
  showIcon = true,
  size = 'md',
  showLabel = true,
}) => {
  const config = CROWD_COLORS[level] || CROWD_COLORS.LOW;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-semibold',
  }[size];

  const Icon = level === 'HIGH' ? AlertCircle : level === 'MEDIUM' ? Users : CheckCircle2;

  return (
    <span
      className={`inline-flex items-center rounded-full border transition-all ${config.bg} ${sizeClasses}`}
      title={`${level} crowd occupancy: ${percentage ?? ''}%`}
    >
      <span className={`w-2 h-2 rounded-full ${config.badge} animate-pulse`} />
      {showIcon && <Icon className="w-3.5 h-3.5" />}
      {showLabel && <span>{level}</span>}
      {percentage !== undefined && (
        <span className="font-mono font-bold">({percentage}%)</span>
      )}
    </span>
  );
};

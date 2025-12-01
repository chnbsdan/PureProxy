import React from 'react';
import { RiskLevel } from '../types';

interface PurityBadgeProps {
  score: number;
  level: RiskLevel;
}

const PurityBadge: React.FC<PurityBadgeProps> = ({ score, level }) => {
  let colorClass = '';
  
  switch (level) {
    case RiskLevel.LOW:
      colorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      break;
    case RiskLevel.MEDIUM:
      colorClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      break;
    case RiskLevel.HIGH:
      colorClass = 'bg-red-500/10 text-red-400 border-red-500/20';
      break;
  }

  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded border ${colorClass}`}>
      <div className="relative w-8 h-8 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="16"
            cy="16"
            r="12"
            stroke="currentColor"
            strokeWidth="3"
            fill="transparent"
            className="opacity-20"
          />
          <circle
            cx="16"
            cy="16"
            r="12"
            stroke="currentColor"
            strokeWidth="3"
            fill="transparent"
            strokeDasharray={2 * Math.PI * 12}
            strokeDashoffset={2 * Math.PI * 12 * (1 - score / 100)}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute text-[10px] font-bold">{score}</span>
      </div>
      <span className="text-xs font-semibold uppercase tracking-wider">{level}</span>
    </div>
  );
};

export default PurityBadge;
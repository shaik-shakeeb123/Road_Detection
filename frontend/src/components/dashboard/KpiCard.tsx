import React from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  description: string;
  icon?: string;
  iconColor?: string;
  badge?: React.ReactNode;
}

export default function KpiCard({
  title,
  value,
  description,
  icon,
  iconColor = '#6989FF',
  badge,
}: KpiCardProps) {
  return (
    <div className="p-4 rounded-xl bg-[#18181C] border border-[#2B2D35] hover:border-[#3E424E] transition-all flex flex-col justify-between group">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#767881]">
          {title}
        </span>
        <div className="flex items-center gap-2">
          {badge}
          {icon && (
            <span
              className="p-1.5 rounded-lg bg-[#14151B] border border-[#2B2D35] flex items-center justify-center transition-colors"
              style={{ color: iconColor }}
            >
              <span className="material-symbols-outlined text-[18px]">{icon}</span>
            </span>
          )}
        </div>
      </div>

      {/* Primary Value */}
      <div className="mb-3">
        <span className="text-3xl font-bold font-mono tracking-tight text-[#F5F5F5]">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
      </div>

      {/* Description */}
      <div className="pt-2 border-t border-[#2B2D35]/50 text-xs text-[#767881] leading-relaxed">
        {description}
      </div>
    </div>
  );
}

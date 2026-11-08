import type { ModelStatusResponse } from '@/types/api';

interface DashboardHeaderProps {
  modelStatus: ModelStatusResponse | null;
  backendConnected: boolean;
}

export default function DashboardHeader({ modelStatus, backendConnected }: DashboardHeaderProps) {
  const isAvailable = modelStatus?.available ?? false;

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 mb-6 border-b border-[#2B2D35]/60">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-[#F5F5F5] tracking-tight">Dashboard</h1>

          {/* Model status pill */}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
              isAvailable
                ? 'bg-[#E0EA6C]/10 text-[#E0EA6C] border-[#E0EA6C]/30'
                : 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30'
            }`}
          >
            <span className="relative flex h-2 w-2">
              {isAvailable && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E0EA6C] opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isAvailable ? 'bg-[#E0EA6C]' : 'bg-[#F59E0B]'
                }`}
              />
            </span>
            {isAvailable
              ? `${modelStatus?.active_model || 'Model'} Ready`
              : backendConnected
              ? 'Model Unavailable'
              : 'Backend Offline'}
          </span>
        </div>

        <p className="text-xs text-[#767881]">
          Overview of road damage inspections and detection summary
        </p>
      </div>

      {/* Clean Mode Indicator */}
      <div className="flex items-center gap-2 self-start md:self-auto">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#14151B] border border-[#2B2D35] text-xs font-medium text-[#A1A1AA]">
          <span className="material-symbols-outlined text-[16px] text-[#6989FF]">speed</span>
          <span>RoadVision Inspection Engine</span>
        </div>
      </div>
    </div>
  );
}

import type { DashboardResponse } from '@/types/api';

interface DetectionTrendChartProps {
  data?: DashboardResponse;
}

export default function DetectionTrendChart({ data: _data }: DetectionTrendChartProps) {
  return (
    <div className="p-5 rounded-xl bg-[#18181C] border border-[#2B2D35] flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-[#F5F5F5]">
            Detection Analytics
          </h2>
          <p className="text-xs text-[#767881]">
            Temporal trend analysis of identified road distresses
          </p>
        </div>
      </div>

      {/* Polished Empty State Container */}
      <div className="flex-1 min-h-[240px] bg-[#14151B]/60 rounded-xl border border-[#2B2D35]/60 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-[#18181C] border border-[#2B2D35] flex items-center justify-center text-[#6989FF] mb-3">
          <span className="material-symbols-outlined text-[24px]">insights</span>
        </div>
        <h3 className="text-sm font-semibold text-[#F5F5F5] mb-1.5">
          Detection Analytics
        </h3>
        <p className="text-xs text-[#767881] max-w-md leading-relaxed">
          Historical detection trends will appear here as more inspection data becomes available.
        </p>
      </div>
    </div>
  );
}

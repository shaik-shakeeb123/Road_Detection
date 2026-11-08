import { motion, useReducedMotion } from 'framer-motion';
import { DAMAGE_CLASSES, type DamageClassCode } from '@/types/detection';
import type { DashboardResponse } from '@/types/api';

interface CategoryDistributionProps {
  data: DashboardResponse;
}

export default function CategoryDistribution({ data }: CategoryDistributionProps) {
  const shouldReduceMotion = useReducedMotion();
  const total = data.total_detections;
  const categories: DamageClassCode[] = ['D00', 'D10', 'D20', 'D40'];

  return (
    <div className="p-5 rounded-xl bg-[#18181C] border border-[#2B2D35] flex flex-col justify-between h-full">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-[#F5F5F5]">Category Distribution</h2>
          <span className="text-xs font-mono font-semibold text-[#767881]">
            Total: {total.toLocaleString()}
          </span>
        </div>
        <p className="text-xs text-[#767881] mb-5">
          Breakdown across road damage classifications
        </p>

        {/* 4 Category Progress Bars */}
        <div className="flex flex-col gap-4">
          {categories.map((code) => {
            const count = data.class_counts[code] ?? 0;
            const pctNum = total > 0 ? (count / total) * 100 : 0;
            const pctStr = pctNum.toFixed(1);
            const meta = DAMAGE_CLASSES[code];

            return (
              <div key={code} className="flex flex-col gap-1.5">
                {/* Labels & Counts */}
                <div className="flex items-center justify-between text-xs font-medium">
                  <div className="flex items-center gap-2">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
                      style={{
                        backgroundColor: meta.bgColor,
                        color: meta.color,
                        border: `1px solid ${meta.borderColor}`,
                      }}
                    >
                      {code}
                    </span>
                    <span className="text-[#F5F5F5] font-semibold">{meta.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <span className="text-[#F5F5F5] font-bold">{count.toLocaleString()}</span>
                    <span className="text-[#767881]">({pctStr}%)</span>
                  </div>
                </div>

                {/* Horizontal Progress Bar */}
                <div className="h-2 w-full rounded-full bg-[#14151B] overflow-hidden border border-[#2B2D35]/60">
                  <motion.div
                    className="h-full rounded-full"
                    initial={false}
                    animate={{ width: total > 0 ? `${Math.min(100, pctNum)}%` : '0%' }}
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : { duration: 0.35, ease: [0.16, 1, 0.3, 1] }
                    }
                    style={{ backgroundColor: meta.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Summary */}
      <div className="pt-4 mt-6 border-t border-[#2B2D35]/50 flex items-center justify-between text-xs text-[#767881]">
        <span>4 Active Defect Classes</span>
        <span className="font-mono text-[11px] text-[#A1A1AA]">
          {total > 0 ? `${total.toLocaleString()} total defects logged` : 'No defects recorded'}
        </span>
      </div>
    </div>
  );
}

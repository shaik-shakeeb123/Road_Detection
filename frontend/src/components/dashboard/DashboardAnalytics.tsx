import DetectionTrendChart from './DetectionTrendChart';
import CategoryDistribution from './CategoryDistribution';
import type { DashboardResponse } from '@/types/api';

interface DashboardAnalyticsProps {
  data: DashboardResponse;
}

export default function DashboardAnalytics({ data }: DashboardAnalyticsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6 items-stretch">
      {/* Left Column: Trend Analytics (8 cols / ~66%) */}
      <div className="lg:col-span-8">
        <DetectionTrendChart data={data} />
      </div>

      {/* Right Column: Category Distribution (4 cols / ~34%) */}
      <div className="lg:col-span-4">
        <CategoryDistribution data={data} />
      </div>
    </div>
  );
}

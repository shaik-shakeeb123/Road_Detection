import KpiCard from './KpiCard';
import type { DashboardResponse } from '@/types/api';

interface DashboardKpiGridProps {
  data: DashboardResponse;
}

export default function DashboardKpiGrid({ data }: DashboardKpiGridProps) {
  const totalInspections = data.total_inspections;
  const totalDetections = data.total_detections;
  const d40Count = data.class_counts.D40 ?? 0;
  const crackCount =
    (data.class_counts.D00 ?? 0) +
    (data.class_counts.D10 ?? 0) +
    (data.class_counts.D20 ?? 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      {/* 1. Total Inspections */}
      <div>
        <KpiCard
          title="Total Inspections"
          value={totalInspections}
          description="Total number of inspections performed."
          icon="fact_check"
          iconColor="#E0EA6C"
        />
      </div>

      {/* 2. Total Detections */}
      <div>
        <KpiCard
          title="Total Detections"
          value={totalDetections}
          description="Total defects detected in completed inspections."
          icon="radar"
          iconColor="#6989FF"
        />
      </div>

      {/* 3. Potholes Detected */}
      <div>
        <KpiCard
          title="Potholes Detected"
          value={d40Count}
          description="Total D40 detections."
          icon="warning"
          iconColor="#FF5C5C"
        />
      </div>

      {/* 4. Crack Detections */}
      <div>
        <KpiCard
          title="Crack Detections"
          value={crackCount}
          description="Combined D00, D10 and D20 detections."
          icon="broken_image"
          iconColor="#38BDF8"
        />
      </div>
    </div>
  );
}

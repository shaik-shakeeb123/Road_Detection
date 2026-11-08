import { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { dashboardService } from '@/services/dashboardService';
import type { DashboardResponse } from '@/types/api';
import type { BackendStatus } from '@/hooks/useBackendStatus';

import DashboardHeader from '@/components/dashboard/DashboardHeader';
import DashboardKpiGrid from '@/components/dashboard/DashboardKpiGrid';
import DashboardAnalytics from '@/components/dashboard/DashboardAnalytics';
import RecentInspectionActivity from '@/components/dashboard/RecentInspectionActivity';
import LoadingSkeleton from '@/components/common/LoadingSkeleton';
import ErrorState from '@/components/common/ErrorState';
import EmptyState from '@/components/common/EmptyState';

// Persistent in-memory cache to prevent blank flashes and layout shifts during navigation
let dashboardCache: DashboardResponse | null = null;

export default function DashboardPage() {
  usePageTitle('Dashboard');
  const backendStatus = useOutletContext<BackendStatus>();

  const [data, setData] = useState<DashboardResponse | null>(dashboardCache);
  const [loading, setLoading] = useState<boolean>(!dashboardCache);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(() => {
    if (!dashboardCache) {
      setLoading(true);
    }
    setError(null);
    const controller = new AbortController();

    dashboardService
      .getDashboard(controller.signal)
      .then((res) => {
        dashboardCache = res;
        setData(res);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Unable to connect to RoadVision dashboard API');
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const abortFn = fetchDashboard();
    return () => {
      if (abortFn) abortFn();
    };
  }, [fetchDashboard]);

  // If backend is unavailable according to root health check
  if (backendStatus.connection === 'unavailable') {
    return (
      <ErrorState
        title="Local Engine Offline"
        message="Unable to establish loopback HTTP connection with the RoadVision FastAPI server on http://127.0.0.1:8000."
        onRetry={() => {
          backendStatus.refresh();
          fetchDashboard();
        }}
      />
    );
  }

  // Loading Skeleton
  if (loading && !data) {
    return <LoadingSkeleton />;
  }

  // Error State
  if (error && !data) {
    return (
      <ErrorState
        title="Dashboard Telemetry Error"
        message={error}
        onRetry={fetchDashboard}
      />
    );
  }

  // Empty State if no response
  if (!data) {
    return (
      <EmptyState
        title="Telemetry Data Empty"
        description="The dashboard snapshot could not be retrieved from the local engine."
        action={
          <button
            onClick={fetchDashboard}
            className="px-4 py-2 rounded-lg bg-[#E0EA6C] text-[#090A0F] font-bold text-xs"
          >
            Retry Connection
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Sub-Header: Screen Identity & Analytical Telemetry Status */}
      <DashboardHeader
        modelStatus={data.model_status || backendStatus.modelStatus}
        backendConnected={backendStatus.connection === 'connected'}
      />

      {/* 2. Top Ribbon: 4 Precision KPI Cards */}
      <DashboardKpiGrid data={data} />

      {/* 3. Primary Analytical Grid: Main Trend Chart + Category Distribution */}
      <DashboardAnalytics data={data} />

      {/* 4. Bottom Section: Recent Inspection Activity Table */}
      <RecentInspectionActivity inspections={data.recent_inspections || []} />
    </div>
  );
}

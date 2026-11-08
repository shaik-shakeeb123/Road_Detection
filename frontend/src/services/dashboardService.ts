import { apiClient } from './apiClient';
import type { DashboardResponse } from '@/types/api';

export const dashboardService = {
  getDashboard(signal?: AbortSignal): Promise<DashboardResponse> {
    return apiClient.get<DashboardResponse>('/dashboard', signal);
  },
};

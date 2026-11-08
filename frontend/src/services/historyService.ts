import { apiClient } from './apiClient';
import type { InspectionListResponse, InspectionStatusResponse } from '@/types/api';

export const historyService = {
  listInspections(limit = 20, offset = 0, signal?: AbortSignal): Promise<InspectionListResponse> {
    return apiClient.get<InspectionListResponse>(`/history?limit=${limit}&offset=${offset}`, signal);
  },

  getInspection(id: number, signal?: AbortSignal): Promise<InspectionStatusResponse> {
    return apiClient.get<InspectionStatusResponse>(`/history/${id}`, signal);
  },

  deleteInspection(id: number, signal?: AbortSignal): Promise<void> {
    return apiClient.delete(`/history/${id}`, signal);
  },

  cancelVideoJob(id: number, signal?: AbortSignal): Promise<{ inspection_id: number; status: string }> {
    return apiClient.post<{ inspection_id: number; status: string }>(`/history/${id}/cancel`, undefined, signal);
  },
};

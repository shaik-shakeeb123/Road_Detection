import { apiClient } from './apiClient';

export interface CameraActionResponse {
  inspection_id: number;
  status: string;
}

export const cameraService = {
  startCamera(cameraIndex?: number, confidence?: number, signal?: AbortSignal): Promise<CameraActionResponse> {
    const params = new URLSearchParams();
    if (cameraIndex != null) params.set('camera_index', String(cameraIndex));
    if (confidence != null) params.set('confidence', String(confidence));
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiClient.post<CameraActionResponse>(`/camera/start${query}`, undefined, signal);
  },

  stopCamera(signal?: AbortSignal): Promise<CameraActionResponse> {
    return apiClient.post<CameraActionResponse>('/camera/stop', undefined, signal);
  },

  streamUrl(): string {
    return apiClient.cameraStreamUrl();
  },
};

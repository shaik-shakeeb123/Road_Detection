import { apiClient } from './apiClient';

export interface VideoSubmitResponse {
  inspection_id: number;
  status: string;
}

export const videoService = {
  submitVideo(file: File, confidence?: number, signal?: AbortSignal): Promise<VideoSubmitResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const query = confidence != null ? `?confidence=${confidence}` : '';
    return apiClient.postFormData<VideoSubmitResponse>(`/detect/video${query}`, formData, signal);
  },
};

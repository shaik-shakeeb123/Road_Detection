import { apiClient } from './apiClient';
import type { ImageDetectionResponse } from '@/types/api';

export const imageService = {
  detectImage(file: File, confidence?: number, signal?: AbortSignal): Promise<ImageDetectionResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const query = confidence != null ? `?confidence=${confidence}` : '';
    return apiClient.postFormData<ImageDetectionResponse>(`/detect/image${query}`, formData, signal);
  },
};

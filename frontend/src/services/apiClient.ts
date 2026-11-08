import type { ApiErrorResponse } from '@/types/api';

const BASE_URL = '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let code = 'unknown_error';
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as ApiErrorResponse;
      if (body?.error) {
        code = body.error.code;
        message = body.error.message;
      }
    } catch {
      // response body wasn't JSON
    }
    throw new ApiError(response.status, code, message);
  }
  return response.json() as Promise<T>;
}

export const apiClient = {
  async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, { signal });
    return handleResponse<T>(response);
  },

  async post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    return handleResponse<T>(response);
  },

  async postFormData<T>(path: string, formData: FormData, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      body: formData,
      signal,
    });
    return handleResponse<T>(response);
  },

  async delete(path: string, signal?: AbortSignal): Promise<void> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'DELETE',
      signal,
    });
    if (!response.ok && response.status !== 204) {
      let code = 'unknown_error';
      let message = `Delete failed with status ${response.status}`;
      try {
        const body = (await response.json()) as ApiErrorResponse;
        if (body?.error) {
          code = body.error.code;
          message = body.error.message;
        }
      } catch {
        // response body wasn't JSON
      }
      throw new ApiError(response.status, code, message);
    }
  },

  /** Returns the full URL for a result asset (image/video). */
  resultUrl(path: string): string {
    return path.startsWith('/') ? path : `${BASE_URL}/results/${path}`;
  },

  /** Returns the MJPEG camera stream URL. */
  cameraStreamUrl(): string {
    return `${BASE_URL}/camera/stream`;
  },
};

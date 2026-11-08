import { useState, useEffect, useCallback } from 'react';
import type { HealthResponse, ModelStatusResponse } from '@/types/api';
import { apiClient } from '@/services/apiClient';

export type ConnectionStatus = 'checking' | 'connected' | 'unavailable';

export interface BackendStatus {
  connection: ConnectionStatus;
  health: HealthResponse | null;
  modelStatus: ModelStatusResponse | null;
  refresh: () => void;
}

export function useBackendStatus(pollIntervalMs = 30_000): BackendStatus {
  const [connection, setConnection] = useState<ConnectionStatus>('checking');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatusResponse | null>(null);

  const check = useCallback(async () => {
    setConnection('checking');
    try {
      const healthData = await apiClient.get<HealthResponse>('/health');
      setHealth(healthData);
      setConnection('connected');

      try {
        const modelData = await apiClient.get<ModelStatusResponse>('/model/status');
        setModelStatus(modelData);
      } catch {
        setModelStatus(null);
      }
    } catch {
      setConnection('unavailable');
      setHealth(null);
      setModelStatus(null);
    }
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, pollIntervalMs);
    return () => clearInterval(interval);
  }, [check, pollIntervalMs]);

  return { connection, health, modelStatus, refresh: check };
}

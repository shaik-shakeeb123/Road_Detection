import { ClassCounts } from './detection';

/** Matches backend HealthResponse */
export interface HealthResponse {
  status: string;
  service: string;
}

/** Matches backend ModelStatusResponse */
export interface ModelStatusResponse {
  primary_model: string;
  fallback_model: string;
  active_model: string | null;
  primary_loaded: boolean;
  fallback_loaded: boolean;
  fallback_active: boolean;
  initialization_errors: Record<string, string>;
  available: boolean;
}

/** Matches backend DetectionResponse */
export interface DetectionResponse {
  class_id: number;
  class_name: string;
  confidence: number;
  box: number[];
}

/** Matches backend ImageDetectionResponse */
export interface ImageDetectionResponse {
  inspection_id: number;
  status: string;
  model: string;
  total_detections: number;
  class_counts: ClassCounts;
  detections: DetectionResponse[];
  processing_time: number;
  annotated_image_url: string;
}

/** Matches backend InspectionStatusResponse */
export interface InspectionStatusResponse {
  id: number;
  created_at: string;
  finished_at: string | null;
  input_type: string;
  filename: string | null;
  models_used: string | null;
  conf_threshold: number | null;
  total_detections: number;
  class_summary: ClassCounts;
  frames_total: number | null;
  frames_processed: number;
  frames_with_detections: number;
  processing_ms: number | null;
  output_url: string | null;
  status: string;
  error_message: string | null;
}

/** Matches backend InspectionListResponse */
export interface InspectionListResponse {
  items: InspectionStatusResponse[];
  limit: number;
  offset: number;
}

/** Matches backend DashboardResponse */
export interface DashboardResponse {
  total_inspections: number;
  total_detections: number;
  class_counts: ClassCounts;
  recent_inspections: InspectionStatusResponse[];
  model_status: ModelStatusResponse;
}

/** Backend API error envelope: { error: { code, message } } */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

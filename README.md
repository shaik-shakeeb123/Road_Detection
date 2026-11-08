# RoadVision

RoadVision is a local-only academic road-damage detection application. It is designed to accept images, recorded videos, and a locally connected webcam, then persist inspection metadata in SQLite and annotated media in managed local storage.

## Current implementation status

Milestones 1 through 6 are implemented and verified. The backend now has the FastAPI foundation, image/video/webcam detection workflows, SQLite WAL persistence, secure managed outputs, complete inspection history retrieval and deletion, and a read-only dashboard statistics API.

There are still no trained YOLO weights or Ram inference modules in this repository. Production image, video, and webcam starts therefore return `503 model_unavailable` after validation and record a failed inspection. The successful inference tests use explicitly test-only mock providers and do not represent YOLO predictions.

## Project layout

```
backend/
  app/
    api/routes/       # HTTP routes
    database/         # SQLite schema and short-lived connections
    services/         # model, image, video, camera, FFmpeg, file, and inference-boundary services
    config.py         # limits, paths, class definitions
    main.py           # application factory and lifecycle
  tests/
data/                 # generated at runtime: database, uploads, outputs, logs
weights/              # supplied separately; never commit trained checkpoints
```

## Prerequisites

Use Python 3.11 on Windows 11 for the target application. The backend dependencies include FastAPI, Uvicorn, Pydantic, HTTPX, pytest, Pillow, OpenCV, and `python-multipart`. The supplied environment currently has no RoadVision weights or Ram inference package, so real detection cannot be operational yet.

Before model integration, install a CUDA-capable PyTorch build that supports the project GPU, then install the agreed Ultralytics, NumPy, OpenCV, Pillow, and imageio-ffmpeg versions. Run the TDD's Day-1 GPU gate before treating either model as usable.

`imageio-ffmpeg` supplies the local FFmpeg executable used for video output. RoadVision checks the executable and its `libx264` encoder before accepting a video job. The generated MP4 uses H.264, `yuv420p`, and `faststart` for browser playback.

## Setup and run

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/docs` for interactive API documentation. The backend intentionally binds to loopback only.

## Model integration contract

Place validated four-class RoadVision checkpoints at `weights/yolo26m/best.pt` and `weights/yolo26n/best.pt`. Each model must expose class names in this exact order: `D00`, `D10`, `D20`, `D40`. At startup the model manager verifies the checkpoint, class mapping, and a warm-up inference. A model is only reported available after those checks succeed.

The service boundary is `backend/app/services/model_manager.py`, which implements the `ImageInferenceProvider` contract in `backend/app/services/inference_service.py`. API routes never load or call YOLO directly.

## Image API

`POST /api/detect/image?confidence=0.25` accepts one multipart field named `file`. It accepts JPG, JPEG, and PNG only, streams uploads with a 20 MB cap, validates the actual encoded content, rejects images longer than 8192 pixels on either side, and accepts a confidence value from 0.10 to 0.90. The default is 0.25.

On success, the response contains the inspection ID, completed status, model, total detections, all four `D00`/`D10`/`D20`/`D40` counts, original-image-pixel `box` coordinates, processing time in seconds, and a managed annotated-image URL. `GET /api/results/{generated-name}` serves only generated JPEG/MP4 output names and rejects traversal attempts.

## Video API

`POST /api/detect/video?confidence=0.25` accepts one multipart field named `file`. It accepts MP4 and AVI files that OpenCV can actually decode, streams uploads with a 200 MB cap, and enforces a 60-second and 1920 x 1080 limit. It returns `202 Accepted` with an inspection ID; it does not wait for processing to finish.

Poll `GET /api/history/{inspection_id}` for `queued`, `processing`, `completed`, `failed`, or `cancelled` status plus frame progress and summaries. Use `POST /api/history/{inspection_id}/cancel` to request safe cancellation of an active job. There is one shared slot for a video job or future webcam session, so a competing request returns `409 busy`.

If a validated primary model fails during a video job and a validated fallback exists, the partial output is discarded and the job restarts once from frame zero on the fallback. A completed output therefore never mixes model predictions.

## Live Camera API

`POST /api/camera/start?camera_index=0&confidence=0.25` opens a webcam or USB camera on the backend machine (DirectShow on Windows) and starts an aggregated webcam inspection. `GET /api/camera/stream` returns an annotated MJPEG stream for an `<img>` element. `POST /api/camera/stop` releases the camera and finalizes the inspection summary.

The session automatically ends after 10 minutes, or after roughly 10 seconds without a stream consumer. Only one video job or webcam session can run at once. Camera frames remain in memory only; RoadVision persists aggregate counts, model use, timing, final status, and any concise error message. During a real model session, sustained live FPS below the configured threshold can activate the validated YOLO26n fallback (F5).

## Inspection History API

`GET /api/history?limit=20&offset=0` returns a newest-first page of persisted image, video, and webcam inspections. `limit` is 1-100 and `offset` is zero or greater, as specified in the TDD. Each item contains its stored status, model, threshold, four-class summary, frame statistics where applicable, and a managed output URL when an image/video result exists.

`GET /api/history/{inspection_id}` supports video progress polling as before and retrieves every inspection type. `DELETE /api/history/{inspection_id}` deletes inactive metadata and its validated managed output. Active records return `409` to prevent deleting an output still in use by a worker. If output cleanup fails, metadata is preserved and the API returns a structured error.

## Dashboard Statistics API

`GET /api/dashboard` returns a read-only snapshot with this structure:

```json
{
  "total_inspections": 0,
  "total_detections": 0,
  "class_counts": {"D00": 0, "D10": 0, "D20": 0, "D40": 0},
  "recent_inspections": [],
  "model_status": {
    "primary_model": "YOLO26m",
    "fallback_model": "YOLO26n",
    "active_model": null,
    "primary_loaded": false,
    "fallback_loaded": false,
    "fallback_active": false,
    "initialization_errors": {},
    "available": false
  }
}
```

`total_inspections` counts all persisted sessions. Detection and class totals include completed inspections only, so failed or in-progress sessions are not presented as successful results. The endpoint reads totals in SQLite, normalizes legacy or incomplete class-summary JSON to all four codes, returns the five most recent records in the same newest-first order as history, and reports the model manager's validated state. It remains available when neither model can be used.

## Tests

```powershell
$env:PYTHONPATH = (Resolve-Path backend)
python -m pytest backend\tests -q
```

The tests do not require a GPU, Ultralytics, checkpoints, or a physical camera. They verify foundation behaviour, mock-isolated image/video/camera workflows, history paging/retrieval/deletion, managed-output cleanup and failure safety, SQLite-backed dashboard totals/class aggregation/recent records, mock-only dashboard model states, validation failures, polling/progress, cancellation, concurrency conflicts, webcam watchdog and duration cleanup, aggregate persistence, resource release, model-unavailable behaviour, inference failures, FFmpeg failures, and a real local H.264 FFmpeg smoke encode. Physical webcam/USB-camera and real-model performance require manual verification on the target Windows laptop.

## Frontend (Milestone F1 Foundation)

The frontend is a modern React + TypeScript single-page application built with Vite, Tailwind CSS, React Router v6, Framer Motion, and Chart.js.

### Frontend directory structure

```
frontend/
├── public/              # Static assets (Vite SVG icon)
├── src/
│   ├── app/             # Application entry and React Router setup
│   ├── components/
│   │   ├── common/      # EmptyState, ErrorState, LoadingState, StatusBadge
│   │   └── layout/      # AppLayout, Header, PageContainer, Sidebar
│   ├── hooks/           # useBackendStatus, usePageTitle
│   ├── pages/           # DashboardPage, ImageDetectionPage, VideoDetectionPage, LiveCameraPage, HistoryPage
│   ├── services/        # Centralized apiClient, dashboardService, imageService, videoService, cameraService, historyService
│   ├── styles/          # Tailwind globals, glass-card utilities
│   ├── types/           # Pydantic-matched contracts (api, dashboard, detection, history)
│   └── main.tsx         # React DOM root
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts       # Reverse proxy /api to http://127.0.0.1:8000
```

### Frontend prerequisites and setup

Requires Node.js (v18+) and npm.

```powershell
cd frontend
npm install
```

### Running development server

Make sure the FastAPI backend is running on `127.0.0.1:8000`:

```powershell
cd frontend
npm run dev
```

Navigate to `http://127.0.0.1:5173`. Vite proxies all `/api/*` calls directly to the local FastAPI backend.

### TypeScript typecheck and production build

```powershell
cd frontend
npm run typecheck    # tsc --noEmit
npm run build        # tsc -b && vite build
```


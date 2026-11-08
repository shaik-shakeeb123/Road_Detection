import { useState, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { usePageTitle } from '@/hooks/usePageTitle';
import type { BackendStatus } from '@/hooks/useBackendStatus';
import { cameraService } from '@/services/cameraService';
import { historyService } from '@/services/historyService';
import { ApiError } from '@/services/apiClient';
import type { InspectionStatusResponse } from '@/types/api';
import { DAMAGE_CLASSES, type DamageClassCode } from '@/types/detection';
import {
  buttonTapMotion,
  fadeInVariants,
} from '@/utils/motion';

export default function LiveCameraPage() {
  usePageTitle('Live Camera');
  const backendStatus = useOutletContext<BackendStatus>();
  const shouldReduceMotion = useReducedMotion();
  const isModelAvailable = backendStatus.modelStatus?.available ?? false;

  // Stream state
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [inspectionId, setInspectionId] = useState<number | null>(null);
  const [cameraIndex, setCameraIndex] = useState<number>(0);
  const [confidence, setConfidence] = useState<number>(0.25);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<boolean>(false);
  const [sessionSeconds, setSessionSeconds] = useState<number>(0);
  const [inspectionData, setInspectionData] = useState<InspectionStatusResponse | null>(null);
  const [snapshotFlash, setSnapshotFlash] = useState<boolean>(false);

  const streamImgRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const telemetryPollRef = useRef<number | null>(null);

  const isStreamingRef = useRef<boolean>(false);
  isStreamingRef.current = isStreaming;

  // Session elapsed timer
  useEffect(() => {
    if (isStreaming) {
      setSessionSeconds(0);
      timerRef.current = window.setInterval(() => {
        setSessionSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isStreaming]);

  // Periodic telemetry polling
  useEffect(() => {
    if (isStreaming && inspectionId) {
      const poll = async () => {
        try {
          const data = await historyService.getInspection(inspectionId);
          setInspectionData(data);
          if (data.status === 'completed' || data.status === 'failed') {
            setIsStreaming(false);
          }
        } catch {
          // Ignore transient poll errors during active stream
        }
      };

      poll();
      telemetryPollRef.current = window.setInterval(poll, 2000);
    } else {
      if (telemetryPollRef.current) {
        clearInterval(telemetryPollRef.current);
        telemetryPollRef.current = null;
      }
    }

    return () => {
      if (telemetryPollRef.current) {
        clearInterval(telemetryPollRef.current);
      }
    };
  }, [isStreaming, inspectionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isStreamingRef.current) {
        cameraService.stopCamera().catch(() => {});
      }
    };
  }, []);

  const handleStartCamera = async () => {
    setLoading(true);
    setError(null);
    setStreamError(false);

    try {
      const res = await cameraService.startCamera(cameraIndex, confidence);
      setInspectionId(res.inspection_id);
      setIsStreaming(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 503 || err.code === 'model_unavailable') {
          setError('AI Model Not Ready — Model checkpoint is missing. Live detection requires loaded model weights.');
        } else if (err.status === 409) {
          setError('Camera is already in use by another session or process.');
        } else {
          setError(err.message || 'Failed to start camera stream.');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Failed to connect to camera endpoint.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStopCamera = async () => {
    setLoading(true);
    try {
      await cameraService.stopCamera();
    } catch (err: unknown) {
      console.warn('Error during camera stop:', err);
    } finally {
      setIsStreaming(false);
      setLoading(false);
    }
  };

  const handleSnapshot = () => {
    if (!streamImgRef.current) return;
    try {
      // Trigger subtle shutter flash
      setSnapshotFlash(true);
      setTimeout(() => setSnapshotFlash(false), 220);

      const canvas = document.createElement('canvas');
      canvas.width = streamImgRef.current.naturalWidth || 1280;
      canvas.height = streamImgRef.current.naturalHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(streamImgRef.current, 0, 0, canvas.width, canvas.height);
        const link = document.createElement('a');
        link.download = `roadvision-camera-snap-${Date.now()}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.92);
        link.click();
      }
    } catch (e) {
      console.error('Failed to take snapshot:', e);
    }
  };

  const toggleFullscreen = () => {
    if (!viewportRef.current) return;
    if (!document.fullscreenElement) {
      viewportRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const formatTimer = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* 1. Sub-Header & Controls Ribbon */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#2B2D35]/60">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#F5F5F5] tracking-tight">Live Camera</h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors ${
                isStreaming
                  ? 'bg-[#FF5C5C]/15 text-[#FF5C5C] border-[#FF5C5C]/35'
                  : isModelAvailable
                  ? 'bg-[#E0EA6C]/10 text-[#E0EA6C] border-[#E0EA6C]/30'
                  : 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30'
              }`}
            >
              <span className="relative flex h-2 w-2">
                {isStreaming && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF5C5C] opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isStreaming ? 'bg-[#FF5C5C]' : isModelAvailable ? 'bg-[#E0EA6C]' : 'bg-[#F59E0B]'
                  }`}
                />
              </span>
              {isStreaming ? 'Stream Active' : isModelAvailable ? 'DirectShow Ready' : 'Model Offline'}
            </span>
          </div>
          <p className="text-xs text-[#767881] mt-1">
            Real-time DirectShow sensor feed capture with live defect inference overlay
          </p>
        </div>

        {/* Hardware & Confidence Controls */}
        <div className="flex flex-wrap items-center gap-3 self-start lg:self-auto shadow-sm">
          {/* Device Selector */}
          <div className="flex items-center gap-2 p-1.5 px-3 rounded-xl bg-[#18181C] border border-[#2B2D35] text-xs">
            <span className="material-symbols-outlined text-[16px] text-[#6989FF]">videocam</span>
            <select
              value={cameraIndex}
              onChange={(e) => setCameraIndex(parseInt(e.target.value, 10))}
              disabled={isStreaming || loading}
              className="bg-transparent text-[#F5F5F5] focus:outline-none cursor-pointer"
            >
              <option value="0" className="bg-[#18181C]">Camera Device 0 (Default)</option>
              <option value="1" className="bg-[#18181C]">Camera Device 1 (Secondary)</option>
              <option value="2" className="bg-[#18181C]">Camera Device 2 (Auxiliary)</option>
            </select>
          </div>

          {/* Confidence Slider */}
          <div className="flex items-center gap-2 p-1.5 px-3 rounded-xl bg-[#18181C] border border-[#2B2D35] text-xs">
            <span className="text-[#767881]">Gate:</span>
            <input
              type="range"
              min="0.10"
              max="0.90"
              step="0.05"
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              disabled={isStreaming || loading}
              className="w-20 h-1.5 bg-[#14151B] rounded appearance-none cursor-pointer accent-[#E0EA6C] focus-visible:ring-2 focus-visible:ring-[#E0EA6C]/40"
            />
            <span className="font-mono font-bold text-[#E0EA6C]">{confidence.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Model Warning Banner */}
      {!isModelAvailable && backendStatus.connection === 'connected' && (
        <div className="p-4 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/25 flex items-start gap-3 text-xs">
          <span className="material-symbols-outlined text-[#F59E0B] text-[20px] shrink-0 mt-0.5">
            warning
          </span>
          <div className="space-y-1">
            <p className="font-semibold text-[#F59E0B]">AI Inference Checkpoint Unavailable</p>
            <p className="text-[#A1A1AA] leading-relaxed">
              Real-time camera detection requires loaded model weights. Starting a stream without weights will return{' '}
              <code className="text-[#F5F5F5] font-mono">503 model_unavailable</code>.
            </p>
          </div>
        </div>
      )}

      {/* Error Alert */}
      <AnimatePresence>
        {error && (
          <motion.div
            variants={shouldReduceMotion ? undefined : fadeInVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="p-4 rounded-xl bg-[#FF5C5C]/10 border border-[#FF5C5C]/30 flex items-start justify-between gap-3 text-xs text-[#FF5C5C]"
          >
            <div className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[20px] shrink-0">error</span>
              <div>
                <p className="font-semibold">Stream Error</p>
                <p className="text-[#A1A1AA] mt-0.5">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-[#767881] hover:text-[#F5F5F5] p-1 rounded transition-colors focus-visible:ring-2 focus-visible:ring-[#FF5C5C]/40"
              title="Dismiss error"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Main Live Grid: Monitor (8 cols) & Telemetry (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Live Stream Monitor Shell (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div
            ref={viewportRef}
            className="rounded-xl bg-[#18181C] border border-[#2B2D35] overflow-hidden flex flex-col relative group shadow-sm"
          >
            {/* Viewport Monitor Area */}
            <div className="relative w-full aspect-video bg-[#0E0E12] flex items-center justify-center overflow-hidden select-none">
              {/* Shutter flash feedback on snapshot */}
              {snapshotFlash && (
                <div className="absolute inset-0 bg-white/25 pointer-events-none z-30 transition-opacity duration-200" />
              )}

              {isStreaming ? (
                <>
                  {/* Live MJPEG Stream Element */}
                  <img
                    ref={streamImgRef}
                    src={cameraService.streamUrl()}
                    alt="Live Road Monitoring Stream"
                    className="w-full h-full object-contain"
                    onError={() => setStreamError(true)}
                  />

                  {streamError && (
                    <div className="absolute inset-0 bg-[#0E0E12]/95 flex flex-col items-center justify-center p-6 text-center z-20">
                      <span className="material-symbols-outlined text-[#FF5C5C] text-[36px] mb-2">
                        videocam_off
                      </span>
                      <p className="text-sm font-bold text-[#F5F5F5]">Camera Feed Interrupted</p>
                      <p className="text-xs text-[#767881] mt-1 max-w-sm">
                        Unable to receive video frames. Ensure the USB webcam is connected and not locked by another software.
                      </p>
                    </div>
                  )}

                  {/* HUD Top Bar Overlay */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FF5C5C]/90 text-white font-mono text-xs font-bold shadow-lg">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        LIVE • {formatTimer(sessionSeconds)}
                      </span>
                      <span className="px-2 py-1 rounded bg-[#090A0F]/80 backdrop-blur text-xs font-mono text-[#A1A1AA]">
                        DirectShow #{cameraIndex}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pointer-events-auto">
                      <motion.button
                        type="button"
                        whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                        onClick={toggleFullscreen}
                        className="p-1.5 rounded bg-[#090A0F]/80 hover:bg-[#090A0F] text-[#A1A1AA] hover:text-[#F5F5F5] transition-colors focus-visible:ring-2 focus-visible:ring-[#6989FF]/40"
                        title="Toggle Fullscreen"
                      >
                        <span className="material-symbols-outlined text-[18px]">fullscreen</span>
                      </motion.button>
                    </div>
                  </div>
                </>
              ) : (
                /* Offline Camera Monitor Placeholder */
                <div className="flex flex-col items-center justify-center p-8 text-center max-w-sm">
                  <div className="w-14 h-14 rounded-2xl bg-[#14151B] border border-[#2B2D35] flex items-center justify-center text-[#767881] mb-3 shadow-inner">
                    <span className="material-symbols-outlined text-[28px]">videocam</span>
                  </div>
                  <h3 className="text-sm font-bold text-[#F5F5F5] mb-1">Camera Stream Inactive</h3>
                  <p className="text-xs text-[#767881] leading-relaxed">
                    Connect to the local video capture device to stream live road imagery with neural bounding box overlays.
                  </p>
                </div>
              )}
            </div>

            {/* Action Bar Footer */}
            <div className="flex flex-wrap items-center justify-between p-3 px-4 bg-[#14151B] border-t border-[#2B2D35] gap-3">
              <div className="flex items-center gap-2">
                {!isStreaming ? (
                  <motion.button
                    type="button"
                    whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                    onClick={handleStartCamera}
                    disabled={loading}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#E0EA6C] hover:brightness-105 text-[#090A0F] font-bold text-xs transition-all disabled:opacity-40 shadow-[0_0_12px_rgba(224,234,108,0.2)] focus-visible:ring-2 focus-visible:ring-[#E0EA6C]/60"
                  >
                    {loading ? (
                      <>
                        <span className="animate-spin h-3.5 w-3.5 border-2 border-[#090A0F] border-t-transparent rounded-full" />
                        <span>Starting Stream...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">play_circle</span>
                        <span>Start Camera Stream</span>
                      </>
                    )}
                  </motion.button>
                ) : (
                  <motion.button
                    type="button"
                    whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                    onClick={handleStopCamera}
                    disabled={loading}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#FF5C5C] hover:bg-[#ff4545] text-white font-bold text-xs transition-all shadow-[0_0_12px_rgba(255,92,92,0.2)] focus-visible:ring-2 focus-visible:ring-[#FF5C5C]/60"
                  >
                    {loading ? (
                      <>
                        <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                        <span>Stopping Stream...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">stop_circle</span>
                        <span>Stop Camera</span>
                      </>
                    )}
                  </motion.button>
                )}

                {isStreaming && (
                  <motion.button
                    type="button"
                    whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                    onClick={handleSnapshot}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#18181C] hover:bg-[#202127] border border-[#2B2D35] text-xs font-semibold text-[#F5F5F5] transition-colors focus-visible:ring-2 focus-visible:ring-[#6989FF]/40"
                  >
                    <span className="material-symbols-outlined text-[16px]">camera_enhance</span>
                    <span>Snapshot Frame</span>
                  </motion.button>
                )}
              </div>

              {/* Stream Specs */}
              <div className="flex items-center gap-3 text-xs font-mono text-[#767881]">
                <span>Status: <strong className={isStreaming ? 'text-[#E0EA6C]' : 'text-[#767881]'}>{isStreaming ? 'Active' : 'Standby'}</strong></span>
                <span>Max: 10m session</span>
              </div>
            </div>
          </div>

          {/* Device Safety Card */}
          <div className="p-4 rounded-xl bg-[#18181C] border border-[#2B2D35] flex items-start gap-3 text-xs text-[#767881]">
            <span className="material-symbols-outlined text-[20px] text-[#6989FF] shrink-0 mt-0.5">
              shield
            </span>
            <div className="space-y-1 leading-relaxed">
              <p className="font-semibold text-[#F5F5F5]">Continuous Local Screening Safety</p>
              <p>
                The camera stream automatically terminates after 10 minutes to protect host hardware and prevent unattended recording. You can restart sessions at any time.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Live Telemetry Rail (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Live Session Overview */}
          <div className="p-5 rounded-xl bg-[#18181C] border border-[#2B2D35] flex flex-col shadow-sm">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#2B2D35]/70">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-[#6989FF]">sensors</span>
                <h2 className="text-base font-bold text-[#F5F5F5]">Stream Telemetry</h2>
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#14151B] border border-[#2B2D35] text-[#A1A1AA]">
                {inspectionId ? `#INSP-${inspectionId}` : 'DISCONNECTED'}
              </span>
            </div>

            {/* Top KPI Numbers */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-[#14151B] border border-[#2B2D35] flex flex-col transition-colors hover:border-[#3E424E]">
                <span className="text-[11px] font-mono uppercase text-[#767881]">Session Hits</span>
                <span className="text-2xl font-bold font-mono text-[#E0EA6C] mt-1">
                  {inspectionData ? inspectionData.total_detections : '—'}
                </span>
                <span className="text-[10px] text-[#767881] mt-0.5">Defects logged</span>
              </div>

              <div className="p-3 rounded-lg bg-[#14151B] border border-[#2B2D35] flex flex-col transition-colors hover:border-[#3E424E]">
                <span className="text-[11px] font-mono uppercase text-[#767881]">Frames</span>
                <span className="text-2xl font-bold font-mono text-[#6989FF] mt-1">
                  {inspectionData ? inspectionData.frames_processed : '—'}
                </span>
                <span className="text-[10px] text-[#767881] mt-0.5">Frames analyzed</span>
              </div>
            </div>

            {/* Stream Specs */}
            <div className="p-3 rounded-lg bg-[#14151B] border border-[#2B2D35] text-xs font-mono space-y-2 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-[#767881]">Elapsed Time:</span>
                <span className="text-[#F5F5F5]">{isStreaming ? formatTimer(sessionSeconds) : '00:00'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#767881]">Input Source:</span>
                <span className="text-[#F5F5F5]">DirectShow Camera #{cameraIndex}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#767881]">Defect Frames:</span>
                <span className="text-[#E0EA6C] font-semibold">
                  {inspectionData ? inspectionData.frames_with_detections : '—'}
                </span>
              </div>
            </div>

            {/* 4 Damage Class Counters */}
            <div className="pt-3 border-t border-[#2B2D35]/70">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#767881] block mb-3 font-bold">
                Classified Anomalies
              </span>

              <div className="grid grid-cols-2 gap-2">
                {(['D00', 'D10', 'D20', 'D40'] as DamageClassCode[]).map((code) => {
                  const count = inspectionData?.class_summary?.[code] ?? 0;
                  const meta = DAMAGE_CLASSES[code];

                  return (
                    <div
                      key={code}
                      className="p-2.5 rounded-lg bg-[#14151B] border border-[#2B2D35] flex items-center justify-between transition-colors hover:border-[#3E424E]"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold"
                          style={{
                            backgroundColor: meta.bgColor,
                            color: meta.color,
                            border: `1px solid ${meta.borderColor}`,
                          }}
                        >
                          {code}
                        </span>
                        <span className="text-xs text-[#A1A1AA] truncate">{meta.shortLabel}</span>
                      </div>
                      <span className="font-mono text-sm font-bold text-[#F5F5F5]">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

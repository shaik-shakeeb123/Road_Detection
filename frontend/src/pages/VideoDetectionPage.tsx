import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { usePageTitle } from '@/hooks/usePageTitle';
import type { BackendStatus } from '@/hooks/useBackendStatus';
import { videoService } from '@/services/videoService';
import { historyService } from '@/services/historyService';
import { apiClient, ApiError } from '@/services/apiClient';
import type { InspectionStatusResponse } from '@/types/api';
import { DAMAGE_CLASSES, type DamageClassCode } from '@/types/detection';
import StatusBadge from '@/components/common/StatusBadge';
import {
  buttonTapMotion,
  fadeInVariants,
} from '@/utils/motion';

export default function VideoDetectionPage() {
  usePageTitle('Video Inspection');
  const backendStatus = useOutletContext<BackendStatus>();
  const shouldReduceMotion = useReducedMotion();
  const isModelAvailable = backendStatus.modelStatus?.available ?? false;

  // File and inspection state
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number>(0.25);
  const [inspectionId, setInspectionId] = useState<number | null>(null);
  const [jobStatus, setJobStatus] = useState<InspectionStatusResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'annotated' | 'original'>('annotated');
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingTimerRef = useRef<number | null>(null);

  // Clean up object URLs and polling timers
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
    };
  }, [previewUrl]);

  // Polling effect for active video jobs
  useEffect(() => {
    if (!inspectionId) return;

    const terminalStatuses = ['completed', 'failed', 'cancelled'];

    const pollStatus = async () => {
      try {
        const status = await historyService.getInspection(inspectionId);
        setJobStatus(status);

        if (terminalStatuses.includes(status.status.toLowerCase())) {
          if (pollingTimerRef.current) {
            clearInterval(pollingTimerRef.current);
            pollingTimerRef.current = null;
          }
          if (status.status === 'completed') {
            setActiveTab('annotated');
          }
        }
      } catch (err: unknown) {
        console.error('Video status poll failed:', err);
      }
    };

    pollStatus();
    pollingTimerRef.current = window.setInterval(pollStatus, 1500);

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [inspectionId]);

  const handleFileSelect = (selectedFile: File) => {
    const validExtensions = ['video/mp4', 'video/avi', 'video/x-msvideo'];
    if (!validExtensions.includes(selectedFile.type) && !/\.(mp4|avi)$/i.test(selectedFile.name)) {
      setError('Invalid file format. Please upload an MP4 or AVI video.');
      return;
    }

    if (selectedFile.size > 200 * 1024 * 1024) {
      setError('File size exceeds the 200MB limit.');
      return;
    }

    setError(null);
    setJobStatus(null);
    setInspectionId(null);
    setActiveTab('annotated');

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const url = URL.createObjectURL(selectedFile);
    setFile(selectedFile);
    setPreviewUrl(url);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const startInspection = async () => {
    if (!file) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await videoService.submitVideo(file, confidence);
      setInspectionId(res.inspection_id);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 503 || err.code === 'model_unavailable') {
          setError('AI Model Not Ready — Model checkpoint is missing. Video processing requires loaded weights.');
        } else {
          setError(err.message || 'Failed to submit video inspection job.');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Network error submitting video job.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelJob = async () => {
    if (!inspectionId) return;

    setIsCancelling(true);
    try {
      await historyService.cancelVideoJob(inspectionId);
      const updated = await historyService.getInspection(inspectionId);
      setJobStatus(updated);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to cancel video job.');
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const handleReset = () => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(null);
    setPreviewUrl(null);
    setInspectionId(null);
    setJobStatus(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const progressPercent = useMemo(() => {
    if (!jobStatus) return 0;
    if (jobStatus.status === 'completed') return 100;
    if (jobStatus.frames_total && jobStatus.frames_total > 0) {
      return Math.min(99, Math.round((jobStatus.frames_processed / jobStatus.frames_total) * 100));
    }
    return jobStatus.status === 'processing' ? 10 : 0;
  }, [jobStatus]);

  const isJobActive = jobStatus?.status === 'processing' || jobStatus?.status === 'queued';

  return (
    <div className="space-y-6">
      {/* 1. Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#2B2D35]/60">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#F5F5F5] tracking-tight">Video Inspection</h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors ${
                isJobActive
                  ? 'bg-[#6989FF]/10 text-[#6989FF] border-[#6989FF]/30'
                  : isModelAvailable
                  ? 'bg-[#E0EA6C]/10 text-[#E0EA6C] border-[#E0EA6C]/30'
                  : 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isJobActive ? 'bg-[#6989FF] animate-ping' : isModelAvailable ? 'bg-[#E0EA6C]' : 'bg-[#F59E0B]'
                }`}
              />
              {isJobActive
                ? 'Processing Video Stream'
                : isModelAvailable
                ? 'Batch Video Worker Ready'
                : 'Model Offline'}
            </span>
          </div>
          <p className="text-xs text-[#767881] mt-1">
            Submit recorded roadway video for asynchronous frame-by-frame defect inference and MP4 export
          </p>
        </div>

        {/* Confidence Threshold Slider */}
        <div className="flex flex-wrap items-center gap-4 p-2.5 px-4 rounded-xl bg-[#18181C] border border-[#2B2D35] self-start lg:self-auto shadow-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#6989FF]">tune</span>
            <span className="text-xs font-medium text-[#767881]">Confidence Gate</span>
          </div>

          <div className="flex items-center gap-3 min-w-[160px]">
            <input
              type="range"
              min="0.10"
              max="0.90"
              step="0.05"
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              disabled={isJobActive || isSubmitting}
              className="w-28 h-1.5 bg-[#14151B] rounded-lg appearance-none cursor-pointer accent-[#E0EA6C] focus-visible:ring-2 focus-visible:ring-[#E0EA6C]/40"
            />
            <span className="text-xs font-mono font-bold text-[#E0EA6C]">
              {confidence.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Model Unavailable Banner */}
      {!isModelAvailable && backendStatus.connection === 'connected' && (
        <div className="p-4 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/25 flex items-start gap-3 text-xs">
          <span className="material-symbols-outlined text-[#F59E0B] text-[20px] shrink-0 mt-0.5">
            warning
          </span>
          <div className="space-y-1">
            <p className="font-semibold text-[#F59E0B]">AI Inference Checkpoint Unavailable</p>
            <p className="text-[#A1A1AA] leading-relaxed">
              Video processing requires a validated YOLO model checkpoint. Jobs submitted without weights will return{' '}
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
                <p className="font-semibold">Inspection Error</p>
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

      {/* 2. Main Video Workspace Grid (8 cols Viewport + 4 cols Results) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Video Viewport & Controls (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="rounded-xl bg-[#18181C] border border-[#2B2D35] overflow-hidden flex flex-col shadow-sm">
            {/* Viewport Header */}
            <div className="flex items-center justify-between p-3 px-4 bg-[#14151B] border-b border-[#2B2D35]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#6989FF]">smart_display</span>
                <span className="text-xs font-bold text-[#F5F5F5]">
                  {jobStatus?.output_url && activeTab === 'annotated'
                    ? 'Annotated Video Output'
                    : file
                    ? 'Source Video Preview'
                    : 'Video Inspection Player'}
                </span>
              </div>

              {jobStatus?.output_url && (
                <div className="inline-flex p-0.5 rounded-lg bg-[#18181C] border border-[#2B2D35] text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveTab('annotated')}
                    className={`px-2.5 py-1 rounded-md transition-all ${
                      activeTab === 'annotated'
                        ? 'bg-[#E0EA6C] text-[#090A0F] font-bold shadow-xs'
                        : 'text-[#767881] hover:text-[#F5F5F5]'
                    }`}
                  >
                    Annotated
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('original')}
                    className={`px-2.5 py-1 rounded-md transition-all ${
                      activeTab === 'original'
                        ? 'bg-[#E0EA6C] text-[#090A0F] font-bold shadow-xs'
                        : 'text-[#767881] hover:text-[#F5F5F5]'
                    }`}
                  >
                    Original
                  </button>
                </div>
              )}
            </div>

            {/* Video Viewport Area */}
            <div
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={`relative w-full aspect-video bg-[#0E0E12] flex items-center justify-center overflow-hidden transition-colors duration-150 ${
                isDragging ? 'bg-[#6989FF]/5 ring-2 ring-inset ring-[#6989FF]/40' : ''
              }`}
            >
              {jobStatus?.output_url && activeTab === 'annotated' ? (
                <video
                  key={jobStatus.output_url}
                  src={apiClient.resultUrl(jobStatus.output_url)}
                  controls
                  className="w-full h-full object-contain"
                />
              ) : previewUrl ? (
                <video
                  key={previewUrl}
                  src={previewUrl}
                  controls
                  className="w-full h-full object-contain"
                />
              ) : (
                /* Empty Player Placeholder */
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-8 text-center cursor-pointer group max-w-sm"
                >
                  <div
                    className={`w-14 h-14 rounded-2xl bg-[#14151B] border transition-all duration-200 flex items-center justify-center mb-3 shadow-inner ${
                      isDragging
                        ? 'border-[#6989FF] text-[#6989FF] scale-110 shadow-[0_0_16px_rgba(105,137,255,0.25)]'
                        : 'border-[#2B2D35] text-[#767881] group-hover:border-[#6989FF]/40 group-hover:text-[#6989FF]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[28px]">video_file</span>
                  </div>
                  <h3 className="text-sm font-bold text-[#F5F5F5] mb-1">Select Road Survey Video</h3>
                  <p className="text-xs text-[#767881] leading-relaxed">
                    Drop an MP4 or AVI video file here or click to browse. Max 200MB, up to 60 seconds.
                  </p>
                </div>
              )}

              {/* Processing Progress Overlay */}
              <AnimatePresence>
                {isJobActive && (
                  <motion.div
                    variants={shouldReduceMotion ? undefined : fadeInVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center select-none z-10"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-[#14151B] border border-[#2B2D35] flex items-center justify-center text-[#6989FF] mb-4 relative shadow-2xl">
                      <span className="animate-spin h-8 w-8 border-2 border-[#6989FF] border-t-transparent rounded-full" />
                      <span className="material-symbols-outlined text-[20px] absolute">movie</span>
                    </div>

                    <h3 className="text-base font-bold text-[#F5F5F5] mb-1">
                      {jobStatus?.status === 'queued' ? 'Job Queued in Worker Slot' : 'Analyzing Video Frames'}
                    </h3>
                    <p className="text-xs text-[#767881] max-w-sm mb-4">
                      {jobStatus?.status === 'queued'
                        ? 'Waiting for video worker pipeline slot to become available...'
                        : `Processing frame ${jobStatus?.frames_processed ?? 0} of ${jobStatus?.frames_total ?? '—'} with YOLO defect detection.`}
                    </p>

                    {/* Progress Bar with smooth motion */}
                    <div className="w-64 max-w-full">
                      <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                        <span className="text-[#A1A1AA]">Progress</span>
                        <span className="text-[#E0EA6C] font-bold">{progressPercent}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#14151B] overflow-hidden border border-[#2B2D35]">
                        <motion.div
                          className="h-full rounded-full bg-[#E0EA6C]"
                          initial={false}
                          animate={{ width: `${progressPercent}%` }}
                          transition={
                            shouldReduceMotion
                              ? { duration: 0 }
                              : { duration: 0.4, ease: [0.16, 1, 0.3, 1] }
                          }
                        />
                      </div>
                    </div>

                    {/* Live Detection Tally */}
                    {jobStatus && (
                      <div className="mt-4 flex items-center gap-4 text-xs font-mono text-[#A1A1AA]">
                        <span>Detections: <strong className="text-[#F5F5F5]">{jobStatus.total_detections}</strong></span>
                        <span>Frames with defects: <strong className="text-[#6989FF]">{jobStatus.frames_with_detections}</strong></span>
                      </div>
                    )}

                    {/* Cancel Button */}
                    <motion.button
                      type="button"
                      whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                      onClick={cancelJob}
                      disabled={isCancelling}
                      className="mt-5 px-4 py-1.5 rounded-lg bg-[#FF5C5C]/15 hover:bg-[#FF5C5C]/25 text-[#FF5C5C] border border-[#FF5C5C]/30 text-xs font-semibold transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[#FF5C5C]/40"
                    >
                      {isCancelling ? 'Cancelling...' : 'Cancel Video Job'}
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Viewport Action Footer */}
            <div className="flex flex-wrap items-center justify-between p-3 px-4 bg-[#14151B] border-t border-[#2B2D35] gap-3">
              <div className="flex items-center gap-2">
                <motion.button
                  type="button"
                  whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                  onClick={startInspection}
                  disabled={!file || isJobActive || isSubmitting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E0EA6C] hover:brightness-105 text-[#090A0F] font-bold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_12px_rgba(224,234,108,0.2)] focus-visible:ring-2 focus-visible:ring-[#E0EA6C]/60"
                >
                  {isSubmitting ? (
                    <>
                      <span className="animate-spin h-3.5 w-3.5 border-2 border-[#090A0F] border-t-transparent rounded-full" />
                      <span>Submitting Video...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                      <span>Start Video Inspection</span>
                    </>
                  )}
                </motion.button>

                {jobStatus?.output_url && (
                  <motion.a
                    whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                    href={apiClient.resultUrl(jobStatus.output_url)}
                    download={`roadvision-annotated-${jobStatus.id}.mp4`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#18181C] hover:bg-[#202127] border border-[#2B2D35] text-xs font-semibold text-[#F5F5F5] transition-colors focus-visible:ring-2 focus-visible:ring-[#6989FF]/40"
                  >
                    <span className="material-symbols-outlined text-[16px]">file_download</span>
                    <span>Download Annotated MP4</span>
                  </motion.a>
                )}

                {file && !isJobActive && (
                  <motion.button
                    type="button"
                    whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                    onClick={handleReset}
                    className="p-2 rounded-lg bg-[#18181C] hover:bg-[#202127] border border-[#2B2D35] text-[#767881] hover:text-[#FF5C5C] transition-colors text-xs focus-visible:ring-2 focus-visible:ring-[#FF5C5C]/40"
                    title="Clear Video"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </motion.button>
                )}
              </div>

              {/* File Info */}
              {file && (
                <div className="flex items-center gap-3 text-xs font-mono text-[#767881]">
                  <span className="truncate max-w-[180px] text-[#A1A1AA]">{file.name}</span>
                  <span>{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                </div>
              )}
            </div>
          </div>

          {/* Upload Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`p-5 rounded-xl bg-[#18181C] border-2 border-dashed transition-all duration-200 cursor-pointer flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left ${
              isDragging
                ? 'border-[#6989FF] bg-[#6989FF]/5 shadow-[0_0_20px_rgba(105,137,255,0.15)]'
                : 'border-[#2B2D35] hover:border-[#6989FF]/60 hover:bg-[#14151B]/80'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,.avi,video/mp4,video/avi"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
            />
            <div className="flex items-center gap-3.5">
              <div
                className={`w-10 h-10 rounded-xl bg-[#14151B] border transition-colors flex items-center justify-center shrink-0 ${
                  isDragging ? 'border-[#6989FF] text-[#6989FF]' : 'border-[#2B2D35] text-[#6989FF]'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">movie_filter</span>
              </div>
              <div>
                <p className="text-xs font-bold text-[#F5F5F5]">
                  {file ? 'Replace Selected Video' : 'Drop video survey footage here'}
                </p>
                <p className="text-[11px] text-[#767881] mt-0.5">
                  MP4, AVI • Max 200MB • Up to 60 seconds duration
                </p>
              </div>
            </div>
            <motion.button
              type="button"
              whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
              className="px-3.5 py-1.5 rounded-lg bg-[#14151B] hover:bg-[#202127] border border-[#2B2D35] text-xs font-semibold text-[#F5F5F5] transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-[#6989FF]/40"
            >
              Browse Files
            </motion.button>
          </div>
        </div>

        {/* Right Column: Processing Status & Defect Breakdown (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Job Overview Card */}
          <div className="p-5 rounded-xl bg-[#18181C] border border-[#2B2D35] flex flex-col shadow-sm">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#2B2D35]/70">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-[#6989FF]">fact_check</span>
                <h2 className="text-base font-bold text-[#F5F5F5]">Job Telemetry</h2>
              </div>
              {jobStatus ? (
                <StatusBadge label={jobStatus.status} />
              ) : (
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#14151B] border border-[#2B2D35] text-[#767881]">
                  IDLE
                </span>
              )}
            </div>

            {/* 2-Column KPI Tiles */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-[#14151B] border border-[#2B2D35] flex flex-col transition-colors hover:border-[#3E424E]">
                <span className="text-[11px] font-mono uppercase text-[#767881]">Total Defects</span>
                <span className="text-2xl font-bold font-mono text-[#E0EA6C] mt-1">
                  {jobStatus ? jobStatus.total_detections : '—'}
                </span>
                <span className="text-[10px] text-[#767881] mt-0.5">Across all frames</span>
              </div>

              <div className="p-3 rounded-lg bg-[#14151B] border border-[#2B2D35] flex flex-col transition-colors hover:border-[#3E424E]">
                <span className="text-[11px] font-mono uppercase text-[#767881]">Defect Frames</span>
                <span className="text-2xl font-bold font-mono text-[#6989FF] mt-1">
                  {jobStatus ? jobStatus.frames_with_detections : '—'}
                </span>
                <span className="text-[10px] text-[#767881] mt-0.5">Frames with hits</span>
              </div>
            </div>

            {/* Detailed Pipeline Specs */}
            <div className="p-3 rounded-lg bg-[#14151B] border border-[#2B2D35] text-xs font-mono space-y-2 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-[#767881]">Inspection ID:</span>
                <span className="text-[#F5F5F5]">{jobStatus ? `#INSP-${jobStatus.id}` : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#767881]">Processed Frames:</span>
                <span className="text-[#F5F5F5]">
                  {jobStatus ? `${jobStatus.frames_processed} / ${jobStatus.frames_total ?? '—'}` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#767881]">Processing Time:</span>
                <span className="text-[#F5F5F5]">
                  {jobStatus?.processing_ms ? `${jobStatus.processing_ms}ms` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#767881]">Model:</span>
                <span className="text-[#F5F5F5]">{jobStatus?.models_used || 'YOLO26m'}</span>
              </div>
            </div>

            {/* 4 Damage Class Counts */}
            <div className="pt-3 border-t border-[#2B2D35]/70">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#767881] block mb-3 font-bold">
                Damage Breakdown
              </span>

              <div className="flex flex-col gap-2.5">
                {(['D00', 'D10', 'D20', 'D40'] as DamageClassCode[]).map((code) => {
                  const count = jobStatus?.class_summary?.[code] ?? 0;
                  const total = jobStatus?.total_detections ?? 0;
                  const pct = total > 0 ? ((count / total) * 100).toFixed(0) : '0';
                  const meta = DAMAGE_CLASSES[code];

                  return (
                    <div key={code} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
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
                          <span className="text-[#F5F5F5] text-xs">{meta.label}</span>
                        </div>
                        <span className="font-mono text-xs font-bold" style={{ color: meta.color }}>
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#14151B] overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          initial={false}
                          animate={{ width: `${pct}%` }}
                          transition={
                            shouldReduceMotion
                              ? { duration: 0 }
                              : { duration: 0.35, ease: [0.16, 1, 0.3, 1] }
                          }
                          style={{ backgroundColor: meta.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Video Processing Constraints Notice */}
          <div className="p-4 rounded-xl bg-[#18181C] border border-[#2B2D35] flex items-start gap-3 text-xs text-[#767881]">
            <span className="material-symbols-outlined text-[20px] text-[#6989FF] shrink-0 mt-0.5">
              info
            </span>
            <div className="space-y-1 leading-relaxed">
              <p className="font-semibold text-[#F5F5F5]">Asynchronous Worker</p>
              <p>
                Video inspection executes in a single-slot worker on the host machine. Output video is re-encoded with H.264 for cross-browser playback.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

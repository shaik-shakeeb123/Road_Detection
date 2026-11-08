import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { usePageTitle } from '@/hooks/usePageTitle';
import type { BackendStatus } from '@/hooks/useBackendStatus';
import { imageService } from '@/services/imageService';
import { apiClient, ApiError } from '@/services/apiClient';
import type { ImageDetectionResponse, DetectionResponse } from '@/types/api';
import { DAMAGE_CLASSES, type DamageClassCode } from '@/types/detection';
import DamageClassBadge from '@/components/common/DamageClassBadge';
import {
  buttonTapMotion,
  fadeInVariants,
} from '@/utils/motion';

export default function ImageDetectionPage() {
  usePageTitle('Image Inspection');
  const backendStatus = useOutletContext<BackendStatus>();
  const shouldReduceMotion = useReducedMotion();
  const isModelAvailable = backendStatus.modelStatus?.available ?? false;

  // Upload and inspection state
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [confidence, setConfidence] = useState<number>(0.25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImageDetectionResponse | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Viewport display controls
  const [zoom, setZoom] = useState<number>(100);
  const [showBoxes, setShowBoxes] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [showConf, setShowConf] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'annotated' | 'original'>('annotated');
  const [selectedDetection, setSelectedDetection] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Clean up object URLs on change/unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [previewUrl]);

  const handleFileSelect = (selectedFile: File) => {
    const validExtensions = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!validExtensions.includes(selectedFile.type) && !/\.(jpe?g|png)$/i.test(selectedFile.name)) {
      setError('Invalid file format. Please upload a JPG or PNG image.');
      return;
    }

    if (selectedFile.size > 20 * 1024 * 1024) {
      setError('File size exceeds the 20MB limit.');
      return;
    }

    setError(null);
    setResult(null);
    setSelectedDetection(null);
    setZoom(100);
    setViewMode('annotated');

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const url = URL.createObjectURL(selectedFile);
    setFile(selectedFile);
    setPreviewUrl(url);

    const img = new Image();
    img.onload = () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = url;
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

  const runDetection = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    abortControllerRef.current = new AbortController();

    try {
      const res = await imageService.detectImage(file, confidence, abortControllerRef.current.signal);
      setResult(res);
      setViewMode('annotated');
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof ApiError) {
        if (err.status === 503 || err.code === 'model_unavailable') {
          setError('AI Model Not Ready — Model weights are not loaded on the server. Please check backend model initialization.');
        } else {
          setError(err.message || 'Detection failed.');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Network error communicating with RoadVision detection API.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    setSelectedDetection(null);
    setImageDimensions(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const meanConfidence = useMemo(() => {
    if (!result || result.detections.length === 0) return 0;
    const sum = result.detections.reduce((acc, d) => acc + d.confidence, 0);
    return Math.round((sum / result.detections.length) * 100);
  }, [result]);

  const displayedImageSrc = useMemo(() => {
    if (result && viewMode === 'annotated') {
      return apiClient.resultUrl(result.annotated_image_url);
    }
    return previewUrl;
  }, [result, viewMode, previewUrl]);

  return (
    <div className="space-y-6">
      {/* 1. Sub-Header & Controls Ribbon */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#2B2D35]/60">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#F5F5F5] tracking-tight">Image Inspection</h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors ${
                isModelAvailable
                  ? 'bg-[#E0EA6C]/10 text-[#E0EA6C] border-[#E0EA6C]/30'
                  : 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isModelAvailable ? 'bg-[#E0EA6C]' : 'bg-[#F59E0B]'}`} />
              {isModelAvailable ? 'Inference Engine Ready' : 'Model Offline'}
            </span>
          </div>
          <p className="text-xs text-[#767881] mt-1">
            Upload high-resolution road surface imagery for defect detection and classification
          </p>
        </div>

        {/* Confidence Parameter Slider */}
        <div className="flex flex-wrap items-center gap-4 p-2.5 px-4 rounded-xl bg-[#18181C] border border-[#2B2D35] self-start lg:self-auto shadow-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#6989FF]">tune</span>
            <span className="text-xs font-medium text-[#767881]">Confidence Threshold</span>
          </div>

          <div className="flex items-center gap-3 min-w-[160px]">
            <input
              type="range"
              min="0.10"
              max="0.90"
              step="0.05"
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              disabled={loading}
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
              Model checkpoint is missing or could not be loaded on the backend. Detection requests will return{' '}
              <code className="text-[#F5F5F5] font-mono">model_unavailable</code> until weights are placed in the server's weights directory.
            </p>
          </div>
        </div>
      )}

      {/* Error Banner with smooth exit */}
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

      {/* 2. Main Inspection Grid: Viewport (8 cols) & Results Rail (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Inspection Canvas Workspace (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="rounded-xl bg-[#18181C] border border-[#2B2D35] overflow-hidden flex flex-col shadow-sm">
            {/* Viewport Toolbar */}
            <div className="flex flex-wrap items-center justify-between p-3 px-4 bg-[#14151B] border-b border-[#2B2D35] gap-3">
              {/* Zoom Tools */}
              <div className="flex items-center gap-1.5">
                <motion.button
                  type="button"
                  whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                  onClick={() => setZoom((z) => Math.min(250, z + 25))}
                  disabled={!file}
                  className="p-1.5 rounded-lg bg-[#18181C] hover:bg-[#202127] border border-[#2B2D35] text-[#A1A1AA] hover:text-[#F5F5F5] disabled:opacity-40 transition-colors focus-visible:ring-2 focus-visible:ring-[#6989FF]/40"
                  title="Zoom In"
                >
                  <span className="material-symbols-outlined text-[18px]">zoom_in</span>
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                  onClick={() => setZoom((z) => Math.max(50, z - 25))}
                  disabled={!file}
                  className="p-1.5 rounded-lg bg-[#18181C] hover:bg-[#202127] border border-[#2B2D35] text-[#A1A1AA] hover:text-[#F5F5F5] disabled:opacity-40 transition-colors focus-visible:ring-2 focus-visible:ring-[#6989FF]/40"
                  title="Zoom Out"
                >
                  <span className="material-symbols-outlined text-[18px]">zoom_out</span>
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                  onClick={() => setZoom(100)}
                  disabled={!file}
                  className="px-2.5 py-1 rounded-lg bg-[#18181C] hover:bg-[#202127] border border-[#2B2D35] text-xs font-mono text-[#A1A1AA] hover:text-[#F5F5F5] disabled:opacity-40 transition-colors focus-visible:ring-2 focus-visible:ring-[#6989FF]/40"
                  title="Reset Zoom"
                >
                  {zoom}%
                </motion.button>
              </div>

              {/* View & Overlay Toggles */}
              <div className="flex items-center gap-2">
                {result && (
                  <div className="inline-flex p-0.5 rounded-lg bg-[#18181C] border border-[#2B2D35] text-xs">
                    <button
                      type="button"
                      onClick={() => setViewMode('annotated')}
                      className={`px-2.5 py-1 rounded-md transition-all ${
                        viewMode === 'annotated'
                          ? 'bg-[#E0EA6C] text-[#090A0F] font-bold shadow-xs'
                          : 'text-[#767881] hover:text-[#F5F5F5]'
                      }`}
                    >
                      Annotated
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('original')}
                      className={`px-2.5 py-1 rounded-md transition-all ${
                        viewMode === 'original'
                          ? 'bg-[#E0EA6C] text-[#090A0F] font-bold shadow-xs'
                          : 'text-[#767881] hover:text-[#F5F5F5]'
                      }`}
                    >
                      Original
                    </button>
                  </div>
                )}

                {/* Layer Toggles */}
                {result && viewMode === 'original' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowBoxes((v) => !v)}
                      className={`px-2 py-1 rounded-lg border text-xs font-medium transition-colors ${
                        showBoxes
                          ? 'bg-[#6989FF]/15 text-[#6989FF] border-[#6989FF]/30'
                          : 'bg-[#18181C] text-[#767881] border-[#2B2D35]'
                      }`}
                    >
                      Boxes
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLabels((v) => !v)}
                      className={`px-2 py-1 rounded-lg border text-xs font-medium transition-colors ${
                        showLabels
                          ? 'bg-[#6989FF]/15 text-[#6989FF] border-[#6989FF]/30'
                          : 'bg-[#18181C] text-[#767881] border-[#2B2D35]'
                      }`}
                    >
                      Labels
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowConf((v) => !v)}
                      className={`px-2 py-1 rounded-lg border text-xs font-medium transition-colors ${
                        showConf
                          ? 'bg-[#6989FF]/15 text-[#6989FF] border-[#6989FF]/30'
                          : 'bg-[#18181C] text-[#767881] border-[#2B2D35]'
                      }`}
                    >
                      Conf
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Viewport Canvas Display */}
            <div
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={`relative w-full aspect-[16/10] bg-[#0E0E12] overflow-auto flex items-center justify-center p-2 select-none transition-colors duration-150 ${
                isDragging ? 'bg-[#E0EA6C]/5 ring-2 ring-inset ring-[#E0EA6C]/40' : ''
              }`}
            >
              {displayedImageSrc ? (
                <div
                  className="relative transition-transform duration-150 ease-out origin-center inline-block max-w-full max-h-full"
                  style={{ transform: `scale(${zoom / 100})` }}
                >
                  <img
                    src={displayedImageSrc}
                    alt={file?.name || 'Road Inspection Subject'}
                    className="max-h-[500px] w-auto object-contain rounded shadow-lg transition-opacity duration-200"
                  />

                  {/* Interactive Vector Box Overlay */}
                  {result && viewMode === 'original' && showBoxes && imageDimensions && (
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox={`0 0 ${imageDimensions.width} ${imageDimensions.height}`}
                    >
                      {result.detections.map((det: DetectionResponse, idx: number) => {
                        const [x1, y1, x2, y2] = det.box;
                        const w = x2 - x1;
                        const h = y2 - y1;
                        const classMeta = DAMAGE_CLASSES[det.class_name as DamageClassCode] || {
                          color: '#E0EA6C',
                          bgColor: 'rgba(224, 234, 108, 0.2)',
                          borderColor: '#E0EA6C',
                        };
                        const isSelected = selectedDetection === idx;

                        return (
                          <g
                            key={idx}
                            className="pointer-events-auto cursor-pointer"
                            onClick={() => setSelectedDetection(isSelected ? null : idx)}
                          >
                            <rect
                              x={x1}
                              y={y1}
                              width={w}
                              height={h}
                              fill={isSelected ? classMeta.bgColor : 'rgba(0,0,0,0.1)'}
                              stroke={classMeta.color}
                              strokeWidth={isSelected ? 4 : 2}
                              strokeDasharray={isSelected ? '6 3' : 'none'}
                              className="transition-all duration-150"
                            />
                            {showLabels && (
                              <g transform={`translate(${x1}, ${Math.max(20, y1 - 6)})`}>
                                <rect
                                  x={0}
                                  y={-16}
                                  width={showConf ? 90 : 50}
                                  height={18}
                                  rx={3}
                                  fill="#14151B"
                                  stroke={classMeta.color}
                                  strokeWidth={1}
                                />
                                <text
                                  x={5}
                                  y={-3}
                                  fill={classMeta.color}
                                  fontSize="12"
                                  fontWeight="bold"
                                  fontFamily="monospace"
                                >
                                  {det.class_name}
                                  {showConf ? ` ${Math.round(det.confidence * 100)}%` : ''}
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  )}
                </div>
              ) : (
                /* Empty Viewport Placeholder */
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-8 text-center cursor-pointer group max-w-sm"
                >
                  <div
                    className={`w-14 h-14 rounded-2xl bg-[#14151B] border transition-all duration-200 flex items-center justify-center mb-3 shadow-inner ${
                      isDragging
                        ? 'border-[#E0EA6C] text-[#E0EA6C] scale-110 shadow-[0_0_16px_rgba(224,234,108,0.25)]'
                        : 'border-[#2B2D35] text-[#767881] group-hover:border-[#E0EA6C]/40 group-hover:text-[#E0EA6C]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[28px]">add_photo_alternate</span>
                  </div>
                  <h3 className="text-sm font-bold text-[#F5F5F5] mb-1">Select Road Image</h3>
                  <p className="text-xs text-[#767881] leading-relaxed">
                    Drop a JPG or PNG road surface image here or click to browse local files.
                  </p>
                </div>
              )}
            </div>

            {/* Viewport Action Footer */}
            <div className="flex flex-wrap items-center justify-between p-3 px-4 bg-[#14151B] border-t border-[#2B2D35] gap-3">
              <div className="flex items-center gap-2">
                <motion.button
                  type="button"
                  whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                  onClick={runDetection}
                  disabled={!file || loading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E0EA6C] hover:brightness-105 text-[#090A0F] font-bold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_12px_rgba(224,234,108,0.2)] focus-visible:ring-2 focus-visible:ring-[#E0EA6C]/60"
                >
                  {loading ? (
                    <>
                      <span className="animate-spin h-3.5 w-3.5 border-2 border-[#090A0F] border-t-transparent rounded-full" />
                      <span>Running Detection...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">psychology</span>
                      <span>Run Detection</span>
                    </>
                  )}
                </motion.button>

                {result && result.annotated_image_url && (
                  <motion.a
                    whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                    href={apiClient.resultUrl(result.annotated_image_url)}
                    download={`roadvision-annotated-${result.inspection_id}.jpg`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#18181C] hover:bg-[#202127] border border-[#2B2D35] text-xs font-semibold text-[#F5F5F5] transition-colors focus-visible:ring-2 focus-visible:ring-[#6989FF]/40"
                  >
                    <span className="material-symbols-outlined text-[16px]">file_download</span>
                    <span>Download Annotated</span>
                  </motion.a>
                )}

                {file && (
                  <motion.button
                    type="button"
                    whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                    onClick={handleClear}
                    disabled={loading}
                    className="p-2 rounded-lg bg-[#18181C] hover:bg-[#202127] border border-[#2B2D35] text-[#767881] hover:text-[#FF5C5C] transition-colors text-xs focus-visible:ring-2 focus-visible:ring-[#FF5C5C]/40"
                    title="Clear Image"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </motion.button>
                )}
              </div>

              {/* Image Info Tag */}
              {file && (
                <div className="flex items-center gap-3 text-xs font-mono text-[#767881]">
                  <span className="truncate max-w-[180px] text-[#A1A1AA]">{file.name}</span>
                  {imageDimensions && (
                    <span>
                      {imageDimensions.width} × {imageDimensions.height}
                    </span>
                  )}
                  <span>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
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
                ? 'border-[#E0EA6C] bg-[#E0EA6C]/5 shadow-[0_0_20px_rgba(224,234,108,0.15)]'
                : 'border-[#2B2D35] hover:border-[#6989FF]/60 hover:bg-[#14151B]/80'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
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
                  isDragging ? 'border-[#E0EA6C] text-[#E0EA6C]' : 'border-[#2B2D35] text-[#6989FF]'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">upload_file</span>
              </div>
              <div>
                <p className="text-xs font-bold text-[#F5F5F5]">
                  {file ? 'Replace Selected Image' : 'Drop road surface image here'}
                </p>
                <p className="text-[11px] text-[#767881] mt-0.5">
                  JPG, JPEG, PNG • Maximum size 20MB
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

        {/* Right: Analytical Results Rail (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Summary Card */}
          <div className="p-5 rounded-xl bg-[#18181C] border border-[#2B2D35] flex flex-col shadow-sm">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#2B2D35]/70">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-[#6989FF]">analytics</span>
                <h2 className="text-base font-bold text-[#F5F5F5]">Detection Summary</h2>
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#14151B] border border-[#2B2D35] text-[#A1A1AA]">
                {result ? `INSP #${result.inspection_id}` : 'STANDBY'}
              </span>
            </div>

            {/* Top KPI Numbers */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-[#14151B] border border-[#2B2D35] flex flex-col transition-colors hover:border-[#3E424E]">
                <span className="text-[11px] font-mono uppercase text-[#767881]">Damages Found</span>
                <span className="text-2xl font-bold font-mono text-[#E0EA6C] mt-1">
                  {result ? result.total_detections : '—'}
                </span>
                <span className="text-[10px] text-[#767881] mt-0.5">Defects in image</span>
              </div>

              <div className="p-3 rounded-lg bg-[#14151B] border border-[#2B2D35] flex flex-col transition-colors hover:border-[#3E424E]">
                <span className="text-[11px] font-mono uppercase text-[#767881]">Inference Time</span>
                <span className="text-2xl font-bold font-mono text-[#6989FF] mt-1">
                  {result ? `${Math.round(result.processing_time * 1000)}ms` : '—'}
                </span>
                <span className="text-[10px] text-[#767881] mt-0.5">Processing latency</span>
              </div>
            </div>

            {/* Metadata Specs */}
            <div className="p-3 rounded-lg bg-[#14151B] border border-[#2B2D35] text-xs font-mono space-y-2 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-[#767881]">Model:</span>
                <span className="text-[#F5F5F5]">{result?.model || 'YOLO26m'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#767881]">Confidence Gate:</span>
                <span className="text-[#E0EA6C] font-semibold">{confidence.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#767881]">Mean Confidence:</span>
                <span className="text-[#F5F5F5]">{result ? `${meanConfidence}%` : '—'}</span>
              </div>
            </div>

            {/* 4-Class Breakdown */}
            <div className="pt-3 border-t border-[#2B2D35]/70">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#767881] block mb-3 font-bold">
                Defect Breakdown
              </span>

              <div className="flex flex-col gap-2.5">
                {(['D00', 'D10', 'D20', 'D40'] as DamageClassCode[]).map((code) => {
                  const count = result?.class_counts[code] ?? 0;
                  const total = result?.total_detections ?? 0;
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

          {/* Individual Detections Scroll Area */}
          <div className="p-5 rounded-xl bg-[#18181C] border border-[#2B2D35] flex flex-col shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[#F5F5F5]">Detected Defects</h3>
              <span className="text-xs font-mono text-[#767881]">
                {result ? `${result.detections.length} total` : '0 items'}
              </span>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {result && result.detections.length > 0 ? (
                result.detections.map((det: DetectionResponse, idx: number) => {
                  const isSelected = selectedDetection === idx;
                  const meta = DAMAGE_CLASSES[det.class_name as DamageClassCode] || {
                    color: '#6989FF',
                    label: det.class_name,
                  };

                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedDetection(isSelected ? null : idx)}
                      className={`p-2.5 rounded-lg border transition-all duration-150 cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#14151B] border-[#E0EA6C] shadow-[0_0_12px_rgba(224,234,108,0.12)]'
                          : 'bg-[#14151B]/60 border-[#2B2D35] hover:border-[#3E424E]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <DamageClassBadge code={det.class_name as DamageClassCode} size="sm" />
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-[#F5F5F5]">
                            {meta.label}
                          </span>
                          <span className="text-[10px] font-mono text-[#767881]">
                            [{det.box.map((v) => Math.round(v)).join(', ')}]
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-mono font-bold text-[#E0EA6C]">
                          {Math.round(det.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-6 text-center text-xs text-[#767881]">
                  {result
                    ? 'No defect bounding boxes found above confidence threshold.'
                    : 'Run detection to view individual defect coordinates.'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

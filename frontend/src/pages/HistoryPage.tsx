import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { usePageTitle } from '@/hooks/usePageTitle';
import StatusBadge from '@/components/common/StatusBadge';
import DamageClassBadge from '@/components/common/DamageClassBadge';
import ConfirmationDialog from '@/components/common/ConfirmationDialog';
import { historyService } from '@/services/historyService';
import { apiClient, ApiError } from '@/services/apiClient';
import type { InspectionStatusResponse } from '@/types/api';
import { DAMAGE_CLASSES, DAMAGE_CLASS_CODES } from '@/types/detection';
import {
  buttonTapMotion,
  modalBackdropVariants,
  modalDialogVariants,
  fadeInVariants,
} from '@/utils/motion';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'default' {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'reviewed':
      return 'success';
    case 'processing':
    case 'queued':
      return 'info';
    case 'failed':
      return 'danger';
    case 'cancelled':
      return 'warning';
    default:
      return 'default';
  }
}

// Persistent in-memory cache to prevent layout shift during navigation
let historyCache: { items: InspectionStatusResponse[]; offset: number } | null = null;

export default function HistoryPage() {
  usePageTitle('Inspection History');
  const shouldReduceMotion = useReducedMotion();

  // List and pagination state
  const [inspections, setInspections] = useState<InspectionStatusResponse[]>(() => historyCache?.items ?? []);
  const [loading, setLoading] = useState<boolean>(() => !historyCache);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(() => historyCache?.offset ?? 0);
  const limit = 20;

  // Filter & Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video' | 'webcam'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'processing' | 'failed' | 'cancelled'>('all');
  const [quickFilter, setQuickFilter] = useState<'all' | 'potholes' | 'cracks'>('all');

  // Detail Modal state
  const [selectedRecord, setSelectedRecord] = useState<InspectionStatusResponse | null>(null);

  // Deletion Dialog state
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchHistory = useCallback(() => {
    if (!historyCache || historyCache.offset !== offset) {
      setLoading(true);
    }
    setError(null);
    historyService
      .listInspections(limit, offset)
      .then((res) => {
        historyCache = { items: res.items, offset };
        setInspections(res.items);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to retrieve persistent inspection history');
      })
      .finally(() => setLoading(false));
  }, [offset, limit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Escape key listener for detail modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedRecord) {
        setSelectedRecord(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRecord]);

  // Open full detail modal
  const handleOpenDetail = async (id: number) => {
    try {
      const data = await historyService.getInspection(id);
      setSelectedRecord(data);
    } catch {
      const fallback = inspections.find((i) => i.id === id) || null;
      setSelectedRecord(fallback);
    }
  };

  // Perform deletion
  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    setDeleteLoading(true);
    setDeleteError(null);

    try {
      await historyService.deleteInspection(deleteTargetId);
      setDeleteTargetId(null);
      if (selectedRecord?.id === deleteTargetId) {
        setSelectedRecord(null);
      }
      fetchHistory();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setDeleteError(err.message || 'Failed to delete inspection.');
      } else {
        setDeleteError(err instanceof Error ? err.message : 'Network error deleting record.');
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  // Filtering pipeline
  const filtered = useMemo(() => {
    return inspections.filter((insp) => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesFile = insp.filename?.toLowerCase().includes(term);
        const matchesId = String(insp.id).includes(term);
        const matchesType = insp.input_type.toLowerCase().includes(term);
        if (!matchesFile && !matchesId && !matchesType) return false;
      }

      if (typeFilter !== 'all') {
        if (typeFilter === 'webcam') {
          if (insp.input_type !== 'webcam' && insp.input_type !== 'camera') return false;
        } else if (insp.input_type !== typeFilter) {
          return false;
        }
      }

      if (statusFilter !== 'all') {
        if (insp.status.toLowerCase() !== statusFilter) return false;
      }

      if (quickFilter === 'potholes') {
        if ((insp.class_summary?.D40 ?? 0) <= 0) return false;
      } else if (quickFilter === 'cracks') {
        const cracks =
          (insp.class_summary?.D00 ?? 0) +
          (insp.class_summary?.D10 ?? 0) +
          (insp.class_summary?.D20 ?? 0);
        if (cracks <= 0) return false;
      }

      return true;
    });
  }, [inspections, searchTerm, typeFilter, statusFilter, quickFilter]);

  const stats = useMemo(() => {
    const total = inspections.length;
    const images = inspections.filter((i) => i.input_type === 'image').length;
    const videos = inspections.filter((i) => i.input_type === 'video').length;
    const streams = inspections.filter((i) => i.input_type === 'webcam' || i.input_type === 'camera').length;
    const defects = inspections.reduce((sum, i) => sum + (i.total_detections || 0), 0);
    return { total, images, videos, streams, defects };
  }, [inspections]);

  return (
    <div className="space-y-6">
      {/* 1. Header & Summary Tiles */}
      <div className="flex flex-col gap-4 pb-4 border-b border-[#2B2D35]/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#F5F5F5] tracking-tight">Inspection History</h1>
            <p className="text-xs text-[#767881] mt-1">
              Database audit log of all completed image, video, and live camera inspections
            </p>
          </div>

          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
              onClick={fetchHistory}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18181C] hover:bg-[#202127] border border-[#2B2D35] text-xs font-semibold text-[#F5F5F5] transition-colors focus-visible:ring-2 focus-visible:ring-[#6989FF]/40"
            >
              <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>
                refresh
              </span>
              <span>Refresh</span>
            </motion.button>
          </div>
        </div>

        {/* 5 Summary KPI Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="p-3 rounded-xl bg-[#18181C] border border-[#2B2D35] flex items-center gap-3 transition-colors hover:border-[#3E424E]">
            <div className="w-10 h-10 rounded-lg bg-[#14151B] border border-[#2B2D35] flex items-center justify-center text-[#E0EA6C] shrink-0">
              <span className="material-symbols-outlined text-[20px]">inventory_2</span>
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-mono uppercase text-[#767881] block">Total Records</span>
              <span className="text-lg font-bold font-mono text-[#F5F5F5]">{stats.total}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#18181C] border border-[#2B2D35] flex items-center gap-3 transition-colors hover:border-[#3E424E]">
            <div className="w-10 h-10 rounded-lg bg-[#14151B] border border-[#2B2D35] flex items-center justify-center text-[#6989FF] shrink-0">
              <span className="material-symbols-outlined text-[20px]">image</span>
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-mono uppercase text-[#767881] block">Images</span>
              <span className="text-lg font-bold font-mono text-[#F5F5F5]">{stats.images}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#18181C] border border-[#2B2D35] flex items-center gap-3 transition-colors hover:border-[#3E424E]">
            <div className="w-10 h-10 rounded-lg bg-[#14151B] border border-[#2B2D35] flex items-center justify-center text-[#38BDF8] shrink-0">
              <span className="material-symbols-outlined text-[20px]">movie</span>
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-mono uppercase text-[#767881] block">Videos</span>
              <span className="text-lg font-bold font-mono text-[#F5F5F5]">{stats.videos}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#18181C] border border-[#2B2D35] flex items-center gap-3 transition-colors hover:border-[#3E424E]">
            <div className="w-10 h-10 rounded-lg bg-[#14151B] border border-[#2B2D35] flex items-center justify-center text-[#F59E0B] shrink-0">
              <span className="material-symbols-outlined text-[20px]">videocam</span>
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-mono uppercase text-[#767881] block">Live Streams</span>
              <span className="text-lg font-bold font-mono text-[#F5F5F5]">{stats.streams}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#18181C] border border-[#2B2D35] flex items-center gap-3 col-span-2 sm:col-span-1 transition-colors hover:border-[#3E424E]">
            <div className="w-10 h-10 rounded-lg bg-[#14151B] border border-[#2B2D35] flex items-center justify-center text-[#FF5C5C] shrink-0">
              <span className="material-symbols-outlined text-[20px]">report_problem</span>
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-mono uppercase text-[#767881] block">Total Defects</span>
              <span className="text-lg font-bold font-mono text-[#FF5C5C]">{stats.defects}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
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
                <p className="font-semibold">History Retrieval Failed</p>
                <p className="text-[#A1A1AA] mt-0.5">{error}</p>
              </div>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-[#767881] hover:text-[#F5F5F5] p-1 rounded focus-visible:ring-2 focus-visible:ring-[#FF5C5C]/40"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Error Notification */}
      <AnimatePresence>
        {deleteError && (
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
                <p className="font-semibold">Deletion Rejected</p>
                <p className="text-[#A1A1AA] mt-0.5">{deleteError}</p>
              </div>
            </div>
            <button
              onClick={() => setDeleteError(null)}
              className="text-[#767881] hover:text-[#F5F5F5] p-1 rounded focus-visible:ring-2 focus-visible:ring-[#FF5C5C]/40"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Filter Bar */}
      <div className="p-4 rounded-xl bg-[#18181C] border border-[#2B2D35] flex flex-col gap-3 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search */}
          <div className="md:col-span-5 relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#767881] text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by file name or ID..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#14151B] border border-[#2B2D35] text-xs text-[#F5F5F5] placeholder:text-[#767881] focus:outline-none focus:border-[#6989FF] focus-visible:ring-2 focus-visible:ring-[#6989FF]/40 transition-all"
            />
          </div>

          {/* Type Filter */}
          <div className="md:col-span-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="w-full px-3 py-1.5 rounded-lg bg-[#14151B] border border-[#2B2D35] text-xs text-[#F5F5F5] focus:outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[#6989FF]/40"
            >
              <option value="all">All Media Types</option>
              <option value="image">Image Inspections</option>
              <option value="video">Video Inspections</option>
              <option value="webcam">Live Camera Streams</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="md:col-span-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-1.5 rounded-lg bg-[#14151B] border border-[#2B2D35] text-xs text-[#F5F5F5] focus:outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[#6989FF]/40"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="processing">Processing / Active</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Quick Filter Chips */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#2B2D35]/50">
          <div className="flex items-center gap-1.5">
            <motion.button
              type="button"
              whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
              onClick={() => setQuickFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:ring-[#E0EA6C]/40 ${
                quickFilter === 'all'
                  ? 'bg-[#E0EA6C] text-[#090A0F] shadow-xs'
                  : 'bg-[#14151B] text-[#767881] hover:text-[#F5F5F5] border border-[#2B2D35]'
              }`}
            >
              All Records ({inspections.length})
            </motion.button>
            <motion.button
              type="button"
              whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
              onClick={() => setQuickFilter('potholes')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:ring-[#FF5C5C]/40 ${
                quickFilter === 'potholes'
                  ? 'bg-[#FF5C5C] text-white shadow-xs'
                  : 'bg-[#14151B] text-[#767881] hover:text-[#F5F5F5] border border-[#2B2D35]'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF5C5C]" />
              Potholes Present
            </motion.button>
            <motion.button
              type="button"
              whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
              onClick={() => setQuickFilter('cracks')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:ring-[#6989FF]/40 ${
                quickFilter === 'cracks'
                  ? 'bg-[#6989FF] text-white shadow-xs'
                  : 'bg-[#14151B] text-[#767881] hover:text-[#F5F5F5] border border-[#2B2D35]'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#6989FF]" />
              Cracks Present
            </motion.button>
          </div>

          <span className="text-xs font-mono text-[#767881]">
            Showing {filtered.length} of {inspections.length} loaded
          </span>
        </div>
      </div>

      {/* 3. Table Container */}
      <div className="rounded-xl bg-[#18181C] border border-[#2B2D35] overflow-hidden flex flex-col shadow-sm">
        <div className="overflow-x-auto w-full">
          {filtered.length > 0 ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#0E0E12] border-b border-[#2B2D35] text-[11px] font-mono font-bold text-[#767881] uppercase tracking-wider">
                  <th className="py-3 px-4">Preview & Source</th>
                  <th className="py-3 px-4">Inspection ID</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Detections</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2B2D35]/50 text-xs">
                {filtered.map((insp) => {
                  const isCamera = insp.input_type === 'webcam' || insp.input_type === 'camera';
                  const isVideo = insp.input_type === 'video';

                  return (
                    <tr
                      key={insp.id}
                      className="hover:bg-[#14151B]/60 transition-colors duration-150 group"
                    >
                      {/* Preview & Source */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="relative w-14 h-10 rounded-md overflow-hidden bg-[#14151B] shrink-0 border border-[#2B2D35] flex items-center justify-center">
                            {insp.output_url ? (
                              <img
                                src={apiClient.resultUrl(insp.output_url)}
                                alt={insp.filename || `Inspection ${insp.id}`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <span className="material-symbols-outlined text-[20px] text-[#767881]">
                                {isCamera ? 'videocam' : isVideo ? 'movie' : 'image'}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-col min-w-0">
                            <span className="text-xs text-[#F5F5F5] font-semibold truncate max-w-[200px]">
                              {insp.filename || (isCamera ? 'DirectShow Stream' : `Inspection #${insp.id}`)}
                            </span>
                            <span className="font-mono text-[11px] text-[#767881] truncate">
                              {insp.models_used || 'Standard'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* ID */}
                      <td className="py-3 px-4 font-mono text-xs text-[#A1A1AA]">
                        #{insp.id}
                      </td>

                      {/* Type */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono bg-[#14151B] border border-[#2B2D35] text-[#F5F5F5]">
                          <span className="material-symbols-outlined text-[13px] text-[#6989FF]">
                            {isCamera ? 'videocam' : isVideo ? 'movie' : 'image'}
                          </span>
                          <span className="capitalize">{insp.input_type}</span>
                        </span>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3 px-4 font-mono text-xs text-[#767881]">
                        {formatDate(insp.created_at)}
                      </td>

                      {/* Detections */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-xs font-bold text-[#F5F5F5]">
                            {insp.total_detections} {insp.total_detections === 1 ? 'hit' : 'hits'}
                          </span>
                          <div className="flex items-center gap-1 flex-wrap">
                            {DAMAGE_CLASS_CODES.map((code) => {
                              const count = insp.class_summary?.[code] ?? 0;
                              if (count === 0) return null;
                              return (
                                <DamageClassBadge
                                  key={code}
                                  code={code}
                                  count={count}
                                  size="sm"
                                />
                              );
                            })}
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <StatusBadge
                          label={insp.status}
                          variant={statusVariant(insp.status)}
                        />
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <motion.button
                            type="button"
                            whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                            onClick={() => handleOpenDetail(insp.id)}
                            className="p-1.5 rounded-lg bg-[#14151B] hover:bg-[#6989FF] hover:text-white border border-[#2B2D35] text-[#F5F5F5] transition-colors focus-visible:ring-2 focus-visible:ring-[#6989FF]/40"
                            title="View Full Inspection Details"
                          >
                            <span className="material-symbols-outlined text-[16px]">visibility</span>
                          </motion.button>

                          <motion.button
                            type="button"
                            whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                            onClick={() => setDeleteTargetId(insp.id)}
                            disabled={insp.status === 'processing' || insp.status === 'queued'}
                            className="p-1.5 rounded-lg bg-[#14151B] hover:bg-[#FF5C5C] hover:text-white border border-[#2B2D35] text-[#767881] transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[#FF5C5C]/40"
                            title={
                              insp.status === 'processing' || insp.status === 'queued'
                                ? 'Active inspections cannot be deleted'
                                : 'Delete Inspection Record'
                            }
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </motion.button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : loading ? (
            /* Table Loading Skeleton to preserve table height and prevent layout shift */
            <div className="p-4 space-y-3 min-h-[360px]">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-12 bg-[#14151B] rounded-lg relative overflow-hidden border border-[#2B2D35]/50">
                  <div className="absolute inset-0 shimmer-effect pointer-events-none" />
                </div>
              ))}
            </div>
          ) : (
            /* Empty Table State */
            <div className="py-16 px-4 text-center">
              <div className="w-12 h-12 mx-auto rounded-xl bg-[#14151B] border border-[#2B2D35] flex items-center justify-center text-[#767881] mb-3">
                <span className="material-symbols-outlined text-[24px]">inventory_2</span>
              </div>
              <h3 className="text-sm font-bold text-[#F5F5F5] mb-1">
                {searchTerm || typeFilter !== 'all' || statusFilter !== 'all'
                  ? 'No Matching Inspection Records'
                  : 'No Inspections in Database'}
              </h3>
              <p className="text-xs text-[#767881] max-w-sm mx-auto leading-relaxed">
                {searchTerm || typeFilter !== 'all' || statusFilter !== 'all'
                  ? 'Try adjusting your search criteria or resetting filters.'
                  : 'Completed image, video, and live camera inspections persist here automatically.'}
              </p>
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        <div className="p-3 px-5 border-t border-[#2B2D35]/70 flex items-center justify-between text-xs font-mono text-[#767881]">
          <span>
            Page offset: <span className="text-[#F5F5F5] font-semibold">{offset}</span> • Limit:{' '}
            <span className="text-[#F5F5F5] font-semibold">{limit}</span>
          </span>

          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
              onClick={() => setOffset((o) => Math.max(0, o - limit))}
              disabled={offset === 0}
              className="px-3 py-1 rounded bg-[#14151B] hover:bg-[#202127] border border-[#2B2D35] text-xs text-[#F5F5F5] disabled:opacity-30 transition-colors focus-visible:ring-2 focus-visible:ring-[#6989FF]/40"
            >
              Previous
            </motion.button>
            <motion.button
              type="button"
              whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
              onClick={() => setOffset((o) => o + limit)}
              disabled={inspections.length < limit}
              className="px-3 py-1 rounded bg-[#14151B] hover:bg-[#202127] border border-[#2B2D35] text-xs text-[#F5F5F5] disabled:opacity-30 transition-colors focus-visible:ring-2 focus-visible:ring-[#6989FF]/40"
            >
              Next
            </motion.button>
          </div>
        </div>
      </div>

      {/* 4. Inspection Detail Modal with smooth entrance/exit */}
      <AnimatePresence>
        {selectedRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              variants={shouldReduceMotion ? undefined : modalBackdropVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              onClick={() => setSelectedRecord(null)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
              aria-hidden="true"
            />

            {/* Dialog Container */}
            <motion.div
              variants={shouldReduceMotion ? undefined : modalDialogVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#18181C] border border-[#2B2D35] shadow-2xl flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-detail-title"
            >
              {/* Modal Header */}
              <div className="p-4 px-6 border-b border-[#2B2D35] flex items-center justify-between sticky top-0 bg-[#18181C] z-10">
                <div className="flex items-center gap-3">
                  <span id="modal-detail-title" className="text-base font-bold text-[#F5F5F5]">
                    Inspection #{selectedRecord.id} Details
                  </span>
                  <StatusBadge label={selectedRecord.status} />
                </div>
                <motion.button
                  type="button"
                  whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                  onClick={() => setSelectedRecord(null)}
                  className="p-1 rounded-lg text-[#767881] hover:text-[#F5F5F5] hover:bg-[#14151B] transition-colors focus-visible:ring-2 focus-visible:ring-[#E0EA6C]/40"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </motion.button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6">
                {/* Media Output Preview */}
                {selectedRecord.output_url ? (
                  <div className="rounded-xl overflow-hidden bg-[#0E0E12] border border-[#2B2D35] flex flex-col items-center justify-center shadow-inner">
                    {selectedRecord.input_type === 'video' ? (
                      <video
                        src={apiClient.resultUrl(selectedRecord.output_url)}
                        controls
                        className="max-h-[380px] w-full object-contain"
                      />
                    ) : (
                      <img
                        src={apiClient.resultUrl(selectedRecord.output_url)}
                        alt={selectedRecord.filename || 'Detection Output'}
                        className="max-h-[380px] w-full object-contain"
                      />
                    )}
                    <div className="w-full p-2.5 px-4 bg-[#14151B] border-t border-[#2B2D35] flex items-center justify-between text-xs font-mono">
                      <span className="text-[#767881] truncate max-w-sm">
                        {selectedRecord.output_url}
                      </span>
                      <a
                        href={apiClient.resultUrl(selectedRecord.output_url)}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#6989FF] hover:underline flex items-center gap-1 font-sans font-semibold focus-visible:ring-2 focus-visible:ring-[#6989FF]/40 rounded px-1"
                      >
                        <span className="material-symbols-outlined text-[15px]">download</span>
                        <span>Download File</span>
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 rounded-xl bg-[#14151B] border border-[#2B2D35] text-center text-xs text-[#767881]">
                    <span className="material-symbols-outlined text-[32px] text-[#767881] mb-2 block">
                      broken_image
                    </span>
                    No media output asset available for this inspection session.
                  </div>
                )}

                {/* Metadata Specs Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-[#14151B] border border-[#2B2D35] flex flex-col">
                    <span className="text-[10px] font-mono uppercase text-[#767881]">Input Type</span>
                    <span className="text-sm font-bold text-[#F5F5F5] uppercase mt-0.5">
                      {selectedRecord.input_type}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#14151B] border border-[#2B2D35] flex flex-col">
                    <span className="text-[10px] font-mono uppercase text-[#767881]">Total Defects</span>
                    <span className="text-sm font-bold text-[#E0EA6C] font-mono mt-0.5">
                      {selectedRecord.total_detections}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#14151B] border border-[#2B2D35] flex flex-col">
                    <span className="text-[10px] font-mono uppercase text-[#767881]">Processing Time</span>
                    <span className="text-sm font-bold text-[#6989FF] font-mono mt-0.5">
                      {selectedRecord.processing_ms ? `${selectedRecord.processing_ms}ms` : '—'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#14151B] border border-[#2B2D35] flex flex-col">
                    <span className="text-[10px] font-mono uppercase text-[#767881]">Created At</span>
                    <span className="text-xs text-[#F5F5F5] font-mono mt-0.5">
                      {formatDate(selectedRecord.created_at)}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#14151B] border border-[#2B2D35] flex flex-col">
                    <span className="text-[10px] font-mono uppercase text-[#767881]">Finished At</span>
                    <span className="text-xs text-[#F5F5F5] font-mono mt-0.5">
                      {selectedRecord.finished_at ? formatDate(selectedRecord.finished_at) : '—'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#14151B] border border-[#2B2D35] flex flex-col">
                    <span className="text-[10px] font-mono uppercase text-[#767881]">Confidence Gate</span>
                    <span className="text-sm font-bold text-[#F5F5F5] font-mono mt-0.5">
                      {selectedRecord.conf_threshold ? selectedRecord.conf_threshold.toFixed(2) : 'Default'}
                    </span>
                  </div>
                </div>

                {/* Defect Breakdown Bars */}
                <div className="p-4 rounded-xl bg-[#14151B] border border-[#2B2D35]">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#767881] block mb-3 font-bold">
                    Class Summary
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {DAMAGE_CLASS_CODES.map((code) => {
                      const count = selectedRecord.class_summary?.[code] ?? 0;
                      const meta = DAMAGE_CLASSES[code];
                      const total = selectedRecord.total_detections || 1;
                      const pct = ((count / total) * 100).toFixed(0);

                      return (
                        <div key={code} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5">
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
                            </span>
                            <span className="font-mono text-xs font-bold" style={{ color: meta.color }}>
                              {count} ({pct}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[#0E0E12] overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              initial={shouldReduceMotion ? false : { width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={
                                shouldReduceMotion
                                  ? { duration: 0 }
                                  : { duration: 0.45, ease: [0.16, 1, 0.3, 1] }
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

              {/* Modal Footer */}
              <div className="p-4 px-6 border-t border-[#2B2D35] flex items-center justify-end gap-2 bg-[#18181C]">
                <motion.button
                  type="button"
                  whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                  onClick={() => setSelectedRecord(null)}
                  className="px-4 py-2 rounded-lg bg-[#14151B] hover:bg-[#202127] border border-[#2B2D35] text-xs font-semibold text-[#F5F5F5] transition-colors focus-visible:ring-2 focus-visible:ring-[#E0EA6C]/40"
                >
                  Close
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. Safe Deletion Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={deleteTargetId !== null}
        title="Delete Inspection Record"
        message={`Are you sure you want to permanently delete inspection #${deleteTargetId}? This will remove both the database record and its managed output file from disk.`}
        confirmLabel={deleteLoading ? 'Deleting...' : 'Delete Permanently'}
        cancelLabel="Cancel"
        isDanger={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
}

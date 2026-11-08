import { useState } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '@/components/common/StatusBadge';
import DamageClassBadge from '@/components/common/DamageClassBadge';
import type { InspectionStatusResponse } from '@/types/api';
import { DAMAGE_CLASS_CODES } from '@/types/detection';

interface RecentInspectionActivityProps {
  inspections: InspectionStatusResponse[];
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    const timeStr = d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });

    return isToday
      ? `Today, ${timeStr}`
      : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}, ${timeStr}`;
  } catch {
    return iso;
  }
}

function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'default' {
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

export default function RecentInspectionActivity({ inspections }: RecentInspectionActivityProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter based on search input
  const filtered = inspections.filter((insp) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const filenameMatch = insp.filename?.toLowerCase().includes(term);
    const idMatch = String(insp.id).includes(term);
    const typeMatch = insp.input_type.toLowerCase().includes(term);
    return filenameMatch || idMatch || typeMatch;
  });

  return (
    <div className="rounded-xl bg-[#18181C] border border-[#2B2D35] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2B2D35]/70">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-[#F5F5F5]">Recent Inspections</h2>
            <span className="px-2 py-0.5 rounded-full bg-[#14151B] border border-[#2B2D35] font-mono text-xs text-[#767881]">
              {inspections.length} {inspections.length === 1 ? 'record' : 'records'}
            </span>
          </div>
          <p className="text-xs text-[#767881] mt-0.5">
            Latest inspection records from RoadVision
          </p>
        </div>

        {/* Filter & View All */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-[#767881]">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by name or ID..."
              className="pl-8 pr-3 py-1.5 rounded-lg bg-[#14151B] border border-[#2B2D35] text-xs text-[#F5F5F5] placeholder:text-[#767881] focus:outline-none focus:border-[#6989FF] focus-visible:ring-2 focus-visible:ring-[#6989FF]/40 transition-all w-44 sm:w-56"
            />
          </div>

          <Link
            to="/history"
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#14151B] hover:bg-[#202127] active:scale-[0.98] border border-[#2B2D35] text-xs font-semibold text-[#F5F5F5] transition-all shrink-0 focus-visible:ring-2 focus-visible:ring-[#6989FF]/40"
          >
            <span>View All</span>
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto w-full">
        {filtered.length > 0 ? (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#0E0E12] border-b border-[#2B2D35] text-[11px] font-mono font-bold text-[#767881] uppercase tracking-wider">
                <th className="py-3 px-4">Preview & Source</th>
                <th className="py-3 px-4">Inspection ID</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Detections</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2B2D35]/50 text-xs">
              {filtered.map((insp) => {
                const isCamera = insp.input_type === 'webcam' || insp.input_type === 'camera';
                const isVideo = insp.input_type === 'video';

                return (
                  <tr
                    key={insp.id}
                    className="hover:bg-[#14151B]/60 transition-colors group"
                  >
                    {/* Preview & Source */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="relative w-14 h-10 rounded-md overflow-hidden bg-[#14151B] shrink-0 border border-[#2B2D35] flex items-center justify-center">
                          {insp.output_url ? (
                            <img
                              src={insp.output_url}
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
                          <span className="text-xs text-[#F5F5F5] font-semibold truncate max-w-[180px]">
                            {insp.filename || (isCamera ? 'Live Camera Feed' : `Inspection #${insp.id}`)}
                          </span>
                          <span className="font-mono text-[11px] text-[#767881] truncate">
                            {insp.models_used || 'Standard'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Inspection ID */}
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

                    {/* Date & Time */}
                    <td className="py-3 px-4 font-mono text-xs text-[#767881]">
                      {formatDate(insp.created_at)}
                    </td>

                    {/* Detections */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-xs font-bold text-[#F5F5F5]">
                          {insp.total_detections} {insp.total_detections === 1 ? 'detection' : 'detections'}
                        </span>

                        {/* Class Badges breakdown */}
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
                        variant={statusToVariant(insp.status)}
                      />
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-right">
                      <Link
                        to="/history"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#14151B] hover:bg-[#6989FF] hover:text-[#FFFFFF] active:scale-[0.98] border border-[#2B2D35] text-[#F5F5F5] text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-[#6989FF]/40"
                      >
                        <span>View</span>
                        <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          /* Empty State Table */
          <div className="py-14 px-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-xl bg-[#14151B] border border-[#2B2D35] flex items-center justify-center text-[#767881] mb-3">
              <span className="material-symbols-outlined text-[24px]">fact_check</span>
            </div>
            <h3 className="text-sm font-bold text-[#F5F5F5] mb-1">
              {searchTerm ? 'No Matching Records' : 'No Inspections Recorded Yet'}
            </h3>
            <p className="text-xs text-[#767881] max-w-sm mx-auto leading-relaxed">
              {searchTerm
                ? `No inspection matched "${searchTerm}". Try a different search term.`
                : 'No inspections recorded yet. Run an image, video, or camera inspection to see results here.'}
            </p>
          </div>
        )}
      </div>

      {/* Table Footer */}
      {filtered.length > 0 && (
        <div className="p-3 px-5 border-t border-[#2B2D35]/70 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-[#767881]">
          <span>
            Showing <span className="text-[#F5F5F5] font-semibold">{filtered.length}</span> of{' '}
            <span className="text-[#F5F5F5] font-semibold">{inspections.length}</span> records
          </span>
          <Link
            to="/history"
            className="text-xs text-[#6989FF] hover:underline flex items-center gap-1 font-sans"
          >
            <span>View all in Inspection History</span>
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
          </Link>
        </div>
      )}
    </div>
  );
}

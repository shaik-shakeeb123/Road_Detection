import type { BackendStatus } from '@/hooks/useBackendStatus';

interface HeaderProps {
  backendStatus: BackendStatus;
  onMenuToggle: () => void;
  onRefresh?: () => void;
}

export default function Header({ backendStatus, onMenuToggle, onRefresh }: HeaderProps) {
  const isModelAvailable = backendStatus.modelStatus?.available ?? false;
  const isConnected = backendStatus.connection === 'connected';

  return (
    <header className="sticky top-0 z-40 h-16 bg-[#090A0F]/90 backdrop-blur-xl border-b border-[#2B2D35] px-4 sm:px-6 flex items-center justify-between">
      {/* Left: Mobile Toggle & Breadcrumbs & Status Badges */}
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-1.5 -ml-1 text-[#767881] hover:text-[#F5F5F5] rounded-md hover:bg-[#18181C] transition-colors"
          aria-label="Toggle navigation"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-semibold text-[#767881] truncate">
          <span className="hover:text-[#F5F5F5] transition-colors text-[#E0EA6C]">
            RoadVision
          </span>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-[#F5F5F5]">Workspace</span>
        </div>

        <div className="hidden md:block h-4 w-px bg-[#2B2D35]" />

        {/* Model & Offline Status Badges */}
        <div className="hidden sm:flex items-center gap-2">
          {/* Model Status Pill */}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
              isModelAvailable
                ? 'bg-[#E0EA6C]/10 text-[#E0EA6C] border-[#E0EA6C]/30'
                : 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isModelAvailable ? 'bg-[#E0EA6C]' : 'bg-[#F59E0B]'
              }`}
            />
            {isModelAvailable ? 'Model Ready' : 'Model Unavailable'}
          </span>

          {/* Offline Local Mode Pill */}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#18181C] border border-[#2B2D35] text-xs font-semibold text-[#767881]">
            <span className="material-symbols-outlined text-[14px]">wifi_off</span>
            Offline Local Mode
          </span>
        </div>
      </div>

      {/* Right: Actions and Indicators */}
      <div className="flex items-center gap-3">
        {/* Refresh Action */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh dashboard telemetry"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#18181C] hover:bg-[#202127] active:scale-[0.98] border border-[#2B2D35] text-xs font-medium text-[#F5F5F5] transition-all focus-visible:ring-2 focus-visible:ring-[#E0EA6C]/50"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        )}

        <div className="h-4 w-px bg-[#2B2D35]" />

        {/* Backend Connected Indicator */}
        <div
          title={isConnected ? 'Backend connected on 127.0.0.1:8000' : 'Backend connection error'}
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#14151B] border border-[#2B2D35] text-xs font-mono"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-400' : 'bg-[#FF5C5C] animate-pulse'
            }`}
          />
          <span className="text-[11px] text-[#767881] hidden sm:inline">
            {isConnected ? '127.0.0.1:8000' : 'Disconnected'}
          </span>
        </div>

        {/* Local Operator Avatar */}
        <div
          title="Local Operator Session"
          className="w-7 h-7 rounded-full bg-[#18181C] border border-[#2B2D35] flex items-center justify-center text-[#767881]"
        >
          <span className="material-symbols-outlined text-[16px]">person</span>
        </div>
      </div>
    </header>
  );
}

import { NavLink, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import type { ModelStatusResponse } from '@/types/api';
import { buttonTapMotion } from '@/utils/motion';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  modelStatus: ModelStatusResponse | null;
  backendConnected: boolean;
}

interface NavItem {
  path: string;
  label: string;
  iconName: string;
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', iconName: 'grid_view' },
  { path: '/image', label: 'Image Inspection', iconName: 'image' },
  { path: '/video', label: 'Video Inspection', iconName: 'movie' },
  { path: '/camera', label: 'Live Camera', iconName: 'videocam' },
  { path: '/history', label: 'Inspection History', iconName: 'history' },
];

export default function Sidebar({ isOpen, onClose, modelStatus, backendConnected }: SidebarProps) {
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();
  const isModelAvailable = modelStatus?.available ?? false;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-150"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Persistent Left Sidebar: 240px (w-60) */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-60 bg-[#14151B] border-r border-[#2B2D35]
          flex flex-col justify-between select-none
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-col">
          {/* Brand Header */}
          <div className="h-16 px-4 flex items-center justify-between border-b border-[#2B2D35]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#E0EA6C]/10 border border-[#E0EA6C]/30 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-[#E0EA6C]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="font-bold text-base text-[#F5F5F5] tracking-tight truncate">
                RoadVision
              </span>
            </div>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#E0EA6C]/10 text-[#E0EA6C] border border-[#E0EA6C]/30 uppercase tracking-wider">
              v0.1.0
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1 p-2 pt-3" aria-label="Main Navigation">
            {navItems.map((item) => {
              const isActive =
                location.pathname === item.path ||
                (item.path === '/dashboard' && (location.pathname === '/' || location.pathname === ''));

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className="relative group rounded-lg"
                >
                  <motion.div
                    whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                    className={`
                      relative z-10 flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors duration-150
                      focus-visible:ring-2 focus-visible:ring-[#E0EA6C]/50 focus-visible:outline-none
                      ${isActive ? 'text-[#090A0F]' : 'text-[#767881] group-hover:text-[#F5F5F5]'}
                    `}
                  >
                    <span className="material-symbols-outlined text-[20px] transition-transform duration-150 group-hover:scale-105">
                      {item.iconName}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </motion.div>

                  {/* Animated Active Pill Indicator */}
                  {isActive && (
                    <motion.span
                      layoutId="activeNavBackground"
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 500, damping: 38 }
                      }
                      className="absolute inset-0 bg-[#E0EA6C] rounded-lg shadow-[0_0_14px_rgba(224,234,108,0.22)] pointer-events-none"
                    />
                  )}

                  {/* Inactive Hover Indicator */}
                  {!isActive && (
                    <span className="absolute inset-0 rounded-lg bg-transparent group-hover:bg-[#18181C] transition-colors duration-150 pointer-events-none" />
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Local Engine Status Card */}
        <div className="p-3 border-t border-[#2B2D35] bg-[#0E0E12]">
          <div className="p-3 rounded-lg bg-[#18181C] border border-[#2B2D35] flex flex-col gap-1.5 transition-colors hover:border-[#3E424E]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#767881]">
                Local Engine
              </span>
              <span className="flex h-2 w-2 relative">
                {isModelAvailable && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E0EA6C] opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isModelAvailable
                      ? 'bg-[#E0EA6C]'
                      : backendConnected
                      ? 'bg-[#F59E0B]'
                      : 'bg-[#FF5C5C]'
                  }`}
                />
              </span>
            </div>

            <div className="text-xs font-mono font-semibold text-[#F5F5F5] truncate">
              {modelStatus?.primary_model || 'YOLO26m'}
            </div>

            <div className="text-[11px] text-[#6989FF] truncate font-mono">
              {backendConnected
                ? isModelAvailable
                  ? `Active: ${modelStatus?.active_model || 'Ready'}`
                  : 'Model Unavailable'
                : 'Backend Disconnected'}
            </div>

            <div className="mt-1 pt-1.5 border-t border-[#2B2D35] flex items-center justify-between text-[11px] font-mono text-[#767881]">
              <span>Fallback: {modelStatus?.fallback_model || 'YOLO26n'}</span>
              <span className={isModelAvailable ? 'text-[#E0EA6C]' : 'text-[#F59E0B]'}>
                {isModelAvailable ? 'Loaded' : 'Idle'}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

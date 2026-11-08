import { useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { modalBackdropVariants, modalDialogVariants, buttonTapMotion } from '@/utils/motion';

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDanger = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            variants={shouldReduceMotion ? undefined : modalBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onCancel}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Dialog Container */}
          <motion.div
            variants={shouldReduceMotion ? undefined : modalDialogVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative z-10 w-full max-w-md p-6 rounded-2xl bg-[#18181C] border border-[#2B2D35] shadow-2xl flex flex-col gap-4 select-none"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isDanger
                    ? 'bg-[#FF5C5C]/15 text-[#FF5C5C] border border-[#FF5C5C]/30'
                    : 'bg-[#6989FF]/15 text-[#6989FF] border border-[#6989FF]/30'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {isDanger ? 'delete_forever' : 'help'}
                </span>
              </div>
              <div>
                <h3 id="dialog-title" className="text-base font-bold text-[#F5F5F5]">{title}</h3>
                <p className="text-xs text-[#767881] mt-0.5 leading-relaxed">{message}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#2B2D35]/60">
              <motion.button
                type="button"
                whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                onClick={onCancel}
                className="px-4 py-2 rounded-lg bg-[#14151B] hover:bg-[#202127] border border-[#2B2D35] text-xs font-semibold text-[#A1A1AA] hover:text-[#F5F5F5] transition-colors focus-visible:ring-2 focus-visible:ring-[#E0EA6C]/40"
              >
                {cancelLabel}
              </motion.button>
              <motion.button
                type="button"
                whileTap={shouldReduceMotion ? undefined : buttonTapMotion}
                onClick={onConfirm}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-md focus-visible:ring-2 ${
                  isDanger
                    ? 'bg-[#FF5C5C] hover:bg-[#ff4545] text-white shadow-[#FF5C5C]/20 focus-visible:ring-[#FF5C5C]/50'
                    : 'bg-[#E0EA6C] hover:brightness-105 text-[#090A0F] shadow-[#E0EA6C]/20 focus-visible:ring-[#E0EA6C]/50'
                }`}
              >
                {confirmLabel}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

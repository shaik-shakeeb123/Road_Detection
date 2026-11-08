import { motion } from 'framer-motion';

interface LoadingStateProps {
  message?: string;
}

export default function LoadingState({ message = 'Loading…' }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <motion.div
        className="w-12 h-12 rounded-full border-2 border-[#292633] border-t-[#8B5CF6] shadow-[0_0_15px_rgba(139,92,246,0.2)]"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
      />
      <p className="mt-4 text-sm text-[#A1A1AA] font-medium tracking-tight">{message}</p>
    </div>
  );
}

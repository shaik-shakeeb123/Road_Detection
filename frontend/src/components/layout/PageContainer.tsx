import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { pageTransitionVariants } from '@/utils/motion';

interface PageContainerProps {
  children: React.ReactNode;
  locationKey: string;
}

export default function PageContainer({ children, locationKey }: PageContainerProps) {
  const shouldReduceMotion = useReducedMotion();
  const scrollContainerRef = useRef<HTMLElement>(null);

  // Smoothly reset scroll position to top when switching routes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [locationKey]);

  // If user prefers reduced motion, disable the vertical offset and speed up opacity
  const variants = shouldReduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: 0.1 } },
        exit: { opacity: 0, transition: { duration: 0.08 } },
      }
    : pageTransitionVariants;

  return (
    <main
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden bg-[#090A0F] px-4 sm:px-6 py-5 [scrollbar-gutter:stable]"
      style={{ scrollbarGutter: 'stable' }}
    >
      <div className="max-w-[1440px] mx-auto w-full min-h-full">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={locationKey}
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="w-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}

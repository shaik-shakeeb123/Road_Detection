import type { Variants, Transition } from 'framer-motion';

/**
 * RoadVision Design System — Central Motion Tokens
 * Inspired by Linear and Stripe: restrained, purposeful, high-performance.
 */

export const durations = {
  instant: 0.08,
  micro: 0.12,
  fast: 0.16,
  normal: 0.22,
  modal: 0.24,
  page: 0.2,
  progress: 0.4,
} as const;

export const easings = {
  // Polished deceleration curve (Linear / Stripe style)
  outExpo: [0.16, 1, 0.3, 1] as const,
  // Standard UI transition curve
  standard: [0.25, 0.1, 0.25, 1] as const,
  // Accelerated exit curve
  inExpo: [0.7, 0, 0.84, 0] as const,
};

export const transitions: Record<string, Transition> = {
  micro: { duration: durations.micro, ease: easings.standard },
  fast: { duration: durations.fast, ease: easings.outExpo },
  normal: { duration: durations.normal, ease: easings.outExpo },
  modal: { duration: durations.modal, ease: easings.outExpo },
  spring: { type: 'spring', stiffness: 420, damping: 32 },
  gentleSpring: { type: 'spring', stiffness: 300, damping: 28 },
};

export const pageTransitionVariants: Variants = {
  initial: {
    opacity: 0,
    y: 6,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: durations.page,
      ease: easings.outExpo,
    },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: {
      duration: durations.micro,
      ease: easings.standard,
    },
  },
};

export const fadeInVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: durations.fast } },
  exit: { opacity: 0, transition: { duration: durations.micro } },
};

export const fadeSlideUpVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.normal, ease: easings.outExpo },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: durations.fast, ease: easings.standard },
  },
};

export const staggerContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

export const modalBackdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: durations.fast, ease: easings.standard },
  },
  exit: {
    opacity: 0,
    transition: { duration: durations.micro, ease: easings.standard },
  },
};

export const modalDialogVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 10 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: durations.modal, ease: easings.outExpo },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 6,
    transition: { duration: durations.fast, ease: easings.standard },
  },
};

export const dropdownMenuVariants: Variants = {
  initial: { opacity: 0, scale: 0.95, y: -4 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: durations.fast, ease: easings.outExpo },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: -2,
    transition: { duration: durations.micro, ease: easings.standard },
  },
};

export const buttonTapMotion = {
  scale: 0.98,
  transition: { duration: durations.instant },
};

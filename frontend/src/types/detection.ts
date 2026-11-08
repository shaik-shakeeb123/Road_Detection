/** Four-class road damage classification */
export type DamageClassCode = 'D00' | 'D10' | 'D20' | 'D40';

export type ClassCounts = Record<DamageClassCode, number>;

export const DAMAGE_CLASSES: Record<DamageClassCode, { label: string; shortLabel: string; color: string; bgColor: string; borderColor: string }> = {
  D00: {
    label: 'Longitudinal Crack',
    shortLabel: 'Long.',
    color: '#6989FF',
    bgColor: 'rgba(105, 137, 255, 0.12)',
    borderColor: 'rgba(105, 137, 255, 0.4)',
  },
  D10: {
    label: 'Transverse Crack',
    shortLabel: 'Trans.',
    color: '#38BDF8',
    bgColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  D20: {
    label: 'Alligator Crack',
    shortLabel: 'Alligator',
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  D40: {
    label: 'Pothole',
    shortLabel: 'Pothole',
    color: '#FF5C5C',
    bgColor: 'rgba(255, 92, 92, 0.15)',
    borderColor: 'rgba(255, 92, 92, 0.5)',
  },
};

export const DAMAGE_CLASS_CODES: DamageClassCode[] = ['D00', 'D10', 'D20', 'D40'];

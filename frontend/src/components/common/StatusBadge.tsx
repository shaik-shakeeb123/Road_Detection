type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string; border: string; dot: string }> = {
  default: {
    bg: 'bg-[#18181C]',
    text: 'text-[#767881]',
    border: 'border-[#2B2D35]',
    dot: 'bg-[#767881]',
  },
  primary: {
    bg: 'bg-[#E0EA6C]/10',
    text: 'text-[#E0EA6C]',
    border: 'border-[#E0EA6C]/30',
    dot: 'bg-[#E0EA6C]',
  },
  success: {
    bg: 'bg-[#E0EA6C]/15',
    text: 'text-[#E0EA6C]',
    border: 'border-[#E0EA6C]/35',
    dot: 'bg-[#E0EA6C]',
  },
  info: {
    bg: 'bg-[#6989FF]/15',
    text: 'text-[#6989FF]',
    border: 'border-[#6989FF]/30',
    dot: 'bg-[#6989FF]',
  },
  warning: {
    bg: 'bg-[#F59E0B]/15',
    text: 'text-[#F59E0B]',
    border: 'border-[#F59E0B]/30',
    dot: 'bg-[#F59E0B]',
  },
  danger: {
    bg: 'bg-[#FF5C5C]/15',
    text: 'text-[#FF5C5C]',
    border: 'border-[#FF5C5C]/30',
    dot: 'bg-[#FF5C5C]',
  },
};

export default function StatusBadge({ label, variant = 'default', dot = true }: StatusBadgeProps) {
  const style = variantStyles[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style.bg} ${style.text} ${style.border}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />}
      <span className="capitalize">{label}</span>
    </span>
  );
}

import { DAMAGE_CLASSES, type DamageClassCode } from '@/types/detection';

interface DamageClassBadgeProps {
  code: DamageClassCode;
  count?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export default function DamageClassBadge({
  code,
  count,
  showLabel = false,
  size = 'sm',
}: DamageClassBadgeProps) {
  const meta = DAMAGE_CLASSES[code];
  if (!meta) return null;

  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-mono font-semibold uppercase tracking-wider ${sizeClasses}`}
      style={{
        backgroundColor: meta.bgColor,
        color: meta.color,
        border: `1px solid ${meta.borderColor}`,
      }}
      title={`${code} — ${meta.label}${count !== undefined ? `: ${count}` : ''}`}
    >
      {count !== undefined && <span>{count}x</span>}
      <span>{code}</span>
      {showLabel && <span className="font-sans normal-case text-[#F5F5F5] font-normal">• {meta.label}</span>}
    </span>
  );
}

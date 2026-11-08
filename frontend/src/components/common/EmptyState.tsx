interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center max-w-sm mx-auto">
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-[#111019] border border-[#292633] flex items-center justify-center mb-4 text-[#A1A1AA]">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-white mb-1 tracking-tight">{title}</h3>
      <p className="text-sm text-[#A1A1AA] max-w-xs leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export default function ErrorState({ title = 'Connection Failure', message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto p-8 rounded-2xl bg-[#171719] border border-[#292633] shadow-xl">
      <div className="w-12 h-12 rounded-xl bg-[#F43F5E]/15 border border-[#F43F5E]/30 flex items-center justify-center mb-4 text-[#F43F5E]">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <h3 className="text-base font-bold text-white mb-1.5">{title}</h3>
      <p className="text-sm text-[#A1A1AA] mb-6 leading-relaxed">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-5 py-2 text-sm font-medium text-white bg-[#8B5CF6] hover:bg-[#7c4def] rounded-xl transition-all shadow-md shadow-purple-950/50"
        >
          Retry Connection
        </button>
      )}
    </div>
  );
}

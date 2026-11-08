export default function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Subheader skeleton */}
      <div className="h-14 bg-[#18181C] border border-[#2B2D35] rounded-xl relative overflow-hidden">
        <div className="absolute inset-0 shimmer-effect pointer-events-none" />
      </div>

      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-32 bg-[#18181C] border border-[#2B2D35] rounded-xl p-4 relative overflow-hidden"
          >
            <div className="absolute inset-0 shimmer-effect pointer-events-none" />
          </div>
        ))}
      </div>

      {/* Analytics Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 h-80 bg-[#18181C] border border-[#2B2D35] rounded-xl relative overflow-hidden">
          <div className="absolute inset-0 shimmer-effect pointer-events-none" />
        </div>
        <div className="lg:col-span-4 h-80 bg-[#18181C] border border-[#2B2D35] rounded-xl relative overflow-hidden">
          <div className="absolute inset-0 shimmer-effect pointer-events-none" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="h-64 bg-[#18181C] border border-[#2B2D35] rounded-xl relative overflow-hidden">
        <div className="absolute inset-0 shimmer-effect pointer-events-none" />
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

/**
 * PageLoadingSkeleton - Lightweight loading fallback for lazy-loaded pages
 * Shows immediately while heavy page components are being fetched
 * Designed to minimize LCP by providing instant visual feedback
 */
export function PageLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Page title skeleton */}
        <Skeleton className="h-8 w-48" />
        
        {/* Content area skeleton */}
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-lg" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/**
 * Compact loading skeleton for smaller sections
 */
export function SectionLoadingSkeleton() {
  return (
    <div className="p-4 space-y-3">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-20 w-full rounded-lg" />
    </div>
  );
}

export default PageLoadingSkeleton;

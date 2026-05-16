import clsx from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skel", className)} aria-hidden />;
}

export function StatSkeleton() {
  return (
    <div className="card">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-28 mt-3" />
      <Skeleton className="h-3 w-32 mt-3" />
    </div>
  );
}

export function CardSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <div className="card">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-5 w-64 mt-2" />
      <Skeleton className={clsx("w-full mt-4", height)} />
    </div>
  );
}

import { cn } from "@/lib/utils";

type LayoutPreset = "4-col" | "5-col" | "3-col";

interface AdminRowLayoutProps {
  children: React.ReactNode;
  preset?: LayoutPreset;
  className?: string;
}

const presetClasses: Record<LayoutPreset, string> = {
  "3-col": "grid-cols-1 md:grid-cols-[1fr_minmax(180px,auto)_minmax(140px,auto)]",
  "4-col": "grid-cols-1 md:grid-cols-[1fr_minmax(180px,auto)_minmax(140px,auto)_minmax(100px,auto)]",
  "5-col": "grid-cols-1 md:grid-cols-[1fr_minmax(160px,auto)_minmax(120px,auto)_minmax(100px,auto)_minmax(100px,auto)]",
};

export function AdminRowLayout({ 
  children, 
  preset = "4-col", 
  className 
}: AdminRowLayoutProps) {
  return (
    <div 
      className={cn(
        "grid gap-3 md:gap-6 items-center",
        presetClasses[preset],
        className
      )}
    >
      {children}
    </div>
  );
}

interface AdminRowCellProps {
  children: React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}

export function AdminRowCell({ 
  children, 
  className, 
  hideOnMobile = false 
}: AdminRowCellProps) {
  return (
    <div 
      className={cn(
        hideOnMobile && "hidden md:block",
        className
      )}
    >
      {children}
    </div>
  );
}

interface AdminRowPrimaryProps {
  avatar?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
  className?: string;
}

export function AdminRowPrimary({ 
  avatar, 
  title, 
  subtitle, 
  badges,
  className 
}: AdminRowPrimaryProps) {
  return (
    <div className={cn("flex items-center gap-3 min-w-0", className)}>
      {avatar && (
        <div className="shrink-0">
          {avatar}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <span className="font-semibold truncate">{title}</span>
          {badges}
        </div>
        {subtitle && (
          <div className="text-sm text-muted-foreground truncate">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

interface AdminRowProgressProps {
  label?: string;
  current: number;
  total: number;
  className?: string;
}

export function AdminRowProgress({ 
  label = "Progress", 
  current, 
  total, 
  className 
}: AdminRowProgressProps) {
  const percent = total > 0 ? (current / total) * 100 : 0;
  const colorClass = percent === 100 
    ? "bg-green-500" 
    : percent >= 50 
      ? "bg-blue-500" 
      : "bg-amber-500";

  return (
    <div className={cn("w-full min-w-[140px]", className)}>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{current}/{total}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all duration-300", colorClass)}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

interface AdminRowMobileExtrasProps {
  children: React.ReactNode;
  className?: string;
}

export function AdminRowMobileExtras({ 
  children, 
  className 
}: AdminRowMobileExtrasProps) {
  return (
    <div className={cn("md:hidden mt-3 flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

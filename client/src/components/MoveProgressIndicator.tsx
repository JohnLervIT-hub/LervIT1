import { BOOKING_STATUSES, BOOKING_STATUS_INFO, type BookingStatus } from "@shared/schema";
import { Check, Truck, Package, MapPin, Home, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MoveProgressIndicatorProps {
  currentStatus: string;
  className?: string;
}

const PROGRESS_STEPS: { status: BookingStatus; icon: typeof Check; label: string }[] = [
  { status: BOOKING_STATUSES.CONFIRMED, icon: Clock, label: "Confirmed" },
  { status: BOOKING_STATUSES.EN_ROUTE_TO_PICKUP, icon: Truck, label: "On the Way" },
  { status: BOOKING_STATUSES.LOADING, icon: Package, label: "Loading" },
  { status: BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF, icon: MapPin, label: "In Transit" },
  { status: BOOKING_STATUSES.UNLOADING, icon: Package, label: "Unloading" },
  { status: BOOKING_STATUSES.COMPLETED, icon: Home, label: "Delivered" },
];

function getStepIndex(status: string): number {
  if (status === "in_transit") return 1;
  const index = PROGRESS_STEPS.findIndex((step) => step.status === status);
  return index >= 0 ? index : -1;
}

function getStatusColorClass(status: string, isActive: boolean, isCompleted: boolean): string {
  if (isCompleted) return "bg-green-500 text-white border-green-500";
  if (isActive) {
    switch (status) {
      case BOOKING_STATUSES.EN_ROUTE_TO_PICKUP:
        return "bg-orange-500 text-white border-orange-500 animate-pulse";
      case BOOKING_STATUSES.LOADING:
        return "bg-purple-500 text-white border-purple-500 animate-pulse";
      case BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF:
        return "bg-blue-500 text-white border-blue-500 animate-pulse";
      case BOOKING_STATUSES.UNLOADING:
        return "bg-teal-500 text-white border-teal-500 animate-pulse";
      default:
        return "bg-primary text-primary-foreground border-primary animate-pulse";
    }
  }
  return "bg-muted text-muted-foreground border-muted-foreground/30";
}

function getLineColorClass(isCompleted: boolean): string {
  return isCompleted ? "bg-green-500" : "bg-muted-foreground/20";
}

export default function MoveProgressIndicator({ currentStatus, className }: MoveProgressIndicatorProps) {
  const currentStepIndex = getStepIndex(currentStatus);
  
  if (currentStatus === BOOKING_STATUSES.PENDING) {
    return (
      <div className={cn("p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800", className)}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <Clock className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <p className="font-medium text-yellow-800 dark:text-yellow-200">Awaiting Mover Assignment</p>
            <p className="text-sm text-yellow-600 dark:text-yellow-400">We're matching you with the best available mover</p>
          </div>
        </div>
      </div>
    );
  }

  if (currentStatus === BOOKING_STATUSES.CANCELLED) {
    return (
      <div className={cn("p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800", className)}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
            <X className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="font-medium text-red-800 dark:text-red-200">Move Cancelled</p>
            <p className="text-sm text-red-600 dark:text-red-400">This booking has been cancelled</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("", className)} data-testid="progress-indicator">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-muted-foreground">Move Progress</h4>
        <span className="text-xs text-muted-foreground">
          Step {Math.min(currentStepIndex + 1, PROGRESS_STEPS.length)} of {PROGRESS_STEPS.length}
        </span>
      </div>
      
      <div className="flex items-center">
        {PROGRESS_STEPS.map((step, index) => {
          const isCompleted = index < currentStepIndex;
          const isActive = index === currentStepIndex;
          const Icon = isCompleted ? Check : step.icon;
          
          return (
            <div key={step.status} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 flex items-center justify-center transition-all",
                    getStatusColorClass(step.status, isActive, isCompleted)
                  )}
                  data-testid={`step-${step.status}`}
                >
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <span className={cn(
                  "text-[10px] sm:text-xs mt-1 text-center max-w-[60px] sm:max-w-[80px] leading-tight",
                  isActive ? "font-semibold text-foreground" : isCompleted ? "text-green-600" : "text-muted-foreground"
                )}>
                  {step.label}
                </span>
              </div>
              
              {index < PROGRESS_STEPS.length - 1 && (
                <div className={cn(
                  "flex-1 h-1 mx-1 sm:mx-2 rounded-full transition-all",
                  getLineColorClass(index < currentStepIndex)
                )} />
              )}
            </div>
          );
        })}
      </div>
      
      {currentStepIndex >= 0 && currentStepIndex < PROGRESS_STEPS.length && (
        <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-sm font-medium text-primary" data-testid="status-description">
            {BOOKING_STATUS_INFO[PROGRESS_STEPS[currentStepIndex].status]?.description || "Move in progress"}
          </p>
        </div>
      )}
    </div>
  );
}

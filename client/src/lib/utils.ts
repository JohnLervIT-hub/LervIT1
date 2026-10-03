import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { VEHICLE_DISPLAY_NAMES } from "@shared/vehicle-labels"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Lenient wrapper over the canonical tier names in @shared/vehicle-labels:
 * tolerates any string, reports "Not set" for empty, and passes an unrecognised
 * value through unchanged (the movers table holds legacy free-form types).
 */
export function getVehicleDisplayName(vehicleType: string | null | undefined): string {
  if (!vehicleType) return "Not set";
  const normalized = vehicleType.toLowerCase();
  return (VEHICLE_DISPLAY_NAMES as Record<string, string>)[normalized] || vehicleType;
}

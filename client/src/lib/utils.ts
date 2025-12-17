import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Vehicle type display names aligned with Vision Engine categories
const VEHICLE_DISPLAY_NAMES: Record<string, string> = {
  car: "SUV / Small Vehicle",
  van: "Cargo Van",
  pickup: "Pickup Truck",
  truck: "Moving Truck",
};

export function getVehicleDisplayName(vehicleType: string | null | undefined): string {
  if (!vehicleType) return "Not set";
  const normalized = vehicleType.toLowerCase();
  return VEHICLE_DISPLAY_NAMES[normalized] || vehicleType;
}

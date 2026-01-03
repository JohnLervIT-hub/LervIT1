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

// Base prices for each vehicle type (from shared/pricing.ts VEHICLE_CLASSES)
const VEHICLE_BASE_PRICES: Record<string, number> = {
  car: 15.00,     // Class A
  van: 22.00,     // Class B (minimum for van category)
  pickup: 40.00,  // Class D
  truck: 50.00,   // Class E
};

export function getVehicleDisplayName(vehicleType: string | null | undefined): string {
  if (!vehicleType) return "Not set";
  const normalized = vehicleType.toLowerCase();
  return VEHICLE_DISPLAY_NAMES[normalized] || vehicleType;
}

export function getVehicleBasePrice(vehicleType: string | null | undefined): number | null {
  if (!vehicleType) return null;
  const normalized = vehicleType.toLowerCase();
  return VEHICLE_BASE_PRICES[normalized] ?? null;
}

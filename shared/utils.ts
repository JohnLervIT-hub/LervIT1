// Utility functions for type conversions

/**
 * Convert a JavaScript number to a decimal string with fixed precision
 * Ensures consistent decimal representation for database storage
 * 
 * @param value - The numeric value to convert
 * @param scale - Number of decimal places (default: 2)
 * @returns String representation with fixed decimal places
 */
export function toDecimalString(value: number, scale: number = 2): string {
  return value.toFixed(scale);
}

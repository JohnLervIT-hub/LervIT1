/**
 * Volume helpers shared by the vision engine, the pricing path and the UI.
 */

/**
 * Volume of a multi-piece item when only some of its pieces are being moved.
 *
 * Pieces are treated as equal shares of the assembled bounding box, which is
 * the same assumption the database rows already make: a 3-piece sectional is
 * stored as one box, so two of its three pieces are two thirds of that box.
 * It is an approximation — a chaise is bigger than a corner wedge — and it is
 * deliberately linear so the customer-facing number is predictable.
 */
export function scaledVolume(
  baseVolume: number,
  basePieces: number,
  selectedPieces: number,
): number {
  if (!basePieces || basePieces <= 0) return baseVolume;
  return Math.round((baseVolume * (selectedPieces / basePieces)) * 100) / 100;
}

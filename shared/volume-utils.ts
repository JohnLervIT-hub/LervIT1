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

/**
 * Smallest piece count a multi-piece item may be reduced to.
 *
 * An L-shaped sectional is at minimum a run plus a return, and a U-shaped one a
 * run plus two returns — below that it stops being that shape and the customer
 * is describing a different item, not a partial load.
 *
 * `name` and `subcategory` are concatenated and searched, so either may carry
 * the shape. Prefer the matched catalogue row's text: the name persisted on an
 * identified_items row is the vision model's phrasing, which usually includes
 * the shape because the prompt asks for it, but is not guaranteed to.
 *
 * U is tested first: "L/U-shaped" rows (the large sectional sofa bed) are the
 * stricter case.
 */
export function getMinPieceCount(name: string, subcategory?: string): number {
  const text = `${name} ${subcategory ?? ''}`.toLowerCase();
  if (text.includes('u-shaped') || text.includes('u-shape')) return 3;
  if (text.includes('l-shaped') || text.includes('l-shape')) return 2;
  return 1;
}

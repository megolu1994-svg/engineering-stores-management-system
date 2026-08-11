/**
 * Numeric material-code rule for every bulk upload (MB51, MB52, the
 * count-based Stock Update, the Material Master Excel import, Bulk
 * Allocate, and the bulk pick-list search).
 *
 * Material Master codes are numeric. SAP exports may carry an alphabetic
 * prefix (e.g. "IN000219") or leading zeros ("000219"); both normalize to
 * the plain numeric form ("219") before any lookup or import. Values with
 * no digits at all are rejected as non-numeric material codes.
 */
export function normalizeMaterialCode(
  raw: string | null | undefined
): string | null {
  if (raw === null || raw === undefined) return null;

  const digits = String(raw).replace(/\D/g, "");

  if (digits === "") return null;

  return digits.replace(/^0+(?=\d)/, "");
}

export function isNumericMaterialCode(
  raw: string | null | undefined
): boolean {
  return normalizeMaterialCode(raw) !== null;
}

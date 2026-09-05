export interface Material {
  material_code: string;
  short_description: string;
  uom: string;
  current_quantity: number;
  hsn_code: string;
  material_group: string;
  is_active: boolean;
  /** When true, the material is blocked: no transactions, stock
   *  updates, SAP stock updates or SAP history updates are allowed. */
  is_blocked?: boolean;
  blocked_at?: string | null;
  blocked_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}
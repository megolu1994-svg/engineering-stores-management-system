export interface Material {
  material_code: string;
  short_description: string;
  uom: string;
  current_quantity: number;
  hsn_code: string;
  material_group: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}
export interface MaterialAllocation {
  id?: number;
  material_code: string;
  storage_location_code: string;
  location_code: string;
  quantity: number;
  created_at?: string;
}
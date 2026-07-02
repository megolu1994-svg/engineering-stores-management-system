import { supabase } from "../config/supabase";
import type { MaterialAllocation } from "../types/materialAllocation";

export async function getAllocations(materialCode: string) {
  const { data, error } = await supabase
      .from("material_allocation")
          .select("*")
              .eq("material_code", materialCode);

                if (error) {
                    console.error(error);
                        return [];
                          }

                            return data as MaterialAllocation[];
                            }

                            export async function addAllocation(
                              allocation: Omit<MaterialAllocation, "id">
                              ) {
                                const { error } = await supabase
                                    .from("material_allocation")
                                        .insert([allocation]);

                                          if (error) console.error(error);
                                          }

                                          export async function updateAllocation(
                                            id: number,
                                              quantity: number
                                              ) {
                                                const { error } = await supabase
                                                    .from("material_allocation")
                                                        .update({
                                                              quantity,
                                                                  })
                                                                      .eq("id", id);

                                                                        if (error) console.error(error);
                                                                        }

                                                                        export async function deleteAllocation(id: number) {
                                                                          const { error } = await supabase
                                                                              .from("material_allocation")
                                                                                  .delete()
                                                                                      .eq("id", id);

                                                                                        if (error) console.error(error);
                                                                                        }
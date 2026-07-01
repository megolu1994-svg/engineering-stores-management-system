import { useEffect, useState } from "react";
import { getMaterials } from "../services/materialService";
import MaterialTable from "../components/MaterialTable";
import type { Material } from "../types/material";

export default function MaterialMaster() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMaterials();
  }, []);

  async function loadMaterials() {
    setLoading(true);

    const data = await getMaterials();

    setMaterials(data);
    setLoading(false);
  }

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "30px auto",
        padding: 20,
      }}
    >
      <h1>Material Master</h1>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <input
          type="text"
          placeholder="Search Material..."
          style={{
            width: 350,
            padding: 10,
            fontSize: 16,
          }}
        />

        <button
          style={{
            padding: "10px 20px",
            cursor: "pointer",
          }}
        >
          + Add Material
        </button>
      </div>

      {loading ? (
        <h3>Loading...</h3>
      ) : materials.length === 0 ? (
        <h3>No Materials Found</h3>
      ) : (
        <MaterialTable materials={materials} />
      )}
    </div>
  );
}
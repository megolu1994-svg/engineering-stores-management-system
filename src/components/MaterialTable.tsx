import type { Material } from "../types/material";

type Props = {
  materials: Material[];
};

export default function MaterialTable({ materials }: Props) {
  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        marginTop: 20,
      }}
    >
      <thead>
        <tr>
          <th>Material Code</th>
          <th>Description</th>
          <th>UoM</th>
          <th>Qty</th>
        </tr>
      </thead>

      <tbody>
        {materials.map((material) => (
          <tr key={material.material_code}>
            <td>{material.material_code}</td>
            <td>{material.short_description}</td>
            <td>{material.uom}</td>
            <td>{material.current_quantity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
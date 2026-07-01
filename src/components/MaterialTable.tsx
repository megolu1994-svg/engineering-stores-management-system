import type { Material } from "../types/material";
import { DataGrid } from "@mui/x-data-grid";
import type { GridColDef } from "@mui/x-data-grid";
import Paper from "@mui/material/Paper";

type Props = {
  materials: Material[];
};

export default function MaterialTable({ materials }: Props) {
  const columns: GridColDef[] = [
    {
      field: "material_code",
      headerName: "Material Code",
      width: 170,
    },
    {
      field: "short_description",
      headerName: "Description",
      flex: 1,
    },
    {
      field: "uom",
      headerName: "UoM",
      width: 100,
    },
    {
      field: "current_quantity",
      headerName: "Qty",
      width: 120,
      type: "number",
    },
  ];

  const rows = materials.map((m) => ({
    id: m.material_code,
    ...m,
  }));

  return (
    <Paper elevation={3}>
      <DataGrid
        rows={rows}
        columns={columns}
        pageSizeOptions={[10, 25, 50]}
        initialState={{
          pagination: {
            paginationModel: {
              pageSize: 10,
              page: 0,
            },
          },
        }}
        disableRowSelectionOnClick
        autoHeight
      />
    </Paper>
  );
}
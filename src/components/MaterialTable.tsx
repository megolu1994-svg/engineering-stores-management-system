import type { Material } from "../types/material";

import Paper from "@mui/material/Paper";
import IconButton from "@mui/material/IconButton";

import { DataGrid } from "@mui/x-data-grid";
import type { GridColDef } from "@mui/x-data-grid";

import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

interface Props {
  materials: Material[];
  onEdit: (material: Material) => void;
  onDelete: (material: Material) => void;
}

export default function MaterialTable({
  materials,
  onEdit,
  onDelete,
}: Props) {

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
      width: 100,
      type: "number",
    },

    {
      field: "actions",
      headerName: "Actions",
      width: 120,
      sortable: false,

      renderCell: (params) => (
        <>

          <IconButton
            color="primary"
            onClick={() =>
              onEdit(params.row as Material)
            }
          >
            <EditIcon />
          </IconButton>

          <IconButton
            color="error"
            onClick={() =>
              onDelete(params.row as Material)
            }
          >
            <DeleteIcon />
          </IconButton>

        </>
      ),
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
        autoHeight
        disableRowSelectionOnClick
        pageSizeOptions={[10, 25, 50]}
        initialState={{
          pagination: {
            paginationModel: {
              pageSize: 10,
              page: 0,
            },
          },
        }}
      />

    </Paper>

  );

}
import type { Location } from "../types/location";

import Paper from "@mui/material/Paper";
import IconButton from "@mui/material/IconButton";

import { DataGrid } from "@mui/x-data-grid";
import type { GridColDef } from "@mui/x-data-grid";

import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

interface Props {
  locations: Location[];
  onEdit: (location: Location) => void;
  onDelete: (location: Location) => void;
}

export default function LocationTable({
  locations,
  onEdit,
  onDelete,
}: Props) {

  const columns: GridColDef[] = [

    {
      field: "location_code",
      headerName: "Location Code",
      width: 180,
    },

    {
      field: "location_description",
      headerName: "Description",
      flex: 1,
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
            onClick={() => onEdit(params.row as Location)}
          >
            <EditIcon />
          </IconButton>

          <IconButton
            color="error"
            onClick={() => onDelete(params.row as Location)}
          >
            <DeleteIcon />
          </IconButton>
        </>
      ),
    },

  ];

  const rows = locations.map((location) => ({
    id: location.location_code,
    ...location,
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
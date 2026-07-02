import { useEffect, useRef, useState } from "react";

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Snackbar,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import MaterialSearch from "../components/MaterialSearch";
import AllocationSummary from "../components/AllocationSummary";
import AllocationTable from "../components/AllocationTable";
import AllocationForm from "../components/AllocationForm";

import type { Material } from "../types/material";
import type { MaterialAllocation as MaterialAllocationType } from "../types/materialAllocation";

import {
  getAllocations,
  addAllocation,
  updateAllocation,
  deleteAllocation,
} from "../services/materialAllocationService";

type SnackbarSeverity = "success" | "error" | "warning" | "info";

interface EditDialogState {
  open: boolean;
  allocation: MaterialAllocationType | null;
  quantity: string;
}

interface DeleteDialogState {
  open: boolean;
  id: number | null;
}

export default function MaterialAllocation() {
  const theme = useTheme();
  const fullScreenDialogs = useMediaQuery(theme.breakpoints.down("sm"));

  const [material, setMaterial] = useState<Material | null>(null);

  const [allocations, setAllocations] = useState<MaterialAllocationType[]>(
    []
  );

  const [allocatedQty, setAllocatedQty] = useState(0);

  const [loadingAllocations, setLoadingAllocations] = useState(false);

  const [savingAllocation, setSavingAllocation] = useState(false);

  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const [snackbarMessage, setSnackbarMessage] = useState("");

  const [snackbarSeverity, setSnackbarSeverity] =
    useState<SnackbarSeverity>("info");

  const [editDialog, setEditDialog] = useState<EditDialogState>({
    open: false,
    allocation: null,
    quantity: "",
  });

  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    id: null,
  });

  const allocationsRef = useRef<HTMLDivElement | null>(null);

  function showSnackbar(message: string, severity: SnackbarSeverity) {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  }

  async function loadAllocations(materialCode: string) {
    setLoadingAllocations(true);

    try {
      const data = await getAllocations(materialCode);

      setAllocations(data);

      let total = 0;

      data.forEach((row) => {
        total += Number(row.quantity);
      });

      setAllocatedQty(total);
    } finally {
      setLoadingAllocations(false);
    }
  }

  useEffect(() => {
    if (!material) {
      setAllocations([]);
      setAllocatedQty(0);
      return;
    }

    loadAllocations(material.material_code);
  }, [material]);

  function scrollToAllocations() {
    setTimeout(() => {
      allocationsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }

  async function handleAllocate(locationCode: string, quantity: number) {
    if (!material) {
      showSnackbar("Please select a material first.", "warning");
      return;
    }

    if (!locationCode) {
      showSnackbar("Please select a location.", "warning");
      return;
    }

    if (!quantity || quantity <= 0) {
      showSnackbar("Please enter a valid quantity.", "warning");
      return;
    }

    const existingRow = allocations.find(
      (a) => a.location_code === locationCode
    );

    const balance = material.current_quantity - allocatedQty;

    if (quantity > balance) {
      showSnackbar(
        `Cannot allocate more than available balance (${balance} ${material.uom}).`,
        "error"
      );
      return;
    }

    setSavingAllocation(true);

    try {
      if (existingRow && existingRow.id !== undefined) {
        const newQuantity = existingRow.quantity + quantity;

        await updateAllocation(existingRow.id, newQuantity);

        showSnackbar(
          `Allocation updated for location ${locationCode}.`,
          "success"
        );
      } else {
        await addAllocation({
          material_code: material.material_code,
          location_code: locationCode,
          quantity,
        });

        showSnackbar(
          `Stock allocated to location ${locationCode}.`,
          "success"
        );
      }

      await loadAllocations(material.material_code);

      scrollToAllocations();
    } catch (err) {
      showSnackbar("Something went wrong while saving the allocation.", "error");
    } finally {
      setSavingAllocation(false);
    }
  }

  function handleEdit(allocation: MaterialAllocationType) {
    setEditDialog({
      open: true,
      allocation,
      quantity: String(allocation.quantity),
    });
  }

  function closeEditDialog() {
    setEditDialog({
      open: false,
      allocation: null,
      quantity: "",
    });
  }

  async function handleEditSave() {
    if (!material || !editDialog.allocation) {
      closeEditDialog();
      return;
    }

    const newQuantity = Number(editDialog.quantity);

    if (!newQuantity || newQuantity <= 0) {
      showSnackbar("Please enter a valid quantity.", "warning");
      return;
    }

    const otherAllocatedQty =
      allocatedQty - editDialog.allocation.quantity;

    const availableBalance = material.current_quantity - otherAllocatedQty;

    if (newQuantity > availableBalance) {
      showSnackbar(
        `Cannot allocate more than available balance (${availableBalance} ${material.uom}).`,
        "error"
      );
      return;
    }

    if (editDialog.allocation.id === undefined) {
      showSnackbar("Invalid allocation record.", "error");
      return;
    }

    setSavingAllocation(true);

    try {
      await updateAllocation(editDialog.allocation.id, newQuantity);

      showSnackbar("Allocation updated successfully.", "success");

      closeEditDialog();

      await loadAllocations(material.material_code);
    } catch (err) {
      showSnackbar("Something went wrong while updating the allocation.", "error");
    } finally {
      setSavingAllocation(false);
    }
  }

  function handleDelete(id: number) {
    setDeleteDialog({
      open: true,
      id,
    });
  }

  function closeDeleteDialog() {
    setDeleteDialog({
      open: false,
      id: null,
    });
  }

  async function handleDeleteConfirm() {
    if (!material || deleteDialog.id === null) {
      closeDeleteDialog();
      return;
    }

    setSavingAllocation(true);

    try {
      await deleteAllocation(deleteDialog.id);

      showSnackbar("Allocation deleted successfully.", "success");

      closeDeleteDialog();

      await loadAllocations(material.material_code);
    } catch (err) {
      showSnackbar("Something went wrong while deleting the allocation.", "error");
    } finally {
      setSavingAllocation(false);
    }
  }

  return (
    <Box sx={{ pb: 4 }}>
      <Typography
        variant="h5"
        sx={{
          mb: 2,
          fontWeight: "bold",
          fontSize: { xs: "1.25rem", sm: "1.5rem", md: "2rem" },
        }}
      >
        Stock Allocation
      </Typography>

      <Box sx={{ mb: 2 }}>
        <MaterialSearch value={material} onChange={setMaterial} />
      </Box>

      <AllocationSummary material={material} allocatedQty={allocatedQty} />

      {material ? (
        <AllocationForm onAllocate={handleAllocate} />
      ) : (
        <Alert severity="info" sx={{ mb: 2 }}>
          Please select a material to allocate stock.
        </Alert>
      )}

      <Box ref={allocationsRef}>
        <Typography variant="subtitle1" sx={{ fontWeight: "bold", mb: 1.5 }}>
          Current Allocations
        </Typography>

        {loadingAllocations ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <AllocationTable
            allocations={allocations}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}
      </Box>

      {/* Edit Allocation Dialog */}
      <Dialog
        open={editDialog.open}
        onClose={closeEditDialog}
        fullWidth
        maxWidth="xs"
        fullScreen={fullScreenDialogs}
      >
        <DialogTitle>Edit Allocation</DialogTitle>

        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Location: <strong>{editDialog.allocation?.location_code}</strong>
          </DialogContentText>

          <TextField
            label="Quantity"
            type="number"
            fullWidth
            value={editDialog.quantity}
            onChange={(e) =>
              setEditDialog((prev) => ({
                ...prev,
                quantity: e.target.value,
              }))
            }
            slotProps={{
              htmlInput: {
                inputMode: "numeric",
              },
            }}
          />
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={closeEditDialog}
            disabled={savingAllocation}
            fullWidth={fullScreenDialogs}
            sx={{ minHeight: 48 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleEditSave}
            disabled={savingAllocation}
            fullWidth={fullScreenDialogs}
            sx={{ minHeight: 48 }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={closeDeleteDialog}
        fullWidth
        maxWidth="xs"
        fullScreen={fullScreenDialogs}
      >
        <DialogTitle>Delete Allocation</DialogTitle>

        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this allocation? This action
            cannot be undone.
          </DialogContentText>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={closeDeleteDialog}
            disabled={savingAllocation}
            fullWidth={fullScreenDialogs}
            sx={{ minHeight: 48 }}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDeleteConfirm}
            disabled={savingAllocation}
            fullWidth={fullScreenDialogs}
            sx={{ minHeight: 48 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snackbarSeverity}
          variant="filled"
          onClose={() => setSnackbarOpen(false)}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}

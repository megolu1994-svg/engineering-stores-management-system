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
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import Inventory2Icon from "@mui/icons-material/Inventory2";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import PlaylistAddIcon from "@mui/icons-material/PlaylistAdd";
import TuneIcon from "@mui/icons-material/Tune";

import MaterialSearch from "../components/MaterialSearch";
import MaterialPhotoUploadButton from "../components/MaterialPhotoUploadButton";
import AllocationSummary from "../components/AllocationSummary";
import AllocationTable from "../components/AllocationTable";
import AllocationForm from "../components/AllocationForm";
import BulkAllocateCard from "../components/BulkAllocateCard";
import CurrentStockTab from "../components/CurrentStockTab";
import OpeningStockTab from "../components/OpeningStockTab";
import AdjustmentTab from "../components/AdjustmentTab";
import LocationTransfer from "./LocationTransfer";
import { useSwipeTabs } from "../hooks/useSwipeTabs";
import { usePersistentState } from "../hooks/usePersistentState";
import SwipeableTabPanel from "../components/SwipeableTabPanel";

import type { Material } from "../types/material";
import type { MaterialAllocation as MaterialAllocationType } from "../types/materialAllocation";

import { searchMaterials } from "../services/materialService";
import {
  getAllocations,
  addAllocation,
  updateAllocation,
  deleteAllocation,
} from "../services/materialAllocationService";
import { uploadMaterialPhoto } from "../services/materialPhotoService";

const UNALLOCATED_LOCATION = "UNALLOCATED";

function safeNumber(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

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

const TAB_CURRENT_STOCK = 0;
const TAB_ALLOCATION = 1;
const TAB_TRANSFER = 2;
const TAB_OPENING_STOCK = 3;
const TAB_ADJUSTMENT = 4;

export default function MaterialAllocation() {
  const theme = useTheme();
  const fullScreenDialogs = useMediaQuery(theme.breakpoints.down("sm"));
  const desktop = useMediaQuery(theme.breakpoints.up("md"));

  const [activeTab, setActiveTab] = usePersistentState(
    "materialAllocation.activeTab",
    TAB_ALLOCATION
  );

  const { direction } = useSwipeTabs(activeTab, setActiveTab, 5);

  const [material, setMaterial] = usePersistentState<Material | null>(
    "materialAllocation.material",
    null
  );

  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);

  const [allocations, setAllocations] = useState<MaterialAllocationType[]>(
    []
  );

  // Derived purely from the Inventory Engine's material_allocation rows -
  // Material Master no longer carries a quantity, so these are the only
  // source of truth for stock figures anywhere in this module.
  const totalStock = safeNumber(
    allocations.reduce((sum, a) => sum + safeNumber(a.quantity), 0)
  );
  const unallocatedQty = safeNumber(
    allocations
      .filter((a) => a.location_code === UNALLOCATED_LOCATION)
      .reduce((sum, a) => sum + safeNumber(a.quantity), 0)
  );
  const allocatedQty = safeNumber(totalStock - unallocatedQty);

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
    } finally {
      setLoadingAllocations(false);
    }
  }

  useEffect(() => {
    setPendingPhoto(null);

    if (!material) {
      setAllocations([]);
      return;
    }

    loadAllocations(material.material_code);
  }, [material]);

  // The selected material can be restored from a previous visit (see
  // usePersistentState above) - refresh its own fields once on mount in
  // case its Material Master record changed elsewhere in the meantime,
  // so uom/description shown here don't go stale across a long gap.
  useEffect(() => {
    if (!material) return;

    let cancelled = false;

    searchMaterials(material.material_code, 0, 1)
      .then((results) => {
        if (cancelled) return;
        const exact = results.find(
          (m) => m.material_code === material.material_code
        );
        if (exact) setMaterial(exact);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Called when a Recent Activity / search card is tapped in the Current
  // Stock tab: looks up the full Material record (reusing the existing
  // searchMaterials service, a targeted lookup - not a full table load)
  // and switches to the Allocation tab with it already selected, so the
  // user doesn't have to search again.
  async function handleSelectMaterialFromCurrentStock(materialCode: string) {
    try {
      const results = await searchMaterials(materialCode, 0, 1);
      const exact =
        results.find((m) => m.material_code === materialCode) ??
        results[0] ??
        null;

      if (exact) {
        setMaterial(exact);
        setActiveTab(TAB_ALLOCATION);
      } else {
        showSnackbar("Could not load that material.", "error");
      }
    } catch {
      showSnackbar("Could not load that material.", "error");
    }
  }

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

    const availableToAllocate = safeNumber(unallocatedQty);

    if (quantity > availableToAllocate) {
      showSnackbar(
        `Cannot allocate more than the unallocated balance (${availableToAllocate} ${material.uom}).`,
        "error"
      );
      return;
    }

    setSavingAllocation(true);

    try {
      if (existingRow && existingRow.id !== undefined) {
        const newQuantity = existingRow.quantity + quantity;

        await updateAllocation(existingRow.id, newQuantity);
      } else {
        await addAllocation({
          material_code: material.material_code,
          location_code: locationCode,
          quantity,
        });
      }

      const allocationMessage = existingRow
        ? `Allocation updated for location ${locationCode}.`
        : `Stock allocated to location ${locationCode}.`;

      if (pendingPhoto) {
        try {
          await uploadMaterialPhoto(material.material_code, pendingPhoto);
          setPendingPhoto(null);

          showSnackbar(
            `${allocationMessage} Photo uploaded to material master.`,
            "success"
          );
        } catch {
          showSnackbar(
            `${allocationMessage} However, the photo failed to upload - please try again.`,
            "warning"
          );
        }
      } else {
        showSnackbar(allocationMessage, "success");
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

    const currentQty = safeNumber(editDialog.allocation.quantity);
    const availableBalance = safeNumber(unallocatedQty);

    if (newQuantity - currentQty > availableBalance) {
      showSnackbar(
        `Cannot allocate more than the unallocated balance (${availableBalance} ${material.uom}).`,
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
    <Box sx={{ pb: 3 }}>
      <Typography
        sx={{
          mb: 1,
          fontWeight: 700,
          fontSize: { xs: "1.05rem", sm: "1.25rem" },
        }}
      >
        Inventory
      </Typography>

      <Tabs
        value={activeTab}
        onChange={(_, value) => setActiveTab(value)}
        variant={desktop ? "standard" : "fullWidth"}
        sx={{
          minHeight: { xs: 56, md: 48 },
          borderBottom: 1,
          borderColor: "divider",
          mb: { xs: 1.5, md: 2.5 },
          borderRadius: { xs: 2, md: 0 },
          bgcolor: { xs: "grey.50", md: "transparent" },
          "& .MuiTab-root": {
            fontWeight: 700,
            textTransform: "none",
            minHeight: { xs: 56, md: 48 },
            minWidth: 0,
            fontSize: { xs: "0.68rem", md: "0.9rem" },
            lineHeight: 1.15,
            px: { xs: 0.5, md: 2.5 },
            py: 0.5,
            gap: 0.25,
          },
          "& .MuiTabs-indicator": {
            height: { xs: 3, md: 2 },
            borderRadius: { xs: 3, md: 0 },
          },
        }}
      >
        <Tab
          icon={<Inventory2Icon sx={{ fontSize: 18 }} />}
          iconPosition={desktop ? "start" : "top"}
          label="Stock"
        />
        <Tab
          icon={<SwapHorizIcon sx={{ fontSize: 18 }} />}
          iconPosition={desktop ? "start" : "top"}
          label="Allocate"
        />
        <Tab
          icon={<CompareArrowsIcon sx={{ fontSize: 18 }} />}
          iconPosition={desktop ? "start" : "top"}
          label="Transfer"
        />
        <Tab
          icon={<PlaylistAddIcon sx={{ fontSize: 18 }} />}
          iconPosition={desktop ? "start" : "top"}
          label="Opening"
        />
        <Tab
          icon={<TuneIcon sx={{ fontSize: 18 }} />}
          iconPosition={desktop ? "start" : "top"}
          label="Adjust"
        />
      </Tabs>

      <SwipeableTabPanel activeTab={activeTab} direction={direction}>

      {activeTab === TAB_CURRENT_STOCK && (
        <CurrentStockTab onSelectMaterial={handleSelectMaterialFromCurrentStock} />
      )}

      {activeTab === TAB_ALLOCATION && (
        <>
          <Box sx={{ mb: 1, display: "flex", gap: 1, alignItems: "center" }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <MaterialSearch value={material} onChange={setMaterial} />
            </Box>

            <MaterialPhotoUploadButton
              material={material}
              pendingFile={pendingPhoto}
              onFileSelected={setPendingPhoto}
              onClear={() => setPendingPhoto(null)}
            />
          </Box>

          <AllocationSummary
            material={material}
            totalStock={totalStock}
            allocatedQty={allocatedQty}
            unallocatedQty={unallocatedQty}
          />

          {material ? (
            <AllocationForm
              key={material.material_code}
              materialCode={material.material_code}
              onAllocate={handleAllocate}
            />
          ) : (
            <Alert severity="info" sx={{ mb: 1, py: 0.25 }}>
              Please select a material to allocate stock.
            </Alert>
          )}

          <BulkAllocateCard
            onShowSnackbar={showSnackbar}
            onImportComplete={() => {
              if (material) {
                loadAllocations(material.material_code);
              }
            }}
          />

          <Box ref={allocationsRef}>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: "bold", mb: 0.75, fontSize: "0.85rem" }}
            >
              Current Allocations
            </Typography>

            {loadingAllocations ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <AllocationTable
                allocations={allocations.filter(
                  (a) => a.location_code !== UNALLOCATED_LOCATION
                )}
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
                sx={{ minHeight: 44 }}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleEditSave}
                disabled={savingAllocation}
                fullWidth={fullScreenDialogs}
                sx={{ minHeight: 44 }}
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
                sx={{ minHeight: 44 }}
              >
                Cancel
              </Button>
              <Button
                color="error"
                variant="contained"
                onClick={handleDeleteConfirm}
                disabled={savingAllocation}
                fullWidth={fullScreenDialogs}
                sx={{ minHeight: 44 }}
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
        </>
      )}

      {activeTab === TAB_TRANSFER && <LocationTransfer />}

      {activeTab === TAB_OPENING_STOCK && <OpeningStockTab />}

      {activeTab === TAB_ADJUSTMENT && <AdjustmentTab />}

      </SwipeableTabPanel>
    </Box>
  );
}

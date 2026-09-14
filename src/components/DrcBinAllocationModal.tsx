import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  CircularProgress,
  Alert,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Chip,
  Autocomplete,
  FormControlLabel,
  Checkbox,
  useTheme,
  useMediaQuery,
  Tooltip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import WarehouseIcon from "@mui/icons-material/Warehouse";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import {
  allocateDrcMaterialsToBins,
  fetchExistingAllocationsForMaterials,
  type ExistingBinAllocation,
  type MaterialBinAllocationInput,
} from "../services/drcSapSyncService";
import { getLocations } from "../services/locationService";
import type { Location } from "../types/location";
import type { ReceiptHeader } from "../services/receiptService";

interface DrcBinAllocationModalProps {
  open: boolean;
  onClose: () => void;
  receipt: ReceiptHeader;
  onSuccess: (updatedReceipt: ReceiptHeader) => void;
}

interface EditableAllocationRow {
  key: string;
  material_code: string;
  material_description: string;
  uom: string;
  received_quantity: number;
  location_code: string;
  allocated_quantity: number;
  item_no?: string;
  sap_103_doc?: string;
  sap_105_doc?: string;
  existing_bins: ExistingBinAllocation[];
  already_allocated: boolean;
  current_bin?: string;
}

export const DrcBinAllocationModal: React.FC<DrcBinAllocationModalProps> = ({
  open,
  onClose,
  receipt,
  onSuccess,
}) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [rows, setRows] = useState<EditableAllocationRow[]>([]);
  const [operatorName, setOperatorName] = useState("Storekeeper");
  const [closeDrc, setCloseDrc] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load locations and build rows when opened
  useEffect(() => {
    if (!open) return;

    let isMounted = true;
    setLoading(true);
    setErrorMessage(null);

    async function initialize() {
      try {
        const [locList] = await Promise.all([getLocations()]);

        if (!isMounted) return;
        setLocations(locList);

        // Extract material items: prioritize receipt.sap_items, fallback to legacy package_details with material_code
        const sapItems =
          receipt.sap_items && receipt.sap_items.length > 0
            ? receipt.sap_items
            : (receipt.package_details || []).filter((p) => Boolean(p.material_code && p.material_code.trim()));

        const materialCodes = sapItems
          .map((p) => (p.material_code || "").trim())
          .filter(Boolean);

        // Fetch existing bin allocations for these materials
        let existingAllocs: ExistingBinAllocation[] = [];
        if (materialCodes.length > 0) {
          existingAllocs = await fetchExistingAllocationsForMaterials(materialCodes);
        }

        const allocMap = new Map<string, ExistingBinAllocation[]>();
        for (const ea of existingAllocs) {
          const list = allocMap.get(ea.material_code) || [];
          list.push(ea);
          allocMap.set(ea.material_code, list);
        }

        // Build editable allocation rows from SAP items
        const initialRows: EditableAllocationRow[] = sapItems.map((pkg, idx) => {
          const matCode = (pkg.material_code || "").trim();
          const desc = pkg.description || `Item ${idx + 1}`;
          const qty = Number(pkg.quantity) || 1;
          const uom = pkg.uom || pkg.package_type || "NOS";
          const currentBins = matCode ? allocMap.get(matCode) || [] : [];
          const defaultLoc =
            pkg.bin_location ||
            (currentBins.length > 0 ? currentBins[0].location_code : "");

          return {
            key: `${matCode || "ROW"}_${idx}`,
            material_code: matCode,
            material_description: desc,
            uom,
            received_quantity: qty,
            location_code: defaultLoc,
            allocated_quantity: pkg.allocated_qty || qty,
            item_no: pkg.item_no || String(idx + 1),
            sap_103_doc: pkg.sap_103_doc || receipt.sap_103_doc || undefined,
            sap_105_doc:
              pkg.sap_105_doc ||
              receipt.sap_105_doc ||
              receipt.grn_number ||
              undefined,
            existing_bins: currentBins,
            already_allocated: !!pkg.bin_allocated,
            current_bin: pkg.bin_location,
          };
        });

        setRows(initialRows);
      } catch (err) {
        console.error("Failed to initialize bin allocation modal:", err);
        if (isMounted) {
          setErrorMessage("Failed to load locations and inventory records.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initialize();

    return () => {
      isMounted = false;
    };
  }, [open, receipt]);

  const updateRowField = (
    index: number,
    field: "location_code" | "allocated_quantity" | "material_code",
    value: string | number
  ) => {
    setRows((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value,
      };
      return updated;
    });
  };

  const locationOptions = useMemo(() => {
    return locations.map((loc) => ({
      code: loc.location_code,
      label: `${loc.location_code} (${loc.location_description || "Bin"})`,
    }));
  }, [locations]);

  const handleSubmit = async () => {
    // Validate rows
    const errors: string[] = [];
    rows.forEach((r, i) => {
      if (!r.material_code.trim()) {
        errors.push(`Row ${i + 1}: Material Code is required.`);
      }
      if (!r.location_code.trim()) {
        errors.push(`Row ${i + 1} (${r.material_code}): Please select a bin location.`);
      }
      if (r.allocated_quantity <= 0) {
        errors.push(`Row ${i + 1} (${r.material_code}): Allocation quantity must be greater than 0.`);
      }
    });

    if (errors.length > 0) {
      setErrorMessage(errors.join(" "));
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const allocations: MaterialBinAllocationInput[] = rows.map((r) => ({
        material_code: r.material_code.trim(),
        material_description: r.material_description.trim(),
        quantity: Number(r.allocated_quantity),
        uom: r.uom,
        location_code: r.location_code.trim(),
        item_no: r.item_no,
        sap_103_doc: r.sap_103_doc || receipt.sap_103_doc || undefined,
        sap_105_doc:
          r.sap_105_doc ||
          receipt.sap_105_doc ||
          receipt.grn_number ||
          undefined,
      }));

      const res = await allocateDrcMaterialsToBins({
        receiptId: receipt.id,
        drcNumber: receipt.drc_number,
        poNumber: receipt.sap_po_number || "",
        invoiceNumber: receipt.invoice_number || "",
        vendorName: receipt.vendor_name || "",
        doc103: receipt.sap_103_doc,
        doc105: receipt.sap_105_doc || receipt.grn_number,
        doc105Date: receipt.sap_105_date || receipt.grn_date,
        operatorName: operatorName.trim() || "Storekeeper",
        allocations,
        closeDrc,
      });

      if (!res.success) {
        setErrorMessage(
          res.errors.join(", ") || "Failed to allocate stock to bins."
        );
        return;
      }

      if (res.updatedReceipt) {
        onSuccess(res.updatedReceipt);
      }
      onClose();
    } catch (err) {
      console.error("Allocation submit error:", err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during bin allocation."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={fullScreen}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid",
          borderColor: "divider",
          pb: 1.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WarehouseIcon color="primary" />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "1.1rem" }}>
              Direct Bin Location Allocation from DRC
            </Typography>
            <Typography variant="caption" color="text.secondary">
              DRC: <strong>{receipt.drc_number}</strong> | Vendor:{" "}
              <strong>{receipt.vendor_name}</strong>
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: { xs: 1.5, sm: 2.5 } }}>
        {/* DRC & SAP Document Badges */}
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            mb: 2,
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "grey.50",
            display: "flex",
            flexWrap: "wrap",
            gap: 1.5,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            <Chip
              size="small"
              label={`PO: ${receipt.sap_po_number || "None"}`}
              sx={{ fontWeight: 600 }}
            />
            <Chip
              size="small"
              label={`Invoice: ${receipt.invoice_number || "None"}`}
              sx={{ fontWeight: 600 }}
            />
            {receipt.sap_103_doc && (
              <Chip
                size="small"
                color="info"
                icon={<Inventory2Icon fontSize="small" />}
                label={`103 Doc: ${receipt.sap_103_doc}`}
                sx={{ fontWeight: 600 }}
              />
            )}
            {(receipt.sap_105_doc || receipt.grn_number) && (
              <Chip
                size="small"
                color="success"
                icon={<TaskAltIcon fontSize="small" />}
                label={`105 GRN: ${receipt.sap_105_doc || receipt.grn_number}`}
                sx={{ fontWeight: 600 }}
              />
            )}
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <TextField
              label="Operator Name"
              size="small"
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              sx={{ width: 180, bgcolor: "background.paper" }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={closeDrc}
                  onChange={(e) => setCloseDrc(e.target.checked)}
                  color="primary"
                />
              }
              label={
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Close DRC on save
                </Typography>
              }
            />
          </Box>
        </Paper>

        {errorMessage && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
            {errorMessage}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ py: 6, display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5 }}>
            <CircularProgress size={36} />
            <Typography variant="body2" color="text.secondary">
              Loading warehouse bin locations and stock records...
            </Typography>
          </Box>
        ) : rows.length === 0 ? (
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            No materials found on this DRC. Please add line items or fetch from SAP MB51 first.
          </Alert>
        ) : (
          <TableContainer
            component={Paper}
            elevation={0}
            sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}
          >
            <Table size="small">
              <TableHead sx={{ bgcolor: "grey.100" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Material Code</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Received Qty</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Existing Bins</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 220 }}>Target Bin Location</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 110 }} align="right">Allocate Qty</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={row.key} hover>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>
                      {row.material_code ? (
                        <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: "monospace" }}>
                          {row.material_code}
                        </Typography>
                      ) : (
                        <TextField
                          size="small"
                          placeholder="Material Code"
                          value={row.material_code}
                          onChange={(e) => updateRowField(index, "material_code", e.target.value)}
                          sx={{ width: 130 }}
                        />
                      )}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>
                      <Typography variant="body2" noWrap title={row.material_description}>
                        {row.material_description}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {row.received_quantity} {row.uom}
                    </TableCell>
                    <TableCell>
                      {row.existing_bins.length > 0 ? (
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                          {row.existing_bins.map((eb) => (
                            <Tooltip
                              key={eb.location_code}
                              title="Click to select this existing bin"
                              arrow
                            >
                              <Chip
                                size="small"
                                variant="outlined"
                                color="primary"
                                label={`${eb.location_code} (${eb.quantity})`}
                                onClick={() =>
                                  updateRowField(index, "location_code", eb.location_code)
                                }
                                sx={{
                                  cursor: "pointer",
                                  fontSize: "0.7rem",
                                  height: 22,
                                  "&:hover": { bgcolor: "primary.50" },
                                }}
                              />
                            </Tooltip>
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          No existing stock
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Autocomplete
                        freeSolo
                        size="small"
                        options={locationOptions}
                        getOptionLabel={(opt) =>
                          typeof opt === "string" ? opt : opt.code
                        }
                        inputValue={row.location_code}
                        onInputChange={(_e, val) =>
                          updateRowField(index, "location_code", val || "")
                        }
                        renderOption={(props, option) => (
                          <li {...props} key={option.code}>
                            <Typography variant="body2">{option.label}</Typography>
                          </li>
                        )}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            placeholder="Select or enter bin"
                            required
                            error={!row.location_code.trim()}
                            helperText={!row.location_code.trim() ? "Required" : ""}
                            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }}
                          />
                        )}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <TextField
                        size="small"
                        type="number"
                        value={row.allocated_quantity}
                        onChange={(e) =>
                          updateRowField(
                            index,
                            "allocated_quantity",
                            Number(e.target.value) || 0
                          )
                        }
                        sx={{ width: 90, "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }}
                        slotProps={{ htmlInput: { min: 1 } }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
        <Button onClick={onClose} color="inherit" sx={{ textTransform: "none" }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={loading || submitting || rows.length === 0}
          onClick={handleSubmit}
          startIcon={
            submitting ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <CheckCircleIcon />
            )
          }
          sx={{ fontWeight: 700, textTransform: "none" }}
        >
          {submitting
            ? "Allocating Stock..."
            : `Confirm & Allocate Stock to Bins (${rows.length} Item${rows.length > 1 ? "s" : ""})`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Snackbar,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";

import TuneIcon from "@mui/icons-material/Tune";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import BalanceIcon from "@mui/icons-material/Balance";
import UndoIcon from "@mui/icons-material/Undo";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import HistoryIcon from "@mui/icons-material/History";

import MaterialSearch from "./MaterialSearch";
import LocationSearch from "./LocationSearch";
import SapMaterialHistoryPopup from "./SapMaterialHistoryPopup";

import { usePersistentState } from "../hooks/usePersistentState";

import type { Material } from "../types/material";
import type { Location } from "../types/location";

import {
  applyAdjustment,
  getAllocations,
} from "../services/materialAllocationService";
import {
  classifyOpenReviews,
  bulkAutoReconcileSingleBinReviews,
  bulkAutoReconcileMultiBinSurplusReviews,
  autoReconcileSurplusToUnallocated,
  getSapReconciliationReviews,
  getAppliedSingleBinReviews,
  revertAppliedSingleBinReviewsToOpen,
  rebalanceAppliedSingleBinSurplus,
  type SapStockReview,
  type ReconciliationClassification,
} from "../services/sapHistoryService";
import SapReviewDialog from "./SapReviewDialog";

type SnackbarSeverity = "success" | "error" | "warning" | "info";
type Direction = "increase" | "decrease";

const UNALLOCATED_LOCATION = "UNALLOCATED";

const ADJUSTMENT_REASONS = [
  "Physical Count Variance",
  "Damage",
  "Loss",
  "Correction",
  "Other",
];

export default function AdjustmentTab() {
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: SnackbarSeverity;
  }>({ open: false, message: "", severity: "info" });

  function showSnackbar(message: string, severity: SnackbarSeverity) {
    setSnackbar({ open: true, message, severity });
  }

  const [material, setMaterial] = usePersistentState<Material | null>(
    "adjustment.material",
    null
  );
  const [location, setLocation] = usePersistentState<Location | null>(
    "adjustment.location",
    null
  );

  const [currentQuantity, setCurrentQuantity] = useState<number | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(false);

  const [direction, setDirection] = usePersistentState<Direction>(
    "adjustment.direction",
    "increase"
  );
  const [amount, setAmount] = usePersistentState("adjustment.amount", "");
  const [reason, setReason] = usePersistentState("adjustment.reason", "");
  const [remarks, setRemarks] = usePersistentState("adjustment.remarks", "");
  const [saving, setSaving] = useState(false);

  // SAP reconciliation reviews - differences between SAP totals and app
  // stock, created by the MB52 import. Resolved here (Apply = one audited
  // ADJUSTMENT, Dismiss = keep as history).
  const [reviews, setReviews] = useState<
    (SapStockReview & { material_code: string })[] | null
  >(null);
  const [activeReview, setActiveReview] = useState<
    (SapStockReview & { material_code: string }) | null
  >(null);

  const [searchParams] = useSearchParams();
  const [historyPopupMaterial, setHistoryPopupMaterial] = useState<string | null>(null);
  const [historyPopupReviewId, setHistoryPopupReviewId] = useState<number | undefined>(undefined);

  // Auto-open review dialog if redirected back from SAP History (?reviewId=...)
  useEffect(() => {
    const reviewIdParam = searchParams.get("reviewId");
    if (reviewIdParam && reviews && reviews.length > 0) {
      const idNum = Number(reviewIdParam);
      const found = reviews.find((r) => r.id === idNum);
      if (found) {
        setActiveReview(found);
      }
    }
  }, [reviews, searchParams]);

  // Strategy 4 state
  const [classifications, setClassifications] = useState<
    Map<number, ReconciliationClassification>
  >(new Map());
  const [filterType, setFilterType] = useState<
    "all" | "single" | "multi" | "multi-surplus" | "multi-deficit"
  >("all");
  const [bulkReconciling, setBulkReconciling] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [confirmMultiSurplusOpen, setConfirmMultiSurplusOpen] = useState(false);

  // Recovery & Revert state for previously applied single-bin auto-reconciliations
  const [appliedSingleBinReviews, setAppliedSingleBinReviews] = useState<
    (SapStockReview & { material_code: string })[]
  >([]);
  const [confirmRevertOpen, setConfirmRevertOpen] = useState(false);
  const [confirmRebalanceOpen, setConfirmRebalanceOpen] = useState(false);
  const [actionProgress, setActionProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  function loadAppliedReviews() {
    getAppliedSingleBinReviews()
      .then((data) => setAppliedSingleBinReviews(data))
      .catch(() => setAppliedSingleBinReviews([]));
  }

  useEffect(() => {
    let cancelled = false;

    getSapReconciliationReviews()
      .then(async (data) => {
        if (!cancelled) {
          const open = data.filter((r) => r.status === "open");
          setReviews(open);
          try {
            const classList = await classifyOpenReviews(open);
            if (!cancelled) {
              const map = new Map<number, ReconciliationClassification>();
              classList.forEach((c) => map.set(c.review.id, c));
              setClassifications(map);
            }
          } catch {
            // ignore classification errors
          }
        }
      })
      .catch(() => {
        if (!cancelled) setReviews([]);
      });

    loadAppliedReviews();

    return () => {
      cancelled = true;
    };
  }, []);

  function reloadReviews() {
    getSapReconciliationReviews()
      .then(async (data) => {
        const open = data.filter((r) => r.status === "open");
        setReviews(open);
        try {
          const classList = await classifyOpenReviews(open);
          const map = new Map<number, ReconciliationClassification>();
          classList.forEach((c) => map.set(c.review.id, c));
          setClassifications(map);
        } catch {
          // ignore
        }
      })
      .catch(() => setReviews([]));

    loadAppliedReviews();
  }

  const singleBinCount = useMemo(() => {
    if (!reviews) return 0;
    return reviews.filter(
      (r) => classifications.get(r.id)?.isSingleLocation
    ).length;
  }, [reviews, classifications]);

  const multiBinReviews = useMemo(() => {
    if (!reviews) return [];
    return reviews.filter(
      (r) =>
        classifications.has(r.id) &&
        !classifications.get(r.id)?.isSingleLocation
    );
  }, [reviews, classifications]);

  const multiBinSurplusReviews = useMemo(() => {
    return multiBinReviews.filter((r) => r.sap_total > r.app_total);
  }, [multiBinReviews]);

  const multiBinSurplusCount = multiBinSurplusReviews.length;

  const multiBinDeficitReviews = useMemo(() => {
    return multiBinReviews.filter((r) => r.sap_total < r.app_total);
  }, [multiBinReviews]);

  const multiBinDeficitCount = multiBinDeficitReviews.length;

  const totalMultiBinSurplusQty = useMemo(() => {
    return multiBinSurplusReviews.reduce(
      (sum, r) => sum + Math.max(0, r.sap_total - r.app_total),
      0
    );
  }, [multiBinSurplusReviews]);

  const filteredReviews = useMemo(() => {
    if (!reviews) return [];
    if (filterType === "single") {
      return reviews.filter(
        (r) => classifications.get(r.id)?.isSingleLocation
      );
    }
    if (filterType === "multi") {
      return multiBinReviews;
    }
    if (filterType === "multi-surplus") {
      return multiBinSurplusReviews;
    }
    if (filterType === "multi-deficit") {
      return multiBinDeficitReviews;
    }
    return reviews;
  }, [
    reviews,
    filterType,
    classifications,
    multiBinReviews,
    multiBinSurplusReviews,
    multiBinDeficitReviews,
  ]);

  const activeReviewIndex = useMemo(() => {
    if (!activeReview || !filteredReviews) return -1;
    return filteredReviews.findIndex((r) => r.id === activeReview.id);
  }, [activeReview, filteredReviews]);

  function handleApplyAndNext() {
    if (
      activeReviewIndex >= 0 &&
      activeReviewIndex < filteredReviews.length - 1
    ) {
      setActiveReview(filteredReviews[activeReviewIndex + 1]);
    } else {
      setActiveReview(null);
    }
    reloadReviews();
  }

  async function handleAutoReconcileSingleBin() {
    if (singleBinCount === 0) return;
    setBulkReconciling(true);
    setBulkProgress({ done: 0, total: singleBinCount });
    try {
      const res = await bulkAutoReconcileSingleBinReviews((done, total) => {
        setBulkProgress({ done, total });
      });
      showSnackbar(
        `Auto-reconciled ${res.reconciledCount} single-location material(s)! ${res.multiBinCount} multi-bin item(s) remain for review.`,
        "success"
      );
      reloadReviews();
    } catch (err) {
      showSnackbar(
        err instanceof Error ? err.message : "Bulk auto-reconciliation failed.",
        "error"
      );
    } finally {
      setBulkReconciling(false);
      setBulkProgress(null);
    }
  }

  async function handleAutoReconcileMultiBinSurplus() {
    if (multiBinSurplusCount === 0) return;
    setConfirmMultiSurplusOpen(false);
    setBulkReconciling(true);
    setBulkProgress({ done: 0, total: multiBinSurplusCount });
    try {
      const res = await bulkAutoReconcileMultiBinSurplusReviews(
        (done, total) => {
          setBulkProgress({ done, total });
        }
      );
      showSnackbar(
        `Auto-reconciled ${res.reconciledCount} multi-bin material(s)! +${res.totalSurplusAdded} excess stock deposited into UNALLOCATED. ${res.deficitCount} deficit item(s) remain for manual review.`,
        "success"
      );
      reloadReviews();
    } catch (err) {
      showSnackbar(
        err instanceof Error
          ? err.message
          : "Multi-bin surplus auto-reconciliation failed.",
        "error"
      );
    } finally {
      setBulkReconciling(false);
      setBulkProgress(null);
    }
  }

  async function handleQuickReconcileSurplus(reviewId: number) {
    try {
      await autoReconcileSurplusToUnallocated(reviewId);
      showSnackbar(
        "Excess stock successfully added to UNALLOCATED (physical bins preserved)!",
        "success"
      );
      reloadReviews();
    } catch (err) {
      showSnackbar(
        err instanceof Error ? err.message : "Failed to reconcile surplus.",
        "error"
      );
    }
  }

  const appliedSurplusCount = useMemo(
    () => appliedSingleBinReviews.filter((r) => r.difference > 0).length,
    [appliedSingleBinReviews]
  );
  const appliedDeficitCount = useMemo(
    () => appliedSingleBinReviews.filter((r) => r.difference < 0).length,
    [appliedSingleBinReviews]
  );

  async function handleRevertAppliedSingleBin() {
    setActionBusy(true);
    setActionProgress({ done: 0, total: appliedSingleBinReviews.length });
    try {
      const res = await revertAppliedSingleBinReviewsToOpen((done, total) => {
        setActionProgress({ done, total });
      });
      showSnackbar(
        `Successfully reverted ${res.revertedCount} single-bin item(s) back to Open Reviews!`,
        "success"
      );
      setConfirmRevertOpen(false);
      reloadReviews();
    } catch (err) {
      showSnackbar(
        err instanceof Error ? err.message : "Failed to revert single-bin items.",
        "error"
      );
    } finally {
      setActionBusy(false);
      setActionProgress(null);
    }
  }

  async function handleRebalanceAppliedSurplus() {
    setActionBusy(true);
    setActionProgress({ done: 0, total: appliedSurplusCount });
    try {
      const res = await rebalanceAppliedSingleBinSurplus((done, total) => {
        setActionProgress({ done, total });
      });
      showSnackbar(
        `Rebalanced ${res.rebalancedCount} surplus item(s): shifted ${res.totalQuantityShifted} units of extra SAP stock into Unallocated, restoring physical shelf counts.`,
        "success"
      );
      setConfirmRebalanceOpen(false);
      reloadReviews();
    } catch (err) {
      showSnackbar(
        err instanceof Error ? err.message : "Failed to shift surplus to unallocated.",
        "error"
      );
    } finally {
      setActionBusy(false);
      setActionProgress(null);
    }
  }

  // No location means "Unallocated" for both directions - Increase adds
  // to Unallocated to be allocated later, and Decrease (e.g. reversing
  // that same increase) takes it back out of Unallocated. Decreasing
  // stock actually held at a real location still requires picking that
  // location explicitly.
  const effectiveLocationCode = location?.location_code ?? UNALLOCATED_LOCATION;

  useEffect(() => {
    if (!material || !effectiveLocationCode) {
      setCurrentQuantity(null);
      return;
    }

    let cancelled = false;
    setLoadingCurrent(true);

    getAllocations(material.material_code)
      .then((allocations) => {
        if (cancelled) return;

        const existing = allocations.find(
          (a) => a.location_code === effectiveLocationCode
        );

        setCurrentQuantity(existing ? existing.quantity : 0);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingCurrent(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [material, effectiveLocationCode]);

  // The underlying adjustment mechanism (applyAdjustment) still takes a
  // single absolute "new quantity" - the Increase/Decrease toggle is a
  // friendlier input on top of that, computed here in the UI layer only.
  const amountValue = Number(amount);
  const hasValidAmount = amount !== "" && !Number.isNaN(amountValue) && amountValue > 0;

  const computedNewQuantity =
    currentQuantity !== null && hasValidAmount
      ? direction === "increase"
        ? currentQuantity + amountValue
        : currentQuantity - amountValue
      : null;

  async function handleSubmit() {
    if (!material) {
      showSnackbar("Please select a material.", "warning");
      return;
    }

    if (!hasValidAmount) {
      showSnackbar("Please enter a valid quantity.", "warning");
      return;
    }

    if (computedNewQuantity === null || computedNewQuantity < 0) {
      showSnackbar("Resulting quantity cannot be negative.", "warning");
      return;
    }

    if (!reason) {
      showSnackbar("Please select a reason for this adjustment.", "warning");
      return;
    }

    setSaving(true);

    try {
      await applyAdjustment(
        material.material_code,
        effectiveLocationCode,
        computedNewQuantity,
        reason,
        remarks || undefined
      );

      showSnackbar(
        location
          ? `Stock adjusted to ${computedNewQuantity} for ${material.material_code} at ${location.location_code}.`
          : `Stock adjusted to ${computedNewQuantity} for ${material.material_code} (Unallocated).`,
        "success"
      );

      setCurrentQuantity(computedNewQuantity);
      setAmount("");
      setReason("");
      setRemarks("");
    } catch {
      showSnackbar("Something went wrong while saving the adjustment.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ mt: 1.5 }}>
      {/* Recovery & Revert Banner for Previously Applied Single-Bin Items */}
      {appliedSingleBinReviews.length > 0 && (
        <Card
          elevation={0}
          sx={{
            p: 2,
            mb: 2,
            borderRadius: 2,
            border: "1px solid",
            borderColor: "warning.main",
            bgcolor: "warning.50",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 2,
              flexWrap: "wrap",
            }}
          >
            <Box sx={{ maxWidth: 650 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                <WarningAmberIcon color="warning" />
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "warning.dark" }}>
                  {appliedSingleBinReviews.length} Single-Bin Items Recently Reconciled
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ fontSize: "0.85rem", color: "text.primary", mb: 0.5 }}>
                {appliedSurplusCount} item(s) had extra SAP stock (surplus), and {appliedDeficitCount} item(s) had stock reduced.
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                Choose <strong>Shift Surplus to Unallocated</strong> to move the extra quantity of surplus items into the UNALLOCATED buffer and restore physical shelf bins, or <strong>Revert to Open Reviews</strong> to undo adjustments and return all {appliedSingleBinReviews.length} items to the review queue.
              </Typography>
            </Box>

            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <Button
                size="small"
                variant="contained"
                color="warning"
                startIcon={<UndoIcon />}
                onClick={() => setConfirmRevertOpen(true)}
                disabled={actionBusy || bulkReconciling}
                sx={{ borderRadius: 2, fontWeight: 700, textTransform: "none" }}
              >
                Revert to Open Reviews ({appliedSingleBinReviews.length})
              </Button>

              {appliedSurplusCount > 0 && (
                <Button
                  size="small"
                  variant="outlined"
                  color="primary"
                  startIcon={<BalanceIcon />}
                  onClick={() => setConfirmRebalanceOpen(true)}
                  disabled={actionBusy || bulkReconciling}
                  sx={{
                    borderRadius: 2,
                    fontWeight: 700,
                    textTransform: "none",
                    bgcolor: "background.paper",
                  }}
                >
                  Shift Surplus to Unallocated ({appliedSurplusCount})
                </Button>
              )}
            </Box>
          </Box>

          {actionProgress && (
            <Box sx={{ mt: 1.5 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Processing adjustments...
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  {actionProgress.done} / {actionProgress.total}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={
                  actionProgress.total > 0
                    ? (actionProgress.done / actionProgress.total) * 100
                    : 0
                }
                sx={{ height: 6, borderRadius: 3 }}
              />
            </Box>
          )}
        </Card>
      )}

      {reviews !== null && reviews.length > 0 && (
        <Box sx={{ mb: 2 }}>
          {/* Strategy 4 Automated Reconciliation Control Card */}
          <Card
            elevation={0}
            sx={{
              p: 1.75,
              mb: 1.5,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              bgcolor: "background.paper",
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 1,
                mb: 1.25,
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: "0.95rem" }}>
                  SAP Reconciliation (Strategy 4)
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {reviews.length} open discrepancy review(s) from MB52 stock snapshot
                </Typography>
              </Box>

              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                {singleBinCount > 0 && (
                  <Tooltip title="Auto-reconciles single-location items: extra SAP stock (surplus) goes to Unallocated buffer to protect shelf counts, while deficits are deducted from the single bin">
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      startIcon={
                        bulkReconciling ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : (
                          <AutoFixHighIcon />
                        )
                      }
                      onClick={handleAutoReconcileSingleBin}
                      disabled={bulkReconciling || actionBusy}
                      sx={{ borderRadius: 2, fontWeight: 700, textTransform: "none" }}
                    >
                      Auto-Reconcile Single-Bin ({singleBinCount})
                    </Button>
                  </Tooltip>
                )}

                {multiBinSurplusCount > 0 && (
                  <Tooltip title="Auto-reconciles multi-bin materials where SAP > App: credits the excess stock directly into UNALLOCATED, leaving all physical shelf bins untouched">
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      startIcon={
                        bulkReconciling ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : (
                          <BalanceIcon />
                        )
                      }
                      onClick={() => setConfirmMultiSurplusOpen(true)}
                      disabled={bulkReconciling || actionBusy}
                      sx={{ borderRadius: 2, fontWeight: 700, textTransform: "none" }}
                    >
                      Auto-Reconcile Multi-Bin Surplus ({multiBinSurplusCount})
                    </Button>
                  </Tooltip>
                )}

                {multiBinDeficitCount > 0 && (
                  <Tooltip title="Multi-bin materials where SAP < App: requires manual review so the storekeeper can decide which shelf bin had missing stock">
                    <Chip
                      icon={<WarningAmberIcon fontSize="small" />}
                      label={`${multiBinDeficitCount} Deficit (Manual Review)`}
                      size="small"
                      color="warning"
                      variant="outlined"
                      clickable
                      onClick={() => setFilterType("multi-deficit")}
                      sx={{ fontWeight: 700, height: 32 }}
                    />
                  </Tooltip>
                )}
              </Box>
            </Box>

            {bulkProgress && (
              <Box sx={{ my: 1.25 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    mb: 0.5,
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Auto-reconciling in progress...
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {bulkProgress.done} / {bulkProgress.total}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={
                    bulkProgress.total > 0
                      ? (bulkProgress.done / bulkProgress.total) * 100
                      : 0
                  }
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
            )}

            {/* Filter chips */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, pt: 0.5, flexWrap: "wrap" }}>
              <Chip
                label={`All (${reviews.length})`}
                size="small"
                clickable
                color={filterType === "all" ? "primary" : "default"}
                variant={filterType === "all" ? "filled" : "outlined"}
                onClick={() => setFilterType("all")}
                sx={{ fontWeight: 600 }}
              />
              <Chip
                icon={<AutoFixHighIcon fontSize="small" />}
                label={`Single-Bin (${singleBinCount})`}
                size="small"
                clickable
                color={filterType === "single" ? "success" : "default"}
                variant={filterType === "single" ? "filled" : "outlined"}
                onClick={() => setFilterType("single")}
                sx={{ fontWeight: 600 }}
              />
              <Chip
                icon={<BalanceIcon fontSize="small" />}
                label={`Multi-Bin Surplus (${multiBinSurplusCount})`}
                size="small"
                clickable
                color={filterType === "multi-surplus" ? "primary" : "default"}
                variant={filterType === "multi-surplus" ? "filled" : "outlined"}
                onClick={() => setFilterType("multi-surplus")}
                sx={{ fontWeight: 600 }}
              />
              <Chip
                icon={<WarningAmberIcon fontSize="small" />}
                label={`Multi-Bin Deficit / Manual (${multiBinDeficitCount})`}
                size="small"
                clickable
                color={filterType === "multi-deficit" ? "warning" : "default"}
                variant={filterType === "multi-deficit" ? "filled" : "outlined"}
                onClick={() => setFilterType("multi-deficit")}
                sx={{ fontWeight: 600 }}
              />
            </Box>
          </Card>

          {/* List of filtered reviews */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
            {filteredReviews.map((review) => {
              const diff = review.difference;
              const classification = classifications.get(review.id);
              const isSingle = classification?.isSingleLocation;
              const activeCount = classification?.activeBins.length ?? 0;
              const isSurplus = diff > 0;

              return (
                <Box
                  key={review.id}
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    p: 1.25,
                    bgcolor: "background.paper",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 1,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.25 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {review.material_code}
                          {review.short_description ? ` - ${review.short_description}` : ""}
                        </Typography>
                        {classification && (
                          <Chip
                            label={
                              isSingle
                                ? "Single-Bin"
                                : isSurplus
                                ? `Multi-Bin Surplus (${activeCount} bins)`
                                : `Multi-Bin Deficit (${activeCount} bins)`
                            }
                            size="small"
                            color={
                              isSingle
                                ? "success"
                                : isSurplus
                                ? "primary"
                                : "warning"
                            }
                            variant="outlined"
                            sx={{ height: 20, fontSize: "0.7rem", fontWeight: 700 }}
                          />
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        SAP {review.sap_total} ({
                          (review.sloc_breakdown ?? [])
                            .map((b) => `${b.storage_location}: ${b.quantity}`)
                            .join(" · ")
                        }) vs App {review.app_total}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 800,
                          color: isSurplus ? "info.main" : "error.main",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isSurplus ? `App ${diff} below (Surplus)` : `App ${-diff} above (Deficit)`}
                      </Typography>
                      {isSurplus && !isSingle && (
                        <Tooltip title="Immediately adds this item's surplus into UNALLOCATED, preserving all physical shelf bins">
                          <Button
                            size="small"
                            variant="outlined"
                            color="primary"
                            startIcon={<BalanceIcon fontSize="small" />}
                            onClick={() => handleQuickReconcileSurplus(review.id)}
                            disabled={bulkReconciling || actionBusy}
                            sx={{
                              borderRadius: 2,
                              fontWeight: 700,
                              textTransform: "none",
                              fontSize: "0.75rem",
                              py: 0.5,
                            }}
                          >
                            +Unallocated
                          </Button>
                        </Tooltip>
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        color="inherit"
                        startIcon={<HistoryIcon sx={{ fontSize: 15 }} />}
                        onClick={() => {
                          setHistoryPopupMaterial(review.material_code);
                          setHistoryPopupReviewId(review.id);
                        }}
                        disabled={bulkReconciling || actionBusy}
                        sx={{
                          borderRadius: 2,
                          fontWeight: 700,
                          textTransform: "none",
                          fontSize: "0.75rem",
                          color: "primary.main",
                          borderColor: "divider",
                        }}
                      >
                        SAP History
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => setActiveReview(review)}
                        disabled={bulkReconciling || actionBusy}
                        sx={{ borderRadius: 2, fontWeight: 700 }}
                      >
                        Review
                      </Button>
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      <Card elevation={0} sx={{ borderRadius: 2, boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)" }}>
        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
          <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", mb: 1 }}>
            Manual Stock Adjustment
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <MaterialSearch value={material} onChange={setMaterial} />

            <LocationSearch
              value={location}
              onChange={setLocation}
              label="Search Location (optional - leave blank for Unallocated)"
            />

            {material && effectiveLocationCode && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 2,
                  bgcolor: "grey.50",
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  Current Quantity {location ? `at ${location.location_code}` : "(Unallocated)"}
                </Typography>

                {loadingCurrent ? (
                  <CircularProgress size={16} />
                ) : (
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {currentQuantity ?? 0} {material.uom}
                  </Typography>
                )}
              </Box>
            )}

            <ToggleButtonGroup
              value={direction}
              exclusive
              fullWidth
              size="small"
              onChange={(_, value: Direction | null) => {
                if (value) setDirection(value);
              }}
              sx={{
                gap: 1,
                "& .MuiToggleButton-root": {
                  minHeight: 40,
                  borderRadius: "8px !important",
                  fontWeight: 700,
                  textTransform: "none",
                  gap: 0.5,
                  marginLeft: "0px !important",
                  borderLeft: "1px solid !important",
                  borderColor: "divider",
                },
              }}
            >
              <ToggleButton value="increase" color="success">
                <AddIcon fontSize="small" /> Increase
              </ToggleButton>
              <ToggleButton value="decrease" color="error">
                <RemoveIcon fontSize="small" /> Decrease
              </ToggleButton>
            </ToggleButtonGroup>

            <TextField
              label="Quantity"
              type="number"
              size="small"
              fullWidth
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              slotProps={{ htmlInput: { inputMode: "numeric", min: 0 } }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              helperText={
                computedNewQuantity !== null
                  ? `New quantity will be: ${computedNewQuantity}`
                  : " "
              }
            />

            <TextField
              select
              label="Reason"
              size="small"
              fullWidth
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            >
              {ADJUSTMENT_REASONS.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Remarks"
              placeholder="Optional additional details"
              size="small"
              fullWidth
              multiline
              minRows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />

            <Button
              variant="contained"
              fullWidth
              startIcon={
                saving ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <TuneIcon fontSize="small" />
                )
              }
              onClick={handleSubmit}
              disabled={saving}
              sx={{ minHeight: 42, borderRadius: 2, fontWeight: 700 }}
            >
              Save
            </Button>
          </Box>
        </CardContent>
      </Card>

      <SapReviewDialog
        review={activeReview}
        onClose={() => setActiveReview(null)}
        onResolved={() => {
          setActiveReview(null);
          reloadReviews();
          showSnackbar("Reconciliation updated.", "success");
        }}
        onError={(message) => showSnackbar(message, "error")}
        onApplyAndNext={handleApplyAndNext}
        hasNextReview={
          activeReviewIndex >= 0 &&
          activeReviewIndex < filteredReviews.length - 1
        }
        reviewIndex={activeReviewIndex >= 0 ? activeReviewIndex : undefined}
        totalOpenReviews={filteredReviews.length}
      />

      {/* SAP Material History popup for cards in the review list */}
      <SapMaterialHistoryPopup
        open={!!historyPopupMaterial}
        onClose={() => {
          setHistoryPopupMaterial(null);
          setHistoryPopupReviewId(undefined);
        }}
        materialCode={historyPopupMaterial ?? ""}
        returnToReviewId={historyPopupReviewId}
      />

      {/* Auto-Reconcile Multi-Bin Surplus Confirmation Dialog */}
      <Dialog
        open={confirmMultiSurplusOpen}
        onClose={() => !bulkReconciling && setConfirmMultiSurplusOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 1 }}>
          <BalanceIcon color="primary" />
          Auto-Reconcile Multi-Bin Surplus ({multiBinSurplusCount} items)?
        </DialogTitle>
        <DialogContent dividers>
          <DialogContentText sx={{ mb: 1.5, color: "text.primary" }}>
            This will automatically reconcile all multi-bin materials where SAP stock is higher than app stock:
          </DialogContentText>
          <Box component="ul" sx={{ pl: 2.5, m: 0, fontSize: "0.875rem", color: "text.secondary", display: "flex", flexDirection: "column", gap: 1 }}>
            <li>
              <strong>Physical shelf bins remain 100% untouched:</strong> Existing quantities across all physical shelf bins will be preserved exactly as counted.
            </li>
            <li>
              <strong>Excess stock placed into UNALLOCATED:</strong> A total of <strong>+{totalMultiBinSurplusQty}</strong> surplus units will be deposited directly into the <code>UNALLOCATED</code> buffer.
            </li>
            <li>
              <strong>Accounting aligned:</strong> Total stock in the app will match your SAP MB52 report immediately.
            </li>
            <li>
              <strong>Deficits protected:</strong> The {multiBinDeficitCount} multi-bin deficit item(s) (where SAP &lt; App) are safely skipped and left open for manual review.
            </li>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setConfirmMultiSurplusOpen(false)}
            disabled={bulkReconciling}
            sx={{ fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={
              bulkReconciling ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <BalanceIcon />
              )
            }
            onClick={handleAutoReconcileMultiBinSurplus}
            disabled={bulkReconciling}
            sx={{ fontWeight: 700 }}
          >
            {bulkReconciling
              ? "Reconciling..."
              : `Confirm Auto-Reconcile (${multiBinSurplusCount})`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Revert Single-Bin Reconciliation Confirmation Dialog */}
      <Dialog
        open={confirmRevertOpen}
        onClose={() => !actionBusy && setConfirmRevertOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          Revert {appliedSingleBinReviews.length} Single-Bin Adjustments?
        </DialogTitle>
        <DialogContent dividers>
          <DialogContentText sx={{ mb: 1.5, color: "text.primary" }}>
            This will reverse all adjustments made by the previous single-bin reconciliation:
          </DialogContentText>
          <Box component="ul" sx={{ pl: 2.5, m: 0, fontSize: "0.875rem", color: "text.secondary", display: "flex", flexDirection: "column", gap: 1 }}>
            <li>Physical shelf bins will be restored back to their original counts prior to reconciliation.</li>
            <li>All <strong>{appliedSingleBinReviews.length}</strong> items will return to the <strong>Open Reviews</strong> list.</li>
            <li>You can then click <em>Auto-Reconcile Single-Bin</em> to re-run reconciliation using the corrected logic (where surpluses go to Unallocated and deficits reduce the single bin).</li>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setConfirmRevertOpen(false)}
            disabled={actionBusy}
            sx={{ fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            startIcon={actionBusy ? <CircularProgress size={16} color="inherit" /> : <UndoIcon />}
            onClick={handleRevertAppliedSingleBin}
            disabled={actionBusy}
            sx={{ fontWeight: 700 }}
          >
            {actionBusy ? "Reverting..." : "Confirm Revert to Open"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rebalance Surplus to Unallocated Confirmation Dialog */}
      <Dialog
        open={confirmRebalanceOpen}
        onClose={() => !actionBusy && setConfirmRebalanceOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          Shift Surplus to Unallocated ({appliedSurplusCount} items)?
        </DialogTitle>
        <DialogContent dividers>
          <DialogContentText sx={{ mb: 1.5, color: "text.primary" }}>
            This performs a direct repair on the {appliedSurplusCount} surplus items without touching deficit items:
          </DialogContentText>
          <Box component="ul" sx={{ pl: 2.5, m: 0, fontSize: "0.875rem", color: "text.secondary", display: "flex", flexDirection: "column", gap: 1 }}>
            <li>For each surplus item (where SAP &gt; App), the physical shelf bin is restored to its physical count.</li>
            <li>The extra SAP surplus quantity is shifted into the <strong>UNALLOCATED</strong> buffer location.</li>
            <li>The {appliedDeficitCount} items that had deficits remain correctly deducted from their single bin.</li>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setConfirmRebalanceOpen(false)}
            disabled={actionBusy}
            sx={{ fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={actionBusy ? <CircularProgress size={16} color="inherit" /> : <BalanceIcon />}
            onClick={handleRebalanceAppliedSurplus}
            disabled={actionBusy}
            sx={{ fontWeight: 700 }}
          >
            {actionBusy ? "Shifting..." : "Confirm Shift Surplus"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

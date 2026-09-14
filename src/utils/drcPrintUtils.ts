import { type ReceiptHeader, getDrcDisplayStatus } from "../services/receiptService";

export type StrapFormat =
  | "horizontal_edge_strap"
  | "all_in_one"
  | "cover_strap"
  | "spine_strap"
  | "dual_cover";

export interface StrapPrintOptions {
  format: StrapFormat;
  includeBlankGrnLine?: boolean;
  includeFilingVerification?: boolean;
  companyName?: string;
  warehouseName?: string;
  stripCount?: number;
  edgeFontSize?: "standard" | "large";
}

/** Helper to format date cleanly for printable slips */
export function formatPrintDate(isoDate?: string | null): string {
  if (!isoDate) return "-";
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return isoDate;
  }
}

/** Helper to format datetime cleanly for printable slips */
export function formatPrintDateTime(isoDate?: string | null): string {
  if (!isoDate) return "-";
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
  } catch {
    return isoDate;
  }
}

/** Generate package details summary (Strictly physical packages received at gate) */
export function getPackagePrintSummary(receipt: ReceiptHeader): string {
  // Filter only physical package rows (excluding SAP material code rows)
  const pkgs = (receipt.package_details || []).filter((p) => !p.material_code || !p.material_code.trim());
  if (pkgs.length > 0) {
    return pkgs
      .map(
        (p) =>
          `${p.quantity} x ${p.package_type}${p.description ? ` (${p.description})` : ""}`
      )
      .join(", ");
  }
  if (receipt.package_count && receipt.package_type) {
    return `${receipt.package_count} x ${receipt.package_type}`;
  }
  return "-";
}

/**
 * Generates HTML for a single Horizontal File Edge Line Strap.
 * Strictly contains JUST:
 * 1. DRC number with date (e.g. "DRC/25-26/102 (Dt: 07/09/2026)")
 * 2. PO number
 * 3. Vendor name
 * Arranged in a single horizontal line with upper & lower scissor marks only to save paper space.
 */
export function generateSingleEdgeLineStrapHtml(
  receipt: ReceiptHeader,
  _options: StrapPrintOptions = { format: "horizontal_edge_strap" }
): string {
  const drcDate = formatPrintDate(receipt.receipt_datetime || receipt.created_at);
  const poNumber = receipt.sap_po_number || receipt.po_number || (receipt.gem_order_number ? `GeM:${receipt.gem_order_number}` : "-");
  const vendorName = receipt.vendor_name || "-";
  const displayDrc = receipt.drc_number?.trim() || "-";

  return `
    <div style="margin: 0; padding: 0; page-break-inside: avoid; width: 100%; box-sizing: border-box;">
      <!-- Upper Scissor Guide: Scissor marks and dashed cut line only -->
      <div style="display: flex; align-items: center; margin-bottom: 3px; color: #000000;">
        <span style="font-size: 16px; line-height: 1;">✂</span>
        <span style="flex: 1; border-bottom: 2px dashed #000000; margin: 0 6px;"></span>
        <span style="font-size: 16px; line-height: 1;">✂</span>
      </div>

      <!-- Single Horizontal Line Strap with Optimized Proportional Sections & Uniform Typography -->
      <table style="width: 100%; border-collapse: collapse; border: 2.5px solid #000000; border-radius: 4px; background: #ffffff; table-layout: auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; box-sizing: border-box;">
        <tbody>
          <tr>
            <!-- 1. DRC Number with Date: Sized tightly as per content length without waste -->
            <td style="white-space: nowrap; width: 1%; padding: 8px 12px; border-right: 2.5px solid #000000; vertical-align: middle;">
              <div style="display: flex; align-items: baseline; gap: 6px;">
                <span style="font-size: 16px; font-weight: 900; font-family: 'Consolas', 'Courier New', Courier, monospace; color: #000000; letter-spacing: 0.5px;">${displayDrc}</span>
                <span style="font-size: 13px; font-weight: 800; color: #000000;">(Dt: ${drcDate})</span>
              </div>
            </td>

            <!-- 2. PO Number: Sized tightly as per content length without waste -->
            <td style="white-space: nowrap; width: 1%; padding: 8px 12px; border-right: 2.5px solid #000000; vertical-align: middle;">
              <div style="display: flex; align-items: baseline; gap: 5px;">
                <span style="font-size: 11.5px; font-weight: 900; color: #000000; letter-spacing: 0.5px;">PO:</span>
                <span style="font-size: 15px; font-weight: 900; font-family: 'Consolas', 'Courier New', Courier, monospace; color: #000000;">${poNumber}</span>
              </div>
            </td>

            <!-- 3. Vendor Name & Code: Allocated all remaining width; left-aligned, never cut or overlapping -->
            <td style="width: 98%; padding: 8px 12px; vertical-align: middle; text-align: left;">
              <div style="display: flex; align-items: baseline; gap: 6px; min-width: 0;">
                <span style="font-size: 11.5px; font-weight: 900; color: #000000; letter-spacing: 0.5px; flex-shrink: 0;">VENDOR:</span>
                <span style="font-size: 14.5px; font-weight: 900; color: #000000; line-height: 1.25; word-break: break-word;">
                  ${vendorName}
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Lower Scissor Guide: Scissor marks and dashed cut line only -->
      <div style="display: flex; align-items: center; margin-top: 3px; color: #000000;">
        <span style="font-size: 16px; line-height: 1;">✂</span>
        <span style="flex: 1; border-bottom: 2px dashed #000000; margin: 0 6px;"></span>
        <span style="font-size: 16px; line-height: 1;">✂</span>
      </div>
    </div>
  `;
}

/**
 * Generates the full page HTML for Horizontal File Edge Line Strap
 * Strictly outputs only 1 single edge strap at top of page to conserve paper,
 * with no outside text or waste.
 */
export function generateHorizontalEdgeStrapHtml(
  receipt: ReceiptHeader,
  options: StrapPrintOptions = { format: "horizontal_edge_strap" }
): string {
  return `
    <div style="width: 100%; max-width: 100%; margin: 0; padding: 0;">
      ${generateSingleEdgeLineStrapHtml(receipt, options)}
    </div>
  `;
}

/**
 * Generates the HTML for the File Cover Strap (Front Docket Label)
 * Sized ~ 185mm x 95mm, fits cleanly on standard A4 paper with cut borders.
 */
export function generateCoverStrapHtml(
  receipt: ReceiptHeader,
  options: StrapPrintOptions = { format: "cover_strap" }
): string {
  const statusInfo = getDrcDisplayStatus(receipt);
  const orgTitle = options.companyName || "ENGINEERING STORES DEPARTMENT";
  const subTitle = options.warehouseName ? `${options.warehouseName} - ` : "";
  const packageSummary = getPackagePrintSummary(receipt);

  const isHold = statusInfo.key === "on_hold";
  const isCleared = statusInfo.key === "cleared" || receipt.status === "Pending GRN";
  const statusBadgeStyle = isHold
    ? "background:#fee2e2;color:#991b1b;border:1.5px solid #ef4444;"
    : isCleared
    ? "background:#dcfce7;color:#166534;border:1.5px solid #22c55e;"
    : "background:#fef3c7;color:#92400e;border:1.5px solid #f59e0b;";

  const grnDisplay = receipt.grn_number
    ? `<span style="font-weight:700;color:#0f172a;">${receipt.grn_number}</span> &nbsp; <span style="color:#64748b;">(dt. ${formatPrintDate(receipt.grn_date)})</span>`
    : options.includeBlankGrnLine !== false
    ? `<span style="display:inline-block;border-bottom:1.5px dashed #64748b;min-width:130px;color:#94a3b8;font-style:italic;">&nbsp;Pending (Enter No. & Date)&nbsp;</span>`
    : `<span style="color:#64748b;font-style:italic;">Pending</span>`;

  const weightInfo = [
    receipt.gross_weight ? `Gross: ${receipt.gross_weight} kg` : null,
    receipt.tare_weight ? `Tare: ${receipt.tare_weight} kg` : null,
    receipt.net_weight ? `Net: ${receipt.net_weight} kg` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const poDisplay = [
    receipt.sap_po_number ? `SAP PO: <b>${receipt.sap_po_number}</b>${receipt.sap_po_date ? ` (${formatPrintDate(receipt.sap_po_date)})` : ""}` : null,
    receipt.gem_order_number ? `GeM: <b>${receipt.gem_order_number}</b>${receipt.gem_order_date ? ` (${formatPrintDate(receipt.gem_order_date)})` : ""}` : null,
  ].filter(Boolean).join(" &nbsp;|&nbsp; ") || "-";

  const invDisplay = [
    receipt.invoice_number ? `Inv No: <b>${receipt.invoice_number}</b>${receipt.invoice_date ? ` (${formatPrintDate(receipt.invoice_date)})` : ""}` : null,
    receipt.tax_invoice_value ? `Val: <b>₹${Number(receipt.tax_invoice_value).toLocaleString("en-IN")}</b>` : null,
    receipt.challan_number ? `Challan: <b>${receipt.challan_number}</b>${receipt.challan_date ? ` (${formatPrintDate(receipt.challan_date)})` : ""}` : null,
  ].filter(Boolean).join(" &nbsp;|&nbsp; ") || "-";

  const dispatchDisplay = [
    receipt.receipt_mode ? `Mode: <b>${receipt.receipt_mode}</b>` : null,
    receipt.vehicle_number ? `Vehicle: <b>${receipt.vehicle_number}</b>` : null,
    receipt.lorry_receipt_number ? `LR No: <b>${receipt.lorry_receipt_number}</b>` : null,
    receipt.eway_bill_number ? `E-Way Bill: <b>${receipt.eway_bill_number}</b>` : null,
  ].filter(Boolean).join(" &nbsp;|&nbsp; ") || "-";

  return `
    <div class="drc-strap-container" style="page-break-inside: avoid; margin-bottom: 24px;">
      <!-- Cut guide header -->
      <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-family: monospace; color: #475569; margin-bottom: 4px;">
        <span>✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂</span>
        <span style="font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background: #e2e8f0; padding: 2px 8px; border-radius: 4px;">
          DRC Register File Cover Strap (Cut along dashed line)
        </span>
      </div>

      <!-- Main File Strap Box -->
      <div style="border: 2.5px dashed #334155; border-radius: 6px; background: #ffffff; padding: 10px 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); position: relative; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
        
        <!-- Header Strip -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 8px;">
          <div>
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #475569; letter-spacing: 0.75px;">
              ${orgTitle} &bull; ${subTitle}DRC REGISTER FILE
            </div>
            <div style="display: flex; align-items: baseline; gap: 12px; margin-top: 2px;">
              <span style="font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #0f172a; font-family: 'Courier New', monospace;">
                ${receipt.drc_number}
              </span>
              <span style="font-size: 12px; font-weight: 600; color: #475569;">
                Receipt: <b>${formatPrintDateTime(receipt.receipt_datetime)}</b>
              </span>
            </div>
          </div>
          
          <div style="text-align: right;">
            <div style="display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; ${statusBadgeStyle}">
              ${statusInfo.label}
            </div>
            <div style="font-size: 10px; color: #64748b; margin-top: 4px; font-weight: 600;">
              ${receipt.msme_type ? `MSME: ${receipt.msme_type}` : "GENERAL"} ${receipt.delivery_location ? ` &bull; Loc: ${receipt.delivery_location}` : ""}
            </div>
          </div>
        </div>

        <!-- Details Grid -->
        <table style="width: 100%; border-collapse: collapse; font-size: 11.5px; line-height: 1.4;">
          <tbody>
            <!-- Row 1: Vendor -->
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="width: 18%; padding: 4px 6px; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 10px; vertical-align: top;">
                Vendor Name
              </td>
              <td colspan="3" style="padding: 4px 6px; font-weight: 800; font-size: 13px; color: #0f172a; text-transform: uppercase;">
                ${receipt.vendor_name}
              </td>
            </tr>

            <!-- Row 2: PO & GeM -->
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 4px 6px; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 10px; vertical-align: top;">
                PO / Contract
              </td>
              <td style="padding: 4px 6px; color: #0f172a;">
                ${poDisplay}
              </td>
              <td style="width: 14%; padding: 4px 6px; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 10px; vertical-align: top;">
                Invoice / Val
              </td>
              <td style="padding: 4px 6px; color: #0f172a;">
                ${invDisplay}
              </td>
            </tr>

            <!-- Row 3: Dispatch & Package -->
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 4px 6px; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 10px; vertical-align: top;">
                Dispatch / LR
              </td>
              <td style="padding: 4px 6px; color: #0f172a;">
                ${dispatchDisplay}
              </td>
              <td style="padding: 4px 6px; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 10px; vertical-align: top;">
                Packages
              </td>
              <td style="padding: 4px 6px; color: #0f172a;">
                <b>${packageSummary}</b> ${weightInfo ? `&nbsp;(${weightInfo})` : ""}
              </td>
            </tr>

            <!-- Row 4: Material / Purpose -->
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 4px 6px; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 10px; vertical-align: top;">
                Purpose / Note
              </td>
              <td style="padding: 4px 6px; color: #1e293b;">
                ${receipt.purpose ?? receipt.remarks ?? receipt.important_note ?? "-"}
              </td>
              <td style="padding: 4px 6px; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 10px; vertical-align: top;">
                SAP GRN No.
              </td>
              <td style="padding: 4px 6px;">
                ${grnDisplay}
              </td>
            </tr>

            <!-- Row 5: Inspection details -->
            <tr>
              <td style="padding: 4px 6px; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 10px; vertical-align: top;">
                Inspection
              </td>
              <td colspan="3" style="padding: 4px 6px; color: #1e293b; font-size: 11px;">
                <b>Status:</b> ${statusInfo.label} &nbsp;|&nbsp; 
                <b>By:</b> ${receipt.inspection_by ?? "-"} &nbsp;|&nbsp; 
                <b>Date:</b> ${receipt.inspection_date ? formatPrintDateTime(receipt.inspection_date) : "-"}
                ${receipt.inspection_remarks ? `<br /><span style="color:#b91c1c;font-weight:600;">Remarks: ${receipt.inspection_remarks}</span>` : ""}
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Bottom verification & filing strip -->
        ${
          options.includeFilingVerification !== false
            ? `
          <div style="margin-top: 8px; padding-top: 6px; border-top: 1.5px solid #cbd5e1; display: flex; justify-content: space-between; align-items: flex-end; font-size: 10px; color: #475569;">
            <div style="display: flex; gap: 18px;">
              <span>File / Rack No: <b style="border-bottom: 1px solid #64748b; display: inline-block; min-width: 90px;">&nbsp;</b></span>
              <span>Dockets Count: <b style="border-bottom: 1px solid #64748b; display: inline-block; min-width: 50px;">&nbsp;</b></span>
            </div>
            <div style="display: flex; gap: 24px;">
              <span>Store Receiver Sign: <b style="border-bottom: 1px solid #64748b; display: inline-block; min-width: 100px;">&nbsp;</b></span>
              <span>Section In-Charge: <b style="border-bottom: 1px solid #64748b; display: inline-block; min-width: 100px;">&nbsp;</b></span>
            </div>
          </div>
        `
            : ""
        }
      </div>

      <!-- Cut guide footer -->
      <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-family: monospace; color: #475569; margin-top: 4px;">
        <span>✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂</span>
        <span style="font-size: 9px; font-weight: 600; color: #64748b;">PASTE ON FRONT OF FOLDER / FILE DOCKET</span>
      </div>
    </div>
  `;
}

/**
 * Generates the HTML for a File Spine Strap (Narrow vertical slip for lever-arch or box file spine).
 * Sized ~ 48mm x 180mm.
 */
export function generateSpineStrapHtml(
  receipt: ReceiptHeader,
  options: StrapPrintOptions = { format: "spine_strap" }
): string {
  const statusInfo = getDrcDisplayStatus(receipt);
  const orgTitle = options.companyName || "ENGG STORES";
  const isHold = statusInfo.key === "on_hold";
  const isCleared = statusInfo.key === "cleared" || receipt.status === "Pending GRN";
  const statusBadgeStyle = isHold
    ? "background:#fee2e2;color:#991b1b;border:1px solid #ef4444;"
    : isCleared
    ? "background:#dcfce7;color:#166534;border:1px solid #22c55e;"
    : "background:#fef3c7;color:#92400e;border:1px solid #f59e0b;";

  const grnValue = receipt.grn_number
    ? receipt.grn_number
    : options.includeBlankGrnLine !== false
    ? "__________"
    : "-";

  return `
    <div class="drc-spine-container" style="page-break-inside: avoid; display: inline-block; margin-right: 20px; vertical-align: top;">
      <!-- Cut label -->
      <div style="font-size: 9px; font-family: monospace; color: #475569; margin-bottom: 2px; text-align: center;">
        ✂ SPINE STRAP ✂
      </div>

      <!-- Spine Box (approx 48mm wide x 175mm tall) -->
      <div style="width: 175px; min-height: 480px; border: 2.5px dashed #334155; border-radius: 6px; padding: 10px; background: #ffffff; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; text-align: center;">
        <!-- Top Spine Section -->
        <div>
          <div style="font-size: 9px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; color: #475569; border-bottom: 1.5px solid #0f172a; padding-bottom: 4px;">
            ${orgTitle}
          </div>

          <div style="margin-top: 8px;">
            <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b;">DRC NUMBER</div>
            <div style="font-size: 16px; font-weight: 900; color: #0f172a; font-family: 'Courier New', monospace; word-break: break-all; margin: 3px 0; line-height: 1.2;">
              ${receipt.drc_number}
            </div>
            <div style="font-size: 10px; font-weight: 600; color: #475569;">
              ${formatPrintDate(receipt.receipt_datetime)}
            </div>
          </div>

          <div style="margin-top: 8px;">
            <div style="display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 800; text-transform: uppercase; ${statusBadgeStyle}">
              ${statusInfo.label}
            </div>
          </div>

          <div style="margin-top: 10px; padding: 6px 0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; text-align: left;">
            <div style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: #64748b;">VENDOR</div>
            <div style="font-size: 11px; font-weight: 800; color: #0f172a; word-break: break-word; line-height: 1.25;">
              ${receipt.vendor_name}
            </div>
          </div>

          <div style="margin-top: 8px; text-align: left; font-size: 10px; line-height: 1.35;">
            ${receipt.sap_po_number ? `<div><span style="color:#64748b;font-size:8.5px;font-weight:700;">PO:</span> <b>${receipt.sap_po_number}</b></div>` : ""}
            ${receipt.gem_order_number ? `<div><span style="color:#64748b;font-size:8.5px;font-weight:700;">GeM:</span> <b>${receipt.gem_order_number}</b></div>` : ""}
            ${receipt.invoice_number ? `<div><span style="color:#64748b;font-size:8.5px;font-weight:700;">INV:</span> <b>${receipt.invoice_number}</b></div>` : ""}
            ${receipt.challan_number ? `<div><span style="color:#64748b;font-size:8.5px;font-weight:700;">CH:</span> <b>${receipt.challan_number}</b></div>` : ""}
            <div style="margin-top: 4px;"><span style="color:#64748b;font-size:8.5px;font-weight:700;">GRN:</span> <b>${grnValue}</b></div>
          </div>
        </div>

        <!-- Bottom Spine Section -->
        <div style="margin-top: 12px; border-top: 1.5px solid #cbd5e1; padding-top: 6px;">
          <div style="font-size: 8.5px; font-weight: 700; color: #64748b; text-transform: uppercase;">FILE NO / RACK</div>
          <div style="font-size: 12px; font-weight: 800; border-bottom: 1.5px solid #0f172a; min-height: 18px; margin-top: 2px;">
            &nbsp;
          </div>
          <div style="font-size: 8px; color: #94a3b8; margin-top: 4px;">INSERT IN BINDER SPINE</div>
        </div>
      </div>

      <!-- Cut guide bottom -->
      <div style="font-size: 9px; font-family: monospace; color: #475569; margin-top: 2px; text-align: center;">
        ✂ - - - - - - - - - - ✂
      </div>
    </div>
  `;
}

/**
 * Builds the complete A4 printable HTML document according to the chosen format
 */
export function buildStrapPrintDocument(
  receipt: ReceiptHeader,
  options: StrapPrintOptions
): string {
  let contentHtml: string;

  if (options.format === "horizontal_edge_strap") {
    contentHtml = generateHorizontalEdgeStrapHtml(receipt, options);
  } else if (options.format === "cover_strap") {
    contentHtml = `
      <div style="max-width: 800px; margin: 0 auto;">
        ${generateCoverStrapHtml(receipt, options)}
      </div>
    `;
  } else if (options.format === "spine_strap") {
    contentHtml = `
      <div style="display: flex; gap: 20px; flex-wrap: wrap;">
        ${generateSpineStrapHtml(receipt, options)}
        ${generateSpineStrapHtml(receipt, options)}
        ${generateSpineStrapHtml(receipt, options)}
      </div>
    `;
  } else if (options.format === "dual_cover") {
    contentHtml = `
      <div style="max-width: 800px; margin: 0 auto;">
        ${generateCoverStrapHtml(receipt, options)}
        <div style="margin-top: 24px;"></div>
        ${generateCoverStrapHtml(receipt, options)}
      </div>
    `;
  } else {
    // all_in_one (The most practical standard sheet)
    contentHtml = `
      <div style="max-width: 820px; margin: 0 auto;">
        <div style="margin-bottom: 12px; text-align: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
          <h3 style="margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #334155;">
            DRC Filing Kit: Front File Cover Strap + Binder Spine Strap
          </h3>
          <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">
            Cut along the dotted scissor lines to paste on physical register file and insert in file spine
          </p>
        </div>

        <!-- 1. Primary Front File Cover Strap -->
        ${generateCoverStrapHtml(receipt, options)}

        <!-- 2. Spine & Docket Identification Slips Section -->
        <div style="display: flex; gap: 24px; align-items: flex-start; margin-top: 16px;">
          <!-- Spine Slip 1 -->
          <div>
            ${generateSpineStrapHtml(receipt, options)}
          </div>

          <!-- Store Register Reference Slip -->
          <div style="flex: 1; border: 2.5px dashed #475569; border-radius: 6px; padding: 12px; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 8px;">
              <span style="font-weight: 800; text-transform: uppercase; color: #334155; font-size: 10px;">STORE AUDIT / REGISTER SLIP</span>
              <span style="font-family: monospace; font-weight: 700; color: #0f172a;">${receipt.drc_number}</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px;">
              <div><b>Vendor:</b> ${receipt.vendor_name}</div>
              <div><b>Date:</b> ${formatPrintDate(receipt.receipt_datetime)}</div>
              <div><b>PO No:</b> ${receipt.sap_po_number || "-"}</div>
              <div><b>Invoice:</b> ${receipt.invoice_number || "-"}</div>
              <div><b>Packages:</b> ${getPackagePrintSummary(receipt)}</div>
              <div><b>Location:</b> ${receipt.delivery_location || "-"}</div>
            </div>
            <div style="border-top: 1px dashed #cbd5e1; padding-top: 8px; margin-top: 6px;">
              <b>File Indexing Notes:</b>
              <div style="height: 48px; border-bottom: 1px solid #94a3b8; margin-top: 6px;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 12px; font-size: 9.5px; color: #64748b;">
              <span>Filing Clerk: ____________</span>
              <span>Audit Verified: ____________</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const isEdgeStrap = options.format === "horizontal_edge_strap";
  const pageMargin = isEdgeStrap ? "5mm 6mm" : "10mm";
  const bodyPadding = isEdgeStrap ? "0" : "12px";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>DRC Strap - ${receipt.drc_number}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          @page {
            size: A4;
            margin: ${pageMargin};
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: #ffffff;
            color: #0f172a;
            margin: 0;
            padding: ${bodyPadding};
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @media print {
            body {
              padding: 0;
            }
            .no-print {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        ${contentHtml}
      </body>
    </html>
  `;
}

/**
 * Builds HTML for bulk edge strap printing of multiple DRCs.
 * Stacks multiple horizontal edge straps on single page(s) with clean scissor cut lines
 * between each strap, allowing users to cut multiple straps from a single A4 sheet without paper waste.
 */
export function buildBulkEdgeStrapPrintDocument(
  receipts: ReceiptHeader[],
  _options: StrapPrintOptions = { format: "horizontal_edge_strap" }
): string {
  if (!receipts || receipts.length === 0) {
    return "";
  }

  const strapsHtml = receipts
    .map((receipt) => {
      const drcDate = formatPrintDate(receipt.receipt_datetime || receipt.created_at);
      const poNumber =
        receipt.sap_po_number ||
        receipt.po_number ||
        (receipt.gem_order_number ? `GeM:${receipt.gem_order_number}` : "-");
      const vendorName = receipt.vendor_name || "-";
      const displayDrc = receipt.drc_number?.trim() || "-";

      return `
        <div class="strap-wrapper" style="page-break-inside: avoid; break-inside: avoid; margin: 0; padding: 0; width: 100%; box-sizing: border-box;">
          <table style="width: 100%; border-collapse: collapse; border: 2.5px solid #000000; border-radius: 4px; background: #ffffff; table-layout: auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; box-sizing: border-box;">
            <tbody>
              <tr>
                <!-- 1. DRC Number with Date -->
                <td style="white-space: nowrap; width: 1%; padding: 8px 12px; border-right: 2.5px solid #000000; vertical-align: middle;">
                  <div style="display: flex; align-items: baseline; gap: 6px;">
                    <span style="font-size: 16px; font-weight: 900; font-family: 'Consolas', 'Courier New', Courier, monospace; color: #000000; letter-spacing: 0.5px;">${displayDrc}</span>
                    <span style="font-size: 13px; font-weight: 800; color: #000000;">(Dt: ${drcDate})</span>
                  </div>
                </td>

                <!-- 2. PO Number -->
                <td style="white-space: nowrap; width: 1%; padding: 8px 12px; border-right: 2.5px solid #000000; vertical-align: middle;">
                  <div style="display: flex; align-items: baseline; gap: 5px;">
                    <span style="font-size: 11.5px; font-weight: 900; color: #000000; letter-spacing: 0.5px;">PO:</span>
                    <span style="font-size: 15px; font-weight: 900; font-family: 'Consolas', 'Courier New', Courier, monospace; color: #000000;">${poNumber}</span>
                  </div>
                </td>

                <!-- 3. Vendor Name & Code -->
                <td style="width: 98%; padding: 8px 12px; vertical-align: middle; text-align: left;">
                  <div style="display: flex; align-items: baseline; gap: 6px; min-width: 0;">
                    <span style="font-size: 11.5px; font-weight: 900; color: #000000; letter-spacing: 0.5px; flex-shrink: 0;">VENDOR:</span>
                    <span style="font-size: 14.5px; font-weight: 900; color: #000000; line-height: 1.25; word-break: break-word;">
                      ${vendorName}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Scissor Cut Guide after each strap -->
          <div style="display: flex; align-items: center; margin-top: 3px; margin-bottom: 3px; color: #000000;">
            <span style="font-size: 16px; line-height: 1;">✂</span>
            <span style="flex: 1; border-bottom: 2px dashed #000000; margin: 0 6px;"></span>
            <span style="font-size: 16px; line-height: 1;">✂</span>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>DRC Edge Straps - Bulk Print (${receipts.length} Straps)</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          @page {
            size: A4;
            margin: 5mm 6mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: #ffffff;
            color: #0f172a;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @media print {
            body {
              padding: 0;
            }
            .no-print {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        <div style="width: 100%; max-width: 100%; margin: 0; padding: 0;">
          <!-- Top Scissor Guide before first strap -->
          <div style="display: flex; align-items: center; margin-bottom: 3px; color: #000000;">
            <span style="font-size: 16px; line-height: 1;">✂</span>
            <span style="flex: 1; border-bottom: 2px dashed #000000; margin: 0 6px;"></span>
            <span style="font-size: 16px; line-height: 1;">✂</span>
          </div>

          ${strapsHtml}
        </div>
      </body>
    </html>
  `;
}

/**
 * Builds the full standard A4 DRC document HTML
 */
export function buildFullDrcDocumentHtml(receipt: ReceiptHeader): string {
  const statusInfo = getDrcDisplayStatus(receipt);
  const packageSummary = getPackagePrintSummary(receipt);

  const rows: [string, string][] = [
    ["DRC Number", receipt.drc_number],
    ["Status", statusInfo.label],
    ["Inspection Remarks", receipt.inspection_remarks ?? "-"],
    ["Inspected By", receipt.inspection_by ?? "-"],
    ["Inspection Date", receipt.inspection_date ? formatPrintDateTime(receipt.inspection_date) : "-"],
    ["Receipt Date/Time", formatPrintDateTime(receipt.receipt_datetime)],
    ["Receipt Mode", receipt.receipt_mode],
    ["Vehicle Number", receipt.vehicle_number ?? "-"],
    ["Package Details", packageSummary],
    ["Vendor Name", receipt.vendor_name],
    ["SAP PO Number", receipt.sap_po_number ?? "-"],
    ["SAP PO Date", formatPrintDate(receipt.sap_po_date)],
    ["GeM Order Number", receipt.gem_order_number ?? "-"],
    ["GeM Order Date", formatPrintDate(receipt.gem_order_date)],
    ["Invoice Number", receipt.invoice_number ?? "-"],
    ["Invoice Date", formatPrintDate(receipt.invoice_date)],
    ["Challan Number", receipt.challan_number ?? "-"],
    ["Challan Date", formatPrintDate(receipt.challan_date)],
    ["E-Way Bill Number", receipt.eway_bill_number ?? "-"],
    ["E-Way Bill Date", formatPrintDate(receipt.eway_bill_date)],
    ["Lorry Receipt Number", receipt.lorry_receipt_number ?? "-"],
    ["Lorry Receipt Date", formatPrintDate(receipt.lorry_receipt_date)],
    ["Weightment Slip Number", receipt.weightment_slip_number ?? "-"],
    ["Gross Weight", receipt.gross_weight !== null ? `${receipt.gross_weight} kg` : "-"],
    ["Tare Weight", receipt.tare_weight !== null ? `${receipt.tare_weight} kg` : "-"],
    ["Net Weight", receipt.net_weight !== null ? `${receipt.net_weight} kg` : "-"],
    ["Purpose", receipt.purpose ?? receipt.remarks ?? "-"],
    [receipt.receipt_mode === "Vehicle" ? "Driver Name" : "Person Name", receipt.driver_name ?? "-"],
    ["Tax Invoice Value", receipt.tax_invoice_value !== null ? `₹${Number(receipt.tax_invoice_value).toLocaleString("en-IN")}` : "-"],
    ["MSME / Non MSME", receipt.msme_type ?? "-"],
    ["Location", receipt.delivery_location ?? "-"],
    ["Important Note", receipt.important_note ?? "-"],
    ["VIM Approval", receipt.vim_approval ?? "-"],
    ["SAP GRN Number", receipt.grn_number ?? "Pending"],
    ["SAP GRN Date", formatPrintDate(receipt.grn_date)],
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:7px 12px;font-weight:700;color:#334155;border:1px solid #cbd5e1;background:#f8fafc;width:28%;word-break:break-word;">${label}</td><td style="padding:7px 12px;color:#0f172a;border:1px solid #cbd5e1;word-break:break-word;">${value}</td></tr>`
    )
    .join("");

  const sapItems =
    receipt.sap_items && receipt.sap_items.length > 0
      ? receipt.sap_items
      : (receipt.package_details || []).filter((p) => p.material_code);

  const sapItemsHtml =
    sapItems.length > 0
      ? `
      <div style="margin-top: 20px;">
        <h3 style="font-size: 14px; text-transform: uppercase; margin: 0 0 8px 0; color: #1e293b; letter-spacing: 0.5px;">
          SAP 103 / 105 Material Items & Bin Allocations (${sapItems.length} Items)
        </h3>
        <table style="border-collapse: collapse; width: 100%; font-size: 12px;">
          <thead>
            <tr style="background: #f1f5f9; text-align: left;">
              <th style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700;">Material Code</th>
              <th style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700;">Description</th>
              <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: 700;">Qty</th>
              <th style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700;">UoM</th>
              <th style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700;">SAP Movement</th>
              <th style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700;">Bin Location</th>
            </tr>
          </thead>
          <tbody>
            ${sapItems
              .map(
                (item) => `
              <tr>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: 700;">${item.material_code || "-"}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${item.description || "-"}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: 700;">${item.quantity || "1"}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${item.uom || item.package_type || "NOS"}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 11px;">
                  ${item.sap_103_doc ? `103: ${item.sap_103_doc} ` : ""}
                  ${item.sap_105_doc ? `105: ${item.sap_105_doc}` : ""}
                  ${!item.sap_103_doc && !item.sap_105_doc ? "-" : ""}
                </td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700;">${item.bin_location || "Unallocated"}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
      : "";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>DRC - ${receipt.drc_number}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
          table { border-collapse: collapse; width: 100%; table-layout: fixed; }
        </style>
      </head>
      <body>
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h2 style="margin: 0; font-size: 22px; text-transform: uppercase;">Delivery Receipt Challan (DRC)</h2>
            <p style="margin: 4px 0 0 0; color: #475569; font-size: 14px;">Stores Material Inward & Inspection Record</p>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 20px; font-weight: 800; font-family: monospace;">${receipt.drc_number}</div>
            <div style="font-size: 12px; color: #475569; margin-top: 4px;">Status: <b>${statusInfo.label}</b></div>
          </div>
        </div>
        <table>${rowsHtml}</table>
        ${sapItemsHtml}
      </body>
    </html>
  `;
}

/**
 * Triggers printing reliably.
 * First attempts `window.open` (standard for desktop browsers).
 * If blocked (e.g. in iframe or popup blocker), falls back to a hidden iframe print.
 */
export function executePrint(htmlContent: string, documentTitle: string): void {
  try {
    const printWindow = window.open("", "_blank", "width=850,height=950");
    if (printWindow && !printWindow.closed) {
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.title = documentTitle;
      printWindow.document.close();
      printWindow.focus();
      // Short delay to ensure styles and layouts finish rendering
      setTimeout(() => {
        try {
          printWindow.print();
        } catch (e) {
          console.error("printWindow.print() error:", e);
        }
      }, 300);
      return;
    }
  } catch (err) {
    console.warn("window.open print failed or blocked, falling back to hidden iframe:", err);
  }

  // Fallback: Invisible iframe printing (100% iframe-safe)
  try {
    const existingFrame = document.getElementById("__drc_print_frame");
    if (existingFrame) {
      existingFrame.remove();
    }
    const iframe = document.createElement("iframe");
    iframe.id = "__drc_print_frame";
    iframe.title = documentTitle;
    iframe.style.position = "fixed";
    iframe.style.top = "-9999px";
    iframe.style.left = "-9999px";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.error("Iframe print error:", e);
        }
      }, 400);
    }
  } catch (iframeErr) {
    console.error("All print execution attempts failed:", iframeErr);
  }
}

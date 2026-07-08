// Supabase Edge Function: generate-drc-mail
//
// AI-assisted drafting of ready-to-copy email content for the Material
// Receipt (DRC) module:
//   - "Inspection Request" - notifies the inspecting department that a new
//     DRC needs inspection/counting.
//   - "Inspection On Hold" - notifies the internal team that inspection has
//     been put on hold, with the reason.
//   - "Counting Discrepancy" - notifies the supplier of a discrepancy found
//     while counting material during GRN processing.
//
// When the DRC has uploaded documents (Invoice, Packing List, etc.), this
// function reads the most relevant ones (as PDF/image content) so the draft
// can include real material/quantity/value details instead of generic text.
//
// This function only DRAFTS text - it never sends anything. The caller
// (receiptService.ts) copies the returned subject/body for the operator to
// paste into their own mail client.
//
// Required secret (set with `supabase secrets set ANTHROPIC_API_KEY=...`):
//   ANTHROPIC_API_KEY

import Anthropic from "npm:@anthropic-ai/sdk";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DrcMailType =
  | "Inspection Request"
  | "Inspection On Hold"
  | "Counting Discrepancy";

interface DocumentRef {
  name: string;
  url: string;
  document_type: string;
}

interface GenerateMailRequest {
  mailType: DrcMailType;
  receipt: Record<string, unknown>;
  discrepancyRemarks?: string | null;
  documents?: DocumentRef[];
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const MEDIA_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

// Only the documents most likely to carry material/quantity/value details
// are worth spending a request on - and only a couple, to keep the request
// small and fast.
const DOCUMENT_TYPE_PRIORITY = ["Invoice", "Packing List", "Test Certificate", "Challan"];
const MAX_DOCUMENTS = 2;
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

function documentPriority(documentType: string): number {
  const index = DOCUMENT_TYPE_PRIORITY.indexOf(documentType);
  return index === -1 ? DOCUMENT_TYPE_PRIORITY.length : index;
}

async function fetchDocumentBlock(doc: DocumentRef): Promise<Record<string, unknown> | null> {
  const extension = doc.name.split(".").pop()?.toLowerCase() ?? "";
  const mediaType = MEDIA_TYPE_BY_EXTENSION[extension];
  if (!mediaType) return null;

  let response: Response;
  try {
    response = await fetch(doc.url);
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_DOCUMENT_BYTES) return null;

  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);

  if (mediaType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: mediaType, data: base64 },
    };
  }
  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data: base64 },
  };
}

const INSTRUCTION_BY_TYPE: Record<DrcMailType, string> = {
  "Inspection Request":
    "Draft an email to the user/inspecting department requesting them to inspect and count the material received against this DRC. If Invoice or Packing List documents are attached, extract and list the material description, quantity, and value so the reader has full context without opening the attachment.",
  "Inspection On Hold":
    "Draft an email flagging that inspection of this DRC has been put on hold, addressed to the internal team responsible for resolving it. Clearly state the hold reason (the inspection remarks provided below) and request corrective action or clarification.",
  "Counting Discrepancy":
    "Draft an email to the supplier/vendor reporting a discrepancy found while counting the received material against this DRC during GRN processing. Clearly state the discrepancy and request the supplier resolve it (replace or ship the missing quantity, send corrected documents, etc.) at the earliest. If Invoice or Packing List documents are attached, compare the expected quantities against what the discrepancy remarks describe as short/mismatched, where possible.",
};

const SYSTEM_PROMPT = `You are an assistant embedded in an engineering stores management system. You draft concise, professional, ready-to-send email content for the Material Receipt (DRC) workflow. Output plain text only - no HTML, no markdown formatting, no asterisks. The body must be a complete, polished email: a greeting, clearly structured details, the specific ask, and a closing signature block of exactly:
Regards,
Stores Department
Use only the DRC and document details actually provided - never invent facts, quantities, or values that aren't present in the given data or documents.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let payload: GenerateMailRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  if (!payload.mailType || !payload.receipt) {
    return jsonResponse({ error: "mailType and receipt are required." }, 400);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonResponse(
      {
        error:
          "AI mail generation is not configured. Set ANTHROPIC_API_KEY as a Supabase secret.",
      },
      500
    );
  }

  const documents = (payload.documents ?? [])
    .slice()
    .sort(
      (a, b) =>
        documentPriority(a.document_type) - documentPriority(b.document_type)
    )
    .slice(0, MAX_DOCUMENTS);

  const documentBlocks = (
    await Promise.all(documents.map((d) => fetchDocumentBlock(d)))
  ).filter((b): b is Record<string, unknown> => b !== null);

  const instruction = INSTRUCTION_BY_TYPE[payload.mailType] ?? "";

  const userText = [
    `Mail type: ${payload.mailType}`,
    instruction,
    "",
    "DRC details (JSON):",
    JSON.stringify(payload.receipt, null, 2),
    "",
    payload.discrepancyRemarks
      ? `Discrepancy remarks: ${payload.discrepancyRemarks}`
      : "",
    documentBlocks.length > 0
      ? `${documentBlocks.length} supporting document(s) are attached below - read them for material/quantity/value details.`
      : "No readable supporting documents are attached.",
  ]
    .filter(Boolean)
    .join("\n");

  const content: Array<Record<string, unknown>> = [
    { type: "text", text: userText },
    ...documentBlocks,
  ];

  try {
    const client = new Anthropic({ apiKey });

    // The message/content param shapes below are asserted rather than
    // imported from the SDK's types - this function runs on Deno via an
    // `npm:` specifier, outside the app's TypeScript project, so the
    // response is narrowed manually instead of relying on SDK generics.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message: any = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "user", content: content as any }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              subject: { type: "string" },
              body: { type: "string" },
            },
            required: ["subject", "body"],
            additionalProperties: false,
          },
        },
      },
    });

    const textBlock = (
      message.content as Array<{ type: string; text?: string }>
    ).find((b) => b.type === "text");
    if (!textBlock || typeof textBlock.text !== "string") {
      throw new Error("No text content in AI response.");
    }

    const parsed = JSON.parse(textBlock.text);
    if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") {
      throw new Error("AI response missing subject/body.");
    }

    return jsonResponse({ subject: parsed.subject, body: parsed.body }, 200);
  } catch (err) {
    console.error("generate-drc-mail error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Failed to generate mail." },
      502
    );
  }
});

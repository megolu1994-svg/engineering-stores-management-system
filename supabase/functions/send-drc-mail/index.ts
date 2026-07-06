// Supabase Edge Function: send-drc-mail
//
// Sends a single email over SMTP (Office 365 / any SMTP-AUTH mailbox) on
// behalf of the Material Receipt (DRC) module - the "Inspection Required"
// mail to the user department and the "Shortage" / "Discrepancy" mails to
// the supplier. This function only sends; the caller (receiptService.ts)
// is responsible for logging the outcome to receipt_mail_log.
//
// Required secrets (set with `supabase secrets set NAME=value`):
//   SMTP_HOSTNAME   e.g. smtp.office365.com
//   SMTP_USERNAME   full mailbox address, e.g. stores@yourcompany.com
//   SMTP_PASSWORD   mailbox password or app password
// Optional secrets:
//   SMTP_PORT       defaults to 587 (STARTTLS)
//   MAIL_FROM_NAME  display name, defaults to "Stores Department"
//
// Office 365 note: Exchange Online has SMTP AUTH disabled tenant-wide by
// default. An admin must enable "Authenticated SMTP" for this specific
// mailbox (Exchange admin center > Mail flow, or via
// Set-CASMailbox -SmtpClientAuthenticationDisabled $false) before this
// function can authenticate.

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SendMailRequest {
  to: string[];
  subject: string;
  html: string;
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  }

  let payload: SendMailRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body." }, 400);
  }

  const to = Array.isArray(payload.to)
    ? payload.to.map((e) => String(e).trim()).filter(Boolean)
    : [];
  const subject = String(payload.subject ?? "").trim();
  const html = String(payload.html ?? "");

  if (to.length === 0 || to.some((e) => !EMAIL_RE.test(e))) {
    return jsonResponse(
      { success: false, error: "At least one valid recipient email is required." },
      400
    );
  }
  if (!subject) {
    return jsonResponse({ success: false, error: "Subject is required." }, 400);
  }
  if (!html) {
    return jsonResponse({ success: false, error: "Mail body is required." }, 400);
  }

  const hostname = Deno.env.get("SMTP_HOSTNAME");
  const username = Deno.env.get("SMTP_USERNAME");
  const password = Deno.env.get("SMTP_PASSWORD");
  const port = Number(Deno.env.get("SMTP_PORT") ?? "587");
  const fromName = Deno.env.get("MAIL_FROM_NAME") ?? "Stores Department";

  if (!hostname || !username || !password) {
    return jsonResponse(
      {
        success: false,
        error:
          "Mail server is not configured. Set SMTP_HOSTNAME, SMTP_USERNAME and SMTP_PASSWORD as Supabase secrets.",
      },
      500
    );
  }

  const client = new SMTPClient({
    connection: {
      hostname,
      port,
      tls: port === 465,
      auth: { username, password },
    },
  });

  try {
    await client.send({
      from: `${fromName} <${username}>`,
      to,
      subject,
      content: "auto",
      html,
    });

    return jsonResponse({ success: true }, 200);
  } catch (err) {
    console.error("send-drc-mail SMTP error:", err);
    return jsonResponse(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to send mail.",
      },
      502
    );
  } finally {
    try {
      await client.close();
    } catch {
      // ignore close errors
    }
  }
});

import { supabase } from "../config/supabase";

/**
 * Thin client for the `send-drc-mail` Supabase Edge Function - the only
 * place in the app that knows how to actually dispatch an email (over the
 * office SMTP mailbox configured server-side). Callers only deal with
 * recipient/subject/html; nothing here is DRC-specific.
 */

export interface SendMailInput {
  to: string[];
  subject: string;
  html: string;
}

export interface SendMailResult {
  success: boolean;
  error?: string;
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  try {
    const { data, error } = await supabase.functions.invoke("send-drc-mail", {
      body: input,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data && (data as SendMailResult).success === false) {
      return {
        success: false,
        error: (data as SendMailResult).error ?? "Failed to send mail.",
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send mail.",
    };
  }
}

/** Splits a comma/semicolon-separated recipient field into trimmed emails. */
export function parseRecipientList(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

// Minimal Stripe Checkout client using the REST API directly (no SDK needed in Workers).

import type { Product } from "./catalog";

const API = "https://api.stripe.com/v1";

export type CheckoutSession = {
  id: string;
  url: string | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  created: number;
  metadata: Record<string, string> | null;
  customer_details: { email: string | null } | null;
};

async function call<T>(secretKey: string, path: string, body?: URLSearchParams): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(body && { "Content-Type": "application/x-www-form-urlencoded" }),
    },
    body,
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(`Stripe ${path}: ${json.error?.message ?? res.status}`);
  return json;
}

export function createCheckoutSession(
  secretKey: string,
  product: Product,
  currency: string,
  origin: string,
): Promise<CheckoutSession> {
  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][unit_amount]": String(product.priceCents),
    "line_items[0][price_data][product_data][name]": product.name,
    "line_items[0][price_data][product_data][description]": product.summary,
    "metadata[product_id]": product.id,
    allow_promotion_codes: "true",
    success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/p/${product.id}`,
  });
  return call(secretKey, "/checkout/sessions", body);
}

export function getCheckoutSession(secretKey: string, id: string): Promise<CheckoutSession> {
  return call(secretKey, `/checkout/sessions/${encodeURIComponent(id)}`);
}

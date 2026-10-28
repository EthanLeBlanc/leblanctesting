import { deliverables, getProduct, KIND_LABELS, type Product, type ProductKind } from "./catalog";
import { createCheckoutSession, getCheckoutSession } from "./stripe";
import { signDownload, verifyDownload } from "./tokens";
import { downloadsPage, homePage, messagePage, productPage, type Download } from "./views";

// Set with `npx wrangler secret put <NAME>` (or in .dev.vars for local dev).
type AppEnv = Env & {
  STRIPE_SECRET_KEY: string;
  DOWNLOAD_SIGNING_SECRET: string;
};

const DAY = 24 * 60 * 60;
// Free downloads only need to survive the click.
const FREE_LINK_SECONDS = 60 * 60;

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function signedDownloads(env: AppEnv, product: Product, expiresAt: number): Promise<Download[]> {
  return Promise.all(
    deliverables(product).map(async (p) => ({
      product: p,
      url: `/download?token=${await signDownload(env.DOWNLOAD_SIGNING_SECRET, p.file!, expiresAt)}`,
    })),
  );
}

async function handle(request: Request, env: AppEnv): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const site = env.SITE_NAME;
  const currency = env.CURRENCY;
  const notFound = () => html(messagePage(site, "Not found", "That page doesn't exist."), 404);

  if (request.method === "GET" && pathname === "/") {
    const kind = url.searchParams.get("kind");
    const valid = kind && kind in KIND_LABELS ? (kind as ProductKind) : null;
    return html(homePage(site, currency, valid));
  }

  const productMatch = pathname.match(/^\/p\/([\w-]+)$/);
  if (request.method === "GET" && productMatch) {
    const product = getProduct(productMatch[1]);
    if (!product) return notFound();
    return html(productPage(site, currency, product, deliverables(product)));
  }

  const freeMatch = pathname.match(/^\/free\/([\w-]+)$/);
  if (request.method === "POST" && freeMatch) {
    const product = getProduct(freeMatch[1]);
    if (!product || product.priceCents !== 0) return notFound();
    const expiresAt = Math.floor(Date.now() / 1000) + FREE_LINK_SECONDS;
    const downloads = await signedDownloads(env, product, expiresAt);
    return html(downloadsPage(site, downloads, new Date(expiresAt * 1000)));
  }

  const buyMatch = pathname.match(/^\/buy\/([\w-]+)$/);
  if (request.method === "POST" && buyMatch) {
    const product = getProduct(buyMatch[1]);
    if (!product || product.priceCents === 0) return notFound();
    const session = await createCheckoutSession(env.STRIPE_SECRET_KEY, product, currency, url.origin);
    if (!session.url) throw new Error(`Checkout session ${session.id} has no URL`);
    return Response.redirect(session.url, 303);
  }

  if (request.method === "GET" && pathname === "/success") {
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) return notFound();
    let session;
    try {
      session = await getCheckoutSession(env.STRIPE_SECRET_KEY, sessionId);
    } catch {
      return html(messagePage(site, "Order not found", "We couldn't find that order."), 404);
    }
    const product = getProduct(session.metadata?.product_id ?? "");
    if (session.payment_status !== "paid" || !product) {
      return html(
        messagePage(site, "Payment not complete", "This order hasn't been paid yet. If you were charged, contact us with your receipt."),
        402,
      );
    }
    // Links stay valid for a fixed window after purchase, however often this page is reloaded.
    const expiresAt = session.created + Number(env.DOWNLOAD_WINDOW_DAYS) * DAY;
    if (expiresAt < Date.now() / 1000) {
      return html(
        messagePage(site, "Download window closed", "This order's download links have expired. Contact us with your receipt and we'll send a fresh link."),
        410,
      );
    }
    const downloads = await signedDownloads(env, product, expiresAt);
    return html(downloadsPage(site, downloads, new Date(expiresAt * 1000), session.customer_details?.email));
  }

  if (request.method === "GET" && pathname === "/download") {
    const key = await verifyDownload(env.DOWNLOAD_SIGNING_SECRET, url.searchParams.get("token") ?? "");
    if (!key) {
      return html(messagePage(site, "Link expired", "This download link is invalid or has expired."), 403);
    }
    const object = await env.FILES.get(key);
    if (!object) return html(messagePage(site, "File missing", "This file isn't available right now. Please contact us."), 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Disposition", `attachment; filename="${key.split("/").pop()}"`);
    headers.set("Cache-Control", "private, no-store");
    return new Response(object.body, { headers });
  }

  return notFound();
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await handle(request, env as AppEnv);
    } catch (err) {
      console.error(err);
      return html(messagePage(env.SITE_NAME, "Something went wrong", "Please try again in a minute."), 500);
    }
  },
} satisfies ExportedHandler<Env>;

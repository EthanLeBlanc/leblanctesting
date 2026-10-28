// Server-rendered HTML pages. Every interpolated value goes through `esc`.

import { KIND_LABELS, PRODUCTS, type Product, type ProductKind } from "./catalog";

export type Download = { product: Product; url: string };

export function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export function formatPrice(cents: number, currency: string): string {
  if (cents === 0) return "Free";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function layout(siteName: string, title: string, body: string, description = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title === siteName ? siteName : `${title} | ${siteName}`)}</title>
<meta name="description" content="${esc(description || `MX Bikes setups, tracks and skins from ${siteName}.`)}">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="top"><a class="brand" href="/">${esc(siteName)}</a></header>
<main>${body}</main>
<footer>Made for <a href="https://mx-bikes.com" rel="noopener">MX Bikes</a>. Payments are handled by Stripe.</footer>
</body>
</html>`;
}

function card(p: Product, currency: string): string {
  return `<a class="card" href="/p/${esc(p.id)}">
  ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : `<div class="ph">${esc(KIND_LABELS[p.kind])}</div>`}
  <div class="card-body">
    <span class="tag">${esc(KIND_LABELS[p.kind])}</span>
    <h3>${esc(p.name)}</h3>
    <p>${esc(p.summary)}</p>
    <strong class="price">${esc(formatPrice(p.priceCents, currency))}</strong>
  </div>
</a>`;
}

export function homePage(siteName: string, currency: string, kind: ProductKind | null): string {
  const kinds = Object.keys(KIND_LABELS) as ProductKind[];
  const tabs = [
    `<a href="/" class="${kind ? "" : "active"}">All</a>`,
    ...kinds
      .filter((k) => PRODUCTS.some((p) => p.kind === k))
      .map((k) => `<a href="/?kind=${k}" class="${kind === k ? "active" : ""}">${KIND_LABELS[k]}</a>`),
  ].join("");
  const items = PRODUCTS.filter((p) => !kind || p.kind === kind);
  return layout(
    siteName,
    siteName,
    `<section class="hero">
  <h1>Ride faster in MX Bikes</h1>
  <p>Setups, tracks and skins, ready to drop into your game. Pay once and download instantly.</p>
</section>
<nav class="tabs">${tabs}</nav>
<section class="grid">${items.map((p) => card(p, currency)).join("")}</section>`,
  );
}

export function productPage(siteName: string, currency: string, p: Product, contents: Product[]): string {
  const free = p.priceCents === 0;
  const included =
    p.kind === "bundle" && contents.length
      ? `<h2>Included</h2><ul>${contents.map((c) => `<li><a href="/p/${esc(c.id)}">${esc(c.name)}</a></li>`).join("")}</ul>`
      : "";
  return layout(
    siteName,
    p.name,
    `<article class="product">
  ${p.image ? `<img class="hero-img" src="${esc(p.image)}" alt="">` : ""}
  <span class="tag">${esc(KIND_LABELS[p.kind])}</span>
  <h1>${esc(p.name)}</h1>
  ${p.description.map((d) => `<p>${esc(d)}</p>`).join("")}
  ${p.details?.length ? `<ul class="details">${p.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
  ${included}
  <form method="post" action="/${free ? "free" : "buy"}/${esc(p.id)}">
    <button type="submit">${free ? "Download free" : `Buy for ${esc(formatPrice(p.priceCents, currency))}`}</button>
  </form>
  ${free ? "" : `<p class="muted">Secure checkout with Stripe. Your download link appears right after payment.</p>`}
</article>`,
    p.summary,
  );
}

export function downloadsPage(siteName: string, downloads: Download[], validUntil: Date, email?: string | null): string {
  const list = downloads
    .map(
      ({ product, url }) => `<li>
  <a class="button" href="${esc(url)}">Download ${esc(product.name)}</a>
  ${product.install ? `<p class="muted">${esc(product.install)}</p>` : ""}
</li>`,
    )
    .join("");
  return layout(
    siteName,
    "Your downloads",
    `<article class="product">
  <h1>Thanks! Your downloads are ready</h1>
  ${email ? `<p>A receipt has been sent to ${esc(email)}.</p>` : ""}
  <ul class="downloads">${list}</ul>
  <p class="muted">Bookmark this page: the links work until ${esc(validUntil.toUTCString())}.</p>
</article>`,
  );
}

export function messagePage(siteName: string, title: string, message: string): string {
  return layout(
    siteName,
    title,
    `<article class="product"><h1>${esc(title)}</h1><p>${esc(message)}</p><p><a href="/">Back to the shop</a></p></article>`,
  );
}

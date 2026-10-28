# MX Bikes Shop

A small storefront for selling your own MX Bikes setups, tracks and skins. It runs on Cloudflare Workers, takes payment with Stripe Checkout, keeps the files in Cloudflare R2, and gives each buyer download links that expire.

- **No database.** The catalog is a TypeScript file (`src/catalog.ts`). Stripe keeps the order records, and a download link is an HMAC-signed token, so there is nothing else to store.
- **Free items** download straight away. Use one as a free sample that sends people to the paid items.
- **Bundles** sell several products at a discount, and the buyer gets every file in the bundle.
- **Promo codes:** Checkout accepts the promotion codes you create in the Stripe dashboard, which is handy for creators and Discord giveaways.
- **Download links** stay valid for `DOWNLOAD_WINDOW_DAYS` (7 by default) after purchase. Buyers can bookmark the page that lists them.

## Routes

| Route | What it does |
| --- | --- |
| `GET /` (`?kind=setup\|track\|skin\|bundle`) | Catalog |
| `GET /p/:id` | Product page |
| `POST /buy/:id` | Creates a Stripe Checkout session and redirects to it |
| `GET /success?session_id=…` | Checks the payment with Stripe and lists signed download links |
| `POST /free/:id` | Download links for free products |
| `GET /download?token=…` | Checks the token and streams the file from R2 |

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create the R2 bucket and upload your files:
   ```bash
   npx wrangler r2 bucket create mxbikes-shop-files
   npx wrangler r2 object put mxbikes-shop-files/setups/sand-450f.zip --file ./sand-450f.zip --remote
   ```
3. Edit `src/catalog.ts`: replace the example products with your own. Each product's `file` is its R2 key. Prices are in cents.
4. Set the secrets:
   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY        # sk_live_... from https://dashboard.stripe.com/apikeys
   npx wrangler secret put DOWNLOAD_SIGNING_SECRET  # any long random string, e.g. `openssl rand -hex 32`
   ```
5. Optionally change `SITE_NAME`, `CURRENCY` and `DOWNLOAD_WINDOW_DAYS` under `vars` in `wrangler.json`.
6. Deploy:
   ```bash
   npm run deploy
   ```

Product images go in `public/` (for example `public/img/sand.jpg`), referenced as `image: "/img/sand.jpg"`.

## Local development

```bash
cp .dev.vars.example .dev.vars   # use a Stripe *test* key here
npx wrangler r2 object put mxbikes-shop-files/setups/starter-450f.zip --file ./starter.zip --local
npm run dev
```

Pay with Stripe's test card `4242 4242 4242 4242`, any future expiry date and any CVC.

`npm run check` runs the typecheck and a dry-run deploy.

## Selling tips

- Sell content you made yourself. Don't resell other modders' tracks or bikes, or assets ripped from other games, and check PiBoSo's terms for MX Bikes content.
- A free setup or a free track version makes a good sample. Post a lap video using your setup on YouTube or TikTok, with the shop link in the description.
- Bundles and Discord promo codes raise the average order without you having to make more content.

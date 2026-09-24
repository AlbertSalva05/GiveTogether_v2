# Deploying GiveTogether on Render

One static site with two entry points — the marketing landing page (`index.html`) and the donor app
(`app.html`) — sharing one token file and one JSON feed. Plain HTML, CSS, jQuery. No build step, no server,
no environment variables.

## What's in the package

```
render.yaml                  Render Blueprint (static site + security headers + caching)
site/
  index.html                 Landing page — hero, platform, how it works, live campaigns, pricing, FAQ, CTA
  app.html                   Donor app shell — header, nav, sprite, SEO, JSON-LD
  404.html                   Served by Render for unknown paths
  robots.txt · sitemap.xml   SEO
  manifest.webmanifest       Installable on Android/iOS home screen
  data/campaigns.json        Campaign feed (swap for your API later)
  assets/css/tokens.css      Design tokens: primitives → semantic → spacing/type/elevation
  assets/css/landing.css     Landing page components (BEM)
  assets/css/main.css        App components (BEM) + 3 breakpoints
  assets/js/landing.js       Menu, section highlighting, FAQ, live campaign cards, contact form
  assets/js/app.js           App router, views, validation, simulated payment
  assets/icons/icn_favicon_01.svg
  assets/img/README.md       Image slot names (img_campaign_01.jpg …)
```

## Option A — Blueprint (recommended)

1. Put the contents of this folder in a GitHub/GitLab repo (`render.yaml` at the root, `site/` beside it).
2. In Render: **New → Blueprint**, pick the repo, click **Apply**.
3. Render creates `givetogether-app` and publishes `site/`. The headers in `render.yaml` are applied
   automatically.

## Option B — Manual static site

1. **New → Static Site**, connect the repo.
2. Root directory: `site` · Build command: *(leave blank)* · Publish directory: `.`
3. Add the headers from `render.yaml` under **Settings → Headers**.

## After the first deploy

- Replace `givetogether.onrender.com` in `site/index.html` (canonical + og:image), `robots.txt` and
  `sitemap.xml` with your real URL or custom domain.
- Add photography to `site/assets/img/` using the names in `assets/img/README.md`.

## Routes (no rewrite rules needed)

| URL | Screen |
| --- | --- |
| `/` | Landing page |
| `/app.html#/` | 1 · Discover |
| `/app.html#/c/{slug}` | 2 · Campaign page |
| `/app.html#/give/{slug}` | 3 · Choose amount |
| `/app.html#/give/{slug}/pay` | 4 · Payment |
| `/app.html#/thank-you/{ref}` | 5 · Confirmation |
| `/app.html#/explore` · `#/gifts` · `#/start` | Explore, My gifts, Start a campaign |

Landing → app: header "Open the app", hero "Give to a campaign", every live campaign card, CTA band, footer.
App → landing: "For organisers" in the header, "About GiveTogether" in the footer, and the Start screen.

## Responsive behaviour

| Width | Navigation | Layout |
| --- | --- | --- |
| < 768 px | Bottom tab bar + FAB; checkout hides it and shows a sticky action dock | Single column, splash on first visit |
| 768–1199 px | 80 px left rail, search in header | 8/4 and 7/5 grids, sticky side panel |
| ≥ 1200 px | Top nav, 1200 px content cap | 7/5 grids, 3-up campaign cards |

## Security notes

- CSP allows scripts only from this origin and `code.jquery.com` (pinned with SRI), fonts only from Google.
  No inline scripts or inline styles are used, so the CSP needs no `unsafe-inline`.
- Every dynamic string is HTML-escaped before rendering.
- Payment is **simulated**: card number and CVC are validated (Luhn, expiry, CVC length) and then
  discarded — only the last four digits are kept, in this browser's localStorage, for the receipt.
  Before taking real money, replace `submitPayment()` in `app.js` with your PSP's hosted fields
  (PayMongo, Xendit, Maya Checkout) so card data never touches your code.

## Local preview

Any static server works (the JSON is loaded with fetch, so `file://` won't):

```
cd site && python3 -m http.server 8080
```

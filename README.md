# GiveTogether — responsive site

Landing page and donor app, deployable to Render as one static site.

- `site/index.html` — landing page
- `site/app.html` — donor app (Discover → Campaign → Amount → Payment → Confirmation)
- `render.yaml` — Render Blueprint (static hosting, security headers, caching)
- `DEPLOY.md` — step-by-step deploy guide

## Deploy in 3 steps
1. Push this folder to a new GitHub repo (keep `render.yaml` at the root).
2. Render → **New → Blueprint** → select the repo → **Apply**.
3. Open the `.onrender.com` URL Render gives you.

## Preview locally
```
cd site && python3 -m http.server 8080
```
Then open http://localhost:8080 (the JSON feed won't load from `file://`).

Stack: HTML5, CSS custom properties (tokens.css), jQuery 3.7.1 (CDN + SRI), JSON. No build step.

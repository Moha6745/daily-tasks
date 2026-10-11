# Deploying to Cloudflare

The app is a single static page (`public/index.html`) with no backend and no
build step. It deploys as a static-only Worker — Cloudflare serves `public/`
directly from its edge.

Config lives in `wrangler.jsonc`. The Worker is named `daily-tasks`, so the
default URL will be `https://daily-tasks.<your-subdomain>.workers.dev`.

## Option A — deploy from your machine

Needs Node 20+ and a Cloudflare account.

```sh
npm install
npx wrangler login     # opens a browser to authorize
npm run deploy
```

To preview locally first, `npm run dev` serves it on http://localhost:8787.

## Option B — deploy automatically on push to `main`

`.github/workflows/deploy.yml` deploys on every push to `main` (and on manual
dispatch). It needs two repository secrets, under
**Settings → Secrets and variables → Actions**:

| Secret | Where to get it |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → Create Token → **Edit Cloudflare Workers** template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → Account ID in the right sidebar |

Scope the token to the Workers Scripts **Edit** permission only; it does not
need access to DNS, zones, or any other resource.

## Custom domain

Add a `routes` entry to `wrangler.jsonc` once the domain is on Cloudflare:

```jsonc
"routes": [
  { "pattern": "tasks.example.com", "custom_domain": true }
]
```

## Notes

- Tasks are stored in the browser's `localStorage`, so data stays per-device.
  Nothing is sent to a server and there is no database to provision.
- `not_found_handling: "single-page-application"` makes any unknown path serve
  `index.html` rather than a 404.

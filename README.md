# daily-tasks

مهامي اليومية — a small single-page daily task tracker in Arabic (RTL).
Add, complete, flag and filter tasks; everything is kept in the browser's
`localStorage`.

- `public/index.html` — the whole app: markup, styles and script in one file.
- `wrangler.jsonc` — Cloudflare config for serving `public/` as a static Worker.

## Running it

Open `public/index.html` in a browser, or serve it through the Workers runtime
with `npm install && npm run dev`.

## Deploying

See [DEPLOY.md](DEPLOY.md).

# GROWTH — Workout, Schedule & Macro Tracker

A single-page PWA (`index.html`) with a workout routine planner (4-week Pull/Push/Legs cycle), a daily schedule with an active-plan banner, macro/water/meal tracking, and analytics (volume, cardio, muscle balance, V-taper). A companion page (`Gym.html`) offers a simulated training-log sandbox. Sync between devices goes through the Vercel serverless function in `api/sync.js`, with the browser's `localStorage` acting as the per-device source of truth.

## Sync & data storage (important)

Your data is always saved locally on each device (`localStorage`). A cloud copy is kept by the server (`api/sync.js`) so your phone and PC can share state.

- The app **never lets an empty server snapshot overwrite real local data**, so a redeploy alone can't reset your macros/logs (see the data-loss guard in `index.html`, `pullCloudState`).
- **But**: without durable server storage, the cloud copy is held in memory and **every Vercel redeploy resets it to empty**. Your devices still keep their own data and will re-upload it, yet the smoothest setup is to give the server a durable store — an Upstash KV (Redis) database.

### Enable durable cloud storage (Upstash KV) — 2 minutes

1. **Create a database**
   - Sign in at <https://console.upstash.com> → **Create Database**.
   - Pick a name (e.g. `growthapp`), any region close to your Vercel region, and create it.
   - On the database page, open the **REST API** section and copy:
     - `UPSTASH_REDIS_REST_URL` (e.g. `https://us1-...upstash.io`)
     - `UPSTASH_REDIS_REST_TOKEN` (the bearer token)

2. **Add the env vars to Vercel**
   - Open your project at <https://vercel.com> → **Settings → Environment Variables**.
   - Add for **Production** (and Preview/Development if you want it everywhere):
     - `KV_REST_API_URL` = the REST URL
     - `KV_REST_API_TOKEN` = the REST token
   - (The legacy names `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are also supported if you prefer.)
   - Click **Save**, then **Deploy** (or push to `main` again) to apply.

3. **Verify it works**
   - Open the deployed app and hover over the green **sync LED** in the header.
   - It should read: *"Server sync live — durable Upstash KV storage (survives redeploys)"*.
   - If it still says *"memory only"*, the env vars aren't reaching the function (check the Vercel project + redeploy, and that you didn't set them only for a different environment).

With KV configured, the server persists the full snapshot under the key `growthapp_master_state`, so a redeploy no longer clears the cloud copy — the client-side guard remains as a safety net regardless.

## Local development

The app is plain static HTML/JS — open `index.html` directly or serve the folder:

```bash
npx serve .
```

`api/sync.js` runs as a Vercel serverless function in production; locally the sync endpoints 404/405, which is expected (the app degrades gracefully to `localStorage` + the fallback cloud object).

## Deploying

The repo is connected to GitHub; pushing to `main` triggers a Vercel deploy. The service worker cache is versioned (`sw.js`, `CACHE_NAME`) — bump it whenever you change the client so installed PWAs fetch the new build (users should refresh the PWA once after an update).

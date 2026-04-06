# Supabase setup (Edge Function + replay)

This repo uses Supabase for:
- Postgres tables (`devices`, `location_logs`)
- Realtime updates (frontend subscribes to `location_logs` INSERTs)
- An Edge Function (`lorawan-webhook`) that ingests normalized location events

## 1) Create / open your Supabase project
- Supabase Dashboard → select your project
- Project Settings → API
  - copy **Project URL**
  - copy **anon public** key
  - copy **service_role** key (keep this server-side only)

## 2) Frontend env vars
Create `frontend/.env.local` (use `frontend/.env.example` as a template):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Run the frontend:
- `cd frontend`
- `npm install`
- `npm run dev`

## 3) Deploy the Edge Function
### Option A (recommended): Supabase CLI
Install + login:
- `brew install supabase/tap/supabase` (macOS)
- `supabase login`

From repo root:
- `supabase init` (if you don’t already have a `supabase/config.toml`)
- `supabase link --project-ref <your_project_ref>`

Set secrets (stored in Supabase, not in git):
- `supabase secrets set WEBHOOK_SECRET=your_secret_here`
- `supabase secrets set SERVICE_ROLE_KEY=your_service_role_key_here`

Deploy:
- `supabase functions deploy lorawan-webhook --no-verify-jwt`

### Option B: Dashboard (manual)
Supabase Dashboard → Edge Functions → New Function → `lorawan-webhook`
- Paste the code from `supabase/functions/lorawan-webhook/index.ts`
- Add secrets in Dashboard → Project Settings → Edge Functions → Secrets:
  - `WEBHOOK_SECRET`
  - `SERVICE_ROLE_KEY`

## 4) Replay mock SenseCAP OpenStream messages
This repo includes:
- `frontend/tests/replay/mock_stream.ndjson`
- `frontend/tests/replay/replaySensecapOpenStream.mjs`

Run replay (from repo root):
- `SUPABASE_URL='https://<ref>.supabase.co' WEBHOOK_SECRET='your_secret_here' node frontend/tests/replay/replaySensecapOpenStream.mjs --speed 2`

To spread updates out by 5 seconds between points:
- `SUPABASE_URL='https://<ref>.supabase.co' WEBHOOK_SECRET='your_secret_here' node frontend/tests/replay/replaySensecapOpenStream.mjs --delay-ms 5000`

Notes:
- The replay script shifts timestamps to “now” by default (preserves relative deltas) so you can run it repeatedly without hitting unique `(device_id, recorded_at)` constraints.
- To keep the original timestamps, pass `--no-shift-to-now`.
- To force a specific offset, pass `--time-offset-ms <number>`.

The function URL is:
- `https://<ref>.supabase.co/functions/v1/lorawan-webhook`

## 5) Is the frontend ready?
Yes — it will update live as `location_logs` rows are inserted.
If you don’t see movement, check:
- Realtime is enabled for `location_logs` in Supabase (publication includes it)
- Your RLS policies allow the signed-in user to read the device + location logs
- The device exists in `devices` with `device_eui` matching the replay data

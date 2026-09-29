// Vercel Serverless Function: api/sync.js
// Handles Server-Level State Sync for GrowthApp across Phone & PC

let serverState = {
  checklistState: {},
  customExerciseDetails: {},
  waterLoggedMl: 0,
  loggedMeals: [],
  updatedAt: new Date().toISOString()
};

export default async function handler(req, res) {
  // Set CORS headers so PWA on any domain can connect
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  // Supabase backup — a durable SECOND copy of every snapshot, so a KV outage,
  // quota loss or redeploy can never wipe user data. Configured via Vercel env
  // vars (key never lives in the repo); KV stays the primary store. Disabled
  // silently when the env vars are absent.
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const SUPABASE_TABLE = 'growthapp_state';
  const supabaseEnabled = !!(supabaseUrl && supabaseKey);

  // Best-effort upsert of the full snapshot — never throws: a missing table, RLS
  // denial or network failure must not break the sync endpoint.
  async function writeSupabaseBackup(state) {
    if (!supabaseEnabled) return false;
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/${SUPABASE_TABLE}?on_conflict=id`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify([{ id: 'master', state, updated_at: new Date().toISOString() }])
      });
      if (!r.ok) console.warn('Supabase backup write failed:', r.status);
      return r.ok;
    } catch (e) {
      console.warn('Supabase backup write error:', e.message);
      return false;
    }
  }

  // Read the backed-up snapshot — served when KV misses (empty key, cold KV,
  // failed fetch, or no KV env at all).
  async function readSupabaseBackup() {
    if (!supabaseEnabled) return null;
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/${SUPABASE_TABLE}?id=eq.master&select=state`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
      });
      if (!r.ok) return null;
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length && rows[0].state) return rows[0].state;
      return null;
    } catch (e) {
      return null;
    }
  }

  // GET Server State
  if (req.method === 'GET') {
    let kvData = null;
    let kvNote = null;
    let kvReachable = false;

    if (kvUrl && kvToken) {
      try {
        const kvRes = await fetch(`${kvUrl}/get/growthapp_master_state`, {
          headers: { Authorization: `Bearer ${kvToken}` }
        });
        const kvParsed = await kvRes.json();
        if (kvParsed && kvParsed.result) {
          kvData = typeof kvParsed.result === 'string' ? JSON.parse(kvParsed.result) : kvParsed.result;
        }
        kvReachable = true; // reachable (hit or empty key) = durable
      } catch (e) {
        // KV fetch failed — keep the error detail for the client's debug tooltip
        kvNote = e.message || String(e);
      }
    } else {
      kvNote = 'no_kv_env_vars';
    }

    if (kvData) {
      return res.status(200).json({ success: true, source: 'vercel_kv', durable: true, data: kvData });
    }

    // KV missed (empty key, cold KV, error or unconfigured) — serve the durable
    // Supabase backup so a KV/deploy failure can never wipe the user's data.
    const backup = await readSupabaseBackup();
    if (backup) {
      return res.status(200).json({ success: true, source: 'supabase_backup', durable: true, data: backup });
    }

    if (kvReachable) {
      // KV reachable but key doesn't exist yet and no backup — still durable
      return res.status(200).json({ success: true, source: 'vercel_kv', durable: true, data: null, kvStatus: 'empty_key' });
    }
    // No durable store available — volatile in-memory state (may be empty after a redeploy)
    return res.status(200).json({ success: true, source: 'server_api', durable: false, data: serverState, kvError: kvNote || 'no_backup_available' });
  }

  // POST Update Server State
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const data = body.data || body;

      // The client always sends complete snapshots, so replace (not merge) the stored state.
      // Merging would prevent deletions (e.g. unchecking a workout) from ever reaching other devices.
      if (data.checklistState) serverState.checklistState = data.checklistState;
      if (data.cardioState) serverState.cardioState = data.cardioState;
      if (data.customExerciseDetails) serverState.customExerciseDetails = data.customExerciseDetails;
      if (data.waterLoggedMl !== undefined) serverState.waterLoggedMl = data.waterLoggedMl;
      if (data.userProfile) serverState.userProfile = data.userProfile;
      if (data.loggedMeals) serverState.loggedMeals = data.loggedMeals;
      if (data.masterSchedule) serverState.masterSchedule = data.masterSchedule;
      if (data.historicalArchive) serverState.historicalArchive = data.historicalArchive;
      if (data.programStartDate) serverState.programStartDate = data.programStartDate;
      // Day-rollover stamp + archived daily macro totals for DAILY nutrition data
      if (data.lastMealDateKey) serverState.lastMealDateKey = data.lastMealDateKey;
      if (data.macroHistory) serverState.macroHistory = data.macroHistory;
      serverState.updatedAt = new Date().toISOString();

      if (kvUrl && kvToken) {        // Store the JSON string once — double-encoding made the GET round-trip return a string
        // instead of an object, so synced clients silently ignored the KV snapshot.
        // Never let a flaky KV write fail the whole push: the in-memory state is still updated
        // above, and the client guard protects local data until KV recovers.
        try {
          await fetch(`${kvUrl}/set/growthapp_master_state`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(serverState)
          });
        } catch (e) {
          console.warn("Vercel KV write notice:", e);
        }
      }

      // Dual-write the same snapshot to Supabase — the durable fallback the GET
      // path serves from whenever KV misses. Best-effort: never fails the push.
      await writeSupabaseBackup(serverState);

      return res.status(200).json({ success: true, data: serverState });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

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

  // GET Server State
  if (req.method === 'GET') {
    if (kvUrl && kvToken) {
      try {
        const kvRes = await fetch(`${kvUrl}/get/growthapp_master_state`, {
          headers: { Authorization: `Bearer ${kvToken}` }
        });
        const kvData = await kvRes.json();
        if (kvData && kvData.result) {
          const parsed = typeof kvData.result === 'string' ? JSON.parse(kvData.result) : kvData.result;
          return res.status(200).json({ success: true, source: 'vercel_kv', durable: true, data: parsed });
        } else {
          // KV reachable but key doesn't exist yet — still durable
          return res.status(200).json({ success: true, source: 'vercel_kv', durable: true, data: null, kvStatus: 'empty_key' });
        }
      } catch (e) {
        // KV fetch failed — include error detail so client can debug
        return res.status(200).json({ success: true, source: 'server_api', durable: false, data: serverState, kvError: e.message || String(e) });
      }
    }
    return res.status(200).json({ success: true, source: 'server_api', durable: false, data: serverState, kvError: 'no_kv_env_vars' });
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
      serverState.updatedAt = new Date().toISOString();

      if (kvUrl && kvToken) {
        // Store the JSON string once — double-encoding made the GET round-trip return a string
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

      return res.status(200).json({ success: true, data: serverState });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

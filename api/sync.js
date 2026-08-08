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
          return res.status(200).json({ success: true, source: 'vercel_kv', data: parsed });
        }
      } catch (e) {
        console.warn("Vercel KV fetch notice:", e);
      }
    }
    return res.status(200).json({ success: true, source: 'server_api', data: serverState });
  }

  // POST Update Server State
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const data = body.data || body;

      if (data.checklistState) {
        serverState.checklistState = { ...serverState.checklistState, ...data.checklistState };
      }
      if (data.customExerciseDetails) {
        serverState.customExerciseDetails = { ...serverState.customExerciseDetails, ...data.customExerciseDetails };
      }
      if (data.waterLoggedMl !== undefined) serverState.waterLoggedMl = data.waterLoggedMl;
      if (data.loggedMeals) serverState.loggedMeals = data.loggedMeals;
      if (data.masterSchedule) serverState.masterSchedule = data.masterSchedule;
      serverState.updatedAt = new Date().toISOString();

      if (kvUrl && kvToken) {
        await fetch(`${kvUrl}/set/growthapp_master_state`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(JSON.stringify(serverState))
        });
      }

      return res.status(200).json({ success: true, data: serverState });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

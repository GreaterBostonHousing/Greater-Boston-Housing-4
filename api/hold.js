module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY)
    return res.status(200).json({ success: true });

  const headers = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Prefer": "return=representation",
  };

  if (req.method === "DELETE") {
    const { sessionId } = req.body;
    if (sessionId) {
      await fetch(`${SUPABASE_URL}/rest/v1/holds?session_id=eq.${sessionId}`, { method: "DELETE", headers }).catch(() => {});
    }
    return res.status(200).json({ success: true });
  }

  if (req.method === "POST") {
    const { room, checkIn, checkOut, sessionId } = req.body;
    if (!room || !checkIn || !checkOut || !sessionId)
      return res.status(400).json({ error: "Missing fields" });

    await fetch(`${SUPABASE_URL}/rest/v1/holds?expires_at=lt.${new Date().toISOString()}`, { method: "DELETE", headers }).catch(() => {});

    const overlapFilter = `room=eq.${encodeURIComponent(room)}&check_in=lt.${checkOut}&check_out=gt.${checkIn}`;

    const holdsRes = await fetch(`${SUPABASE_URL}/rest/v1/holds?${overlapFilter}&select=id`, { headers });
    const holds = await holdsRes.json();
    if (holds.length > 0)
      return res.status(409).json({ available: false, error: `${room} is currently being booked by someone else. Please try again in a few minutes.` });

    const bookingsRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings?${overlapFilter}&status=eq.active&select=id`, { headers });
    const bookings = await bookingsRes.json();
    if (bookings.length > 0)
      return res.status(409).json({ available: false, error: `${room} is already booked for those dates.` });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await fetch(`${SUPABASE_URL}/rest/v1/holds`, {
      method: "POST", headers,
      body: JSON.stringify({ room, check_in: checkIn, check_out: checkOut, session_id: sessionId, expires_at: expiresAt }),
    });

    return res.status(200).json({ success: true, expiresAt });
  }

  res.status(405).json({ error: "Method not allowed" });
};

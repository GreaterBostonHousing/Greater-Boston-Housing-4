module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { room, checkIn, checkOut } = req.body;
  if (!room || !checkIn || !checkOut)
    return res.status(200).json({ available: true });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    if (SUPABASE_URL && SUPABASE_KEY) {
      const headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      };

      await fetch(`${SUPABASE_URL}/rest/v1/holds?expires_at=lt.${new Date().toISOString()}`,
        { method: "DELETE", headers }).catch(() => {});

      const overlapFilter =
        `room=eq.${encodeURIComponent(room)}` +
        `&check_in=lt.${checkOut}` +
        `&check_out=gt.${checkIn}`;

      const [bookingsRes, holdsRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/bookings?${overlapFilter}&status=eq.active&select=id`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/holds?${overlapFilter}&select=id`, { headers }),
      ]);

      const [bookings, holds] = await Promise.all([bookingsRes.json(), holdsRes.json()]);

      if (bookings.length > 0)
        return res.status(200).json({ available: false, message: `${room} is already booked for those dates. Please choose different dates or another room.` });

      if (holds.length > 0)
        return res.status(200).json({ available: false, message: `${room} is currently being reserved. Please try again in a few minutes or choose a different room.` });
    }

    const airbnbUrl = process.env[`AIRBNB_ICAL_${room.replace(/\s+/g, "_").toUpperCase()}`];
    if (airbnbUrl) {
      try {
        const icalRes = await fetch(airbnbUrl);
        const icalText = await icalRes.text();
        const reqIn = new Date(checkIn);
        const reqOut = new Date(checkOut);
        const lines = icalText.split(/\r?\n/);
        let current = null;
        const events = [];
        for (const line of lines) {
          if (line.startsWith("BEGIN:VEVENT")) current = {};
          else if (line.startsWith("END:VEVENT") && current) { events.push(current); current = null; }
          else if (current && line.startsWith("DTSTART")) {
            const v = line.split(":")[1]?.trim();
            if (v) current.start = new Date(v.slice(0,4)+"-"+v.slice(4,6)+"-"+v.slice(6,8));
          }
          else if (current && line.startsWith("DTEND")) {
            const v = line.split(":")[1]?.trim();
            if (v) current.end = new Date(v.slice(0,4)+"-"+v.slice(4,6)+"-"+v.slice(6,8));
          }
        }
        const conflict = events.find(e => e.start && e.end && reqIn < e.end && reqOut > e.start);
        if (conflict)
          return res.status(200).json({ available: false, message: `${room} is not available for those dates. Please choose different dates.` });
      } catch(e) { console.error("iCal error:", e); }
    }

    res.status(200).json({ available: true });
  } catch(e) {
    console.error("Availability error:", e);
    res.status(200).json({ available: true });
  }
};

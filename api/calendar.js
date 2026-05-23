module.exports = async (req, res) => {
  const { room } = req.query;
  if (!room) return res.status(400).send("Room parameter required");

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  let bookings = [];

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/bookings?room=eq.${encodeURIComponent(room)}&status=eq.active&select=*`,
        { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } }
      );
      bookings = await r.json();
    } catch(e) { console.error("Supabase error:", e); }
  }

  const now = new Date().toISOString().replace(/[-:]/g,"").split(".")[0]+"Z";
  let ical = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Greater Boston Housing//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH",`X-WR-CALNAME:Greater Boston Housing - ${room}`,"X-WR-TIMEZONE:America/New_York"];

  for (const b of bookings) {
    ical.push("BEGIN:VEVENT",`UID:${b.id}@greaterbostonhousing.com`,`DTSTAMP:${now}`,`DTSTART;VALUE=DATE:${b.check_in.replace(/-/g,"")}`,`DTEND;VALUE=DATE:${b.check_out.replace(/-/g,"")}`,`SUMMARY:Reserved - Greater Boston Housing`,`STATUS:CONFIRMED`,"END:VEVENT");
  }

  ical.push("END:VCALENDAR");
  res.setHeader("Content-Type","text/calendar;charset=utf-8");
  res.setHeader("Cache-Control","no-cache");
  res.status(200).send(ical.join("\r\n"));
};

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = (req.headers.authorization || "").replace("Bearer ", "");
  if (auth !== process.env.ADMIN_PASSWORD)
    return res.status(401).json({ error: "Unauthorized" });

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER)
    return res.status(500).json({ error: "Twilio not configured." });

  const { phone, name, room } = req.body;
  if (!phone || !name || !room)
    return res.status(400).json({ error: "Missing phone, name, or room." });

  const roomCodes = {
    "Room 1": "121224",
    "Room 2": "121224",
    "Room 3": "45678#",
    "Room 4": "17395",
    "Room 5": "1590#",
  };

  const roomCode = roomCodes[room] || "Contact (781) 539-2300";

  const message =
    `🏠 Greater Boston Housing\n\n` +
    `Good morning, ${name}!\n` +
    `Today is your check-in day.\n\n` +
    `📍 20 Hadley Pl, Medford, MA 02155\n` +
    `Upstairs apartment — enter from the\n` +
    `front door OR upstairs back door.\n\n` +
    `🚪 Outside front door code: 343470\n` +
    `🔐 Your private room code: ${roomCode}\n\n` +
    `📶 WiFi: TMobile-A500\n` +
    `🔑 Password: aydin1212\n\n` +
    `🕒 Check-in: 3:00 PM\n` +
    `🕙 Check-out: 11:00 AM\n\n` +
    `House rules posted in kitchen.\n\n` +
    `Welcome home! 😊\n` +
    `📞 (781) 539-2300`;

  try {
    const auth64 = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth64}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: process.env.TWILIO_PHONE_NUMBER,
          To: phone,
          Body: message,
        }),
      }
    );
    const data = await r.json();
    if (data.error_code) throw new Error(data.message);
    res.status(200).json({ success: true, sid: data.sid });
  } catch (err) {
    console.error("SMS error:", err);
    res.status(500).json({ error: err.message });
  }
};

const Stripe = require("stripe");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { paymentMethodId, amount, email, name, phone, room, bed, checkIn, checkOut, totalEst } = req.body;

  if (!paymentMethodId || !amount || !email || !name || !room || !checkIn || !checkOut)
    return res.status(400).json({ error: "Missing required booking information." });

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency: "usd",
      payment_method: paymentMethodId,
      confirm: true,
      receipt_email: email,
      description: `Greater Boston Housing — ${room} | ${checkIn} to ${checkOut}`,
      metadata: { name, email, phone: phone||"", room, bed, checkIn, checkOut, totalEst: String(totalEst||0) },
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    });

    if (paymentIntent.status !== "succeeded")
      return res.status(400).json({ error: "Payment was not successful. Please try again." });

    if (process.env.RESEND_API_KEY) {
      const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.RESEND_API_KEY}` };
      fetch("https://api.resend.com/emails", { method: "POST", headers, body: JSON.stringify({ from: "onboarding@resend.dev", to: ["greaterbostonhousing@gmail.com"], subject: `🏠 NEW BOOKING — ${room} | ${name} | ${checkIn}`, html: `<div style="font-family:Arial,sans-serif;padding:20px"><h2 style="color:#C8944A">New Booking!</h2><p><b>Tenant:</b> ${name}</p><p><b>Email:</b> ${email}</p><p><b>Phone:</b> ${phone||"N/A"}</p><p><b>Room:</b> ${room} — ${bed}</p><p><b>Check-in:</b> ${checkIn} at 3:00 PM</p><p><b>Check-out:</b> ${checkOut} at 11:00 AM</p><p><b>Paid:</b> $${Number(amount).toLocaleString()}</p><p><b>Total Est:</b> $${Number(totalEst||0).toLocaleString()}</p><p><b>Payment ID:</b> ${paymentIntent.id}</p><p style="color:orange">⚠️ Check-in SMS auto-sends on ${checkIn} at 8AM with door codes.</p></div>` }) }).catch(e => console.error("Owner email failed:", e));
      fetch("https://api.resend.com/emails", { method: "POST", headers, body: JSON.stringify({ from: "onboarding@resend.dev", to: [email], subject: `Booking Confirmed — ${room} at Greater Boston Housing 🎉`, html: `<div style="font-family:Arial,sans-serif;padding:20px"><h2 style="color:#C8944A">Booking Confirmed! 🎉</h2><p>Hi ${name}!</p><p><b>Room:</b> ${room} — ${bed}</p><p><b>Address:</b> 20 Hadley Pl, Medford, MA 02155 (Upstairs apt)</p><p><b>Check-in:</b> ${checkIn} at 3:00 PM</p><p><b>Check-out:</b> ${checkOut} at 11:00 AM</p><p><b>Paid:</b> $${Number(amount).toLocaleString()}</p><p>On ${checkIn} at 8:00 AM you'll receive a text with your door codes, WiFi password, and entry instructions.</p><p>Questions? Call (781) 539-2300</p></div>` }) }).catch(e => console.error("Guest email failed:", e));
    }

    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      const auth64 = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
      const th = { "Authorization": `Basic ${auth64}`, "Content-Type": "application/x-www-form-urlencoded" };
      const tu = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
      fetch(tu, { method: "POST", headers: th, body: new URLSearchParams({ From: process.env.TWILIO_PHONE_NUMBER, To: "+17815392300", Body: `🏠 NEW BOOKING!\nTenant: ${name}\nPhone: ${phone||"N/A"}\nRoom: ${room}\nCheck-in: ${checkIn}\nCheck-out: ${checkOut}\nPaid: $${Number(amount).toLocaleString()}\n✅ Stripe confirmed` }) }).catch(e => console.error("Owner SMS failed:", e));
      if (phone) fetch(tu, { method: "POST", headers: th, body: new URLSearchParams({ From: process.env.TWILIO_PHONE_NUMBER, To: phone, Body: `Hi ${name}! Booking confirmed at Greater Boston Housing!\nRoom: ${room}\nCheck-in: ${checkIn} at 3PM\nCheck-out: ${checkOut} at 11AM\nPaid: $${Number(amount).toLocaleString()}\nYou'll get door codes by text on ${checkIn} at 8AM.\nQuestions? (781) 539-2300` }) }).catch(e => console.error("Guest SMS failed:", e));
    }

    res.status(200).json({ success: true, paymentIntentId: paymentIntent.id });

  } catch (err) {
    const msg = err.code === "card_declined" ? "Your card was declined. Please try a different card." : err.code === "insufficient_funds" ? "Insufficient funds. Please try a different card." : err.code === "incorrect_cvc" ? "Incorrect security code." : err.code === "expired_card" ? "Your card has expired." : err.message || "Payment failed. Please try again.";
    res.status(400).json({ error: msg });
  }
};

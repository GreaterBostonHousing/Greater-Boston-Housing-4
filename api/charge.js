const Stripe = require("stripe");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { paymentMethodId, amount, email, name, phone, room, bed, checkIn, checkOut, totalEst, sessionId, isShort } = req.body;

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

    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      const sbHeaders = { "Content-Type": "application/json", "apikey": process.env.SUPABASE_ANON_KEY, "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY}`, "Prefer": "return=representation" };
      fetch(`${process.env.SUPABASE_URL}/rest/v1/bookings`, { method: "POST", headers: sbHeaders, body: JSON.stringify({ name, email, phone: phone||"", room, bed, check_in: checkIn, check_out: checkOut, amount_paid: Number(amount), total_estimated: Number(totalEst||0), payment_id: paymentIntent.id, status: "active" }) }).catch(e => console.error("Supabase save failed:", e));
      if (sessionId) fetch(`${process.env.SUPABASE_URL}/rest/v1/holds?session_id=eq.${sessionId}`, { method: "DELETE", headers: sbHeaders }).catch(() => {});
    }

    const leaseHtml = `
      <div style="background:#f9f9f9;border:2px solid #C8944A;border-radius:8px;padding:20px;margin:20px 0">
        <h2 style="color:#C8944A;margin-top:0">SIGNED LEASE AGREEMENT</h2>
        <p><b>Date Signed:</b> ${new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
        <p><b>Tenant:</b> ${name} | <b>Email:</b> ${email} | <b>Phone:</b> ${phone||"N/A"}</p>
        <p><b>Property:</b> 20 Hadley Pl, Medford, MA 02155 (Upstairs Apartment)</p>
        <p><b>Room:</b> ${room} — ${bed}</p>
        <p><b>Check-in:</b> ${checkIn} at 3:00 PM | <b>Check-out:</b> ${checkOut} at 11:00 AM</p>
        <p><b>Paid Today:</b> $${Number(amount).toLocaleString()} | <b>Total Est:</b> $${Number(totalEst||0).toLocaleString()}</p>
        <hr style="border:1px solid #ddd;margin:12px 0"/>
        <p><b>1. USE:</b> Residential only. Common areas shared.</p>
        <p><b>2. RENT:</b> $1,400/month due 1st. Failure to pay by the 5th forfeits right to property. $50 late fee applies.</p>
        <p><b>3. CHECK-IN/OUT:</b> Check-in 3:00 PM. Check-out 11:00 AM.</p>
        <p><b>4. ENTRY:</b> Upstairs apartment at 20 Hadley Pl. Enter via front door or upstairs back door.</p>
        <p><b>5. RULES:</b> No smoking. No pets without approval. Quiet hours 10pm-8am. Must wash own dishes. Keep shared spaces clean.</p>
        <p><b>6. UTILITIES:</b> Electric, heat, water, WiFi (TMobile-A500) included.</p>
        <p><b>7. DEPOSIT:</b> $700 at signing. Returned at end of stay barring damages.</p>
        <p><b>8. ACCESS CODES:</b> Outside door code + private room code provided. Must not be shared.</p>
        <p><b>9. CHECK-IN SMS:</b> Codes + WiFi sent by text at 8 AM on check-in date.</p>
        <p><b>10. TERMINATION:</b> 30 days written notice. Failure to pay by 5th = grounds for immediate removal.</p>
        <p><b>11. LANDLORD ACCESS:</b> Landlord may enter with 24-hour notice.</p>
        <hr style="border:1px solid #ddd;margin:12px 0"/>
        <p style="color:green;font-weight:bold">✅ Digitally signed by ${name} on ${new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})} at time of payment.</p>
        <p style="font-size:12px;color:#888">Payment ID: ${paymentIntent.id}</p>
      </div>`;

    if (process.env.RESEND_API_KEY) {
      const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.RESEND_API_KEY}` };
      fetch("https://api.resend.com/emails", { method: "POST", headers, body: JSON.stringify({ from: "onboarding@resend.dev", to: ["greaterbostonhousing@gmail.com"], subject: `🏠 NEW BOOKING + LEASE — ${room} | ${name} | ${checkIn}`, html: `<div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;padding:20px"><h2 style="color:#C8944A">New Booking!</h2><p><b>Tenant:</b> ${name}</p><p><b>Email:</b> ${email}</p><p><b>Phone:</b> ${phone||"N/A"}</p><p><b>Room:</b> ${room} — ${bed}</p><p><b>Check-in:</b> ${checkIn} at 3:00 PM</p><p><b>Check-out:</b> ${checkOut} at 11:00 AM</p><p><b>Paid:</b> $${Number(amount).toLocaleString()}</p><p><b>Total Est:</b> $${Number(totalEst||0).toLocaleString()}</p><div style="background:#fff3cd;border:2px solid #ffc107;border-radius:8px;padding:12px;margin:16px 0"><b>⚠️ Check-in SMS auto-sends on ${checkIn} at 8AM.</b></div>${leaseHtml}<a href="https://dashboard.stripe.com/payments/${paymentIntent.id}" style="display:inline-block;background:#C8944A;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">View in Stripe →</a></div>` }) }).catch(e => console.error("Owner email failed:", e));
      fetch("https://api.resend.com/emails", { method: "POST", headers, body: JSON.stringify({ from: "onboarding@resend.dev", to: [email], subject: `Booking Confirmed — ${room} at Greater Boston Housing 🎉`, html: `<div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto"><div style="background:linear-gradient(135deg,#1a1208,#C8944A);padding:30px;text-align:center;border-radius:12px 12px 0 0"><h1 style="color:white;margin:0">Booking Confirmed! 🎉</h1></div><div style="padding:28px;background:#f9f9f9;border-radius:0 0 12px 12px"><p>Hi <b>${name}</b>! Your room is officially booked.</p><p><b>Room:</b> ${room} — ${bed}</p><p><b>Address:</b> 20 Hadley Pl, Medford, MA 02155 (Upstairs apt)</p><p><b>Check-in:</b> ${checkIn} at 3:00 PM</p><p><b>Check-out:</b> ${checkOut} at 11:00 AM</p><p><b>Paid:</b> $${Number(amount).toLocaleString()}</p><div style="background:#fff8f0;border-left:4px solid #C8944A;padding:16px;margin:16px 0"><b>📱 On ${checkIn} at 8:00 AM</b> you'll receive a text with your door codes, WiFi password, and entry instructions.</div>${leaseHtml}<p>Questions? <a href="tel:7815392300">(781) 539-2300</a></p></div></div>` }) }).catch(e => console.error("Guest email failed:", e));
    }

    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      const auth64 = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
      const th = { "Authorization": `Basic ${auth64}`, "Content-Type": "application/x-www-form-urlencoded" };
      const tu = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
      fetch(tu, { method: "POST", headers: th, body: new URLSearchParams({ From: process.env.TWILIO_PHONE_NUMBER, To: "+17815392300", Body: `🏠 NEW BOOKING!\nTenant: ${name}\nPhone: ${phone||"N/A"}\nRoom: ${room}\nCheck-in: ${checkIn}\nCheck-out: ${checkOut}\nPaid: $${Number(amount).toLocaleString()}\nTotal Est: $${Number(totalEst||0).toLocaleString()}\n✅ Stripe confirmed. Lease signed.` }) }).catch(e => console.error("Owner SMS failed:", e));
      if (phone) fetch(tu, { method: "POST", headers: th, body: new URLSearchParams({ From: process.env.TWILIO_PHONE_NUMBER, To: phone, Body: `Hi ${name}! Booking confirmed at Greater Boston Housing!\nRoom: ${room}\nCheck-in: ${checkIn} at 3PM\nCheck-out: ${checkOut} at 11AM\nPaid: $${Number(amount).toLocaleString()}\nDoor codes sent ${checkIn} at 8AM.\nQuestions? (781) 539-2300` }) }).catch(e => console.error("Guest SMS failed:", e));
    }

    res.status(200).json({ success: true, paymentIntentId: paymentIntent.id });

  } catch (err) {
    const msg = err.code === "card_declined" ? "Your card was declined. Please try a different card." : err.code === "insufficient_funds" ? "Insufficient funds. Please try a different card." : err.code === "incorrect_cvc" ? "Incorrect security code." : err.code === "expired_card" ? "Your card has expired." : err.message || "Payment failed. Please try again.";
    res.status(400).json({ error: msg });
  }
};

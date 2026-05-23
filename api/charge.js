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
        <h2 style="color:#C8944A;margin-top:0">GREATER BOSTON HOUSING — SIGNED LEASE AGREEMENT</h2>
        <p><b>Date Signed:</b> ${new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
        <p><b>Tenant:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Phone:</b> ${phone||"Not provided"}</p>
        <p><b>Property:</b> 20 Hadley Pl, Medford, MA 02155 (Upstairs Apartment)</p>
        <p><b>Room:</b> ${room} — ${bed}</p>
        <p><b>Check-in:</b> ${checkIn} at 3:00 PM</p>
        <p><b>Check-out:</b> ${checkOut} at 11:00 AM</p>
        <p><b>Amount Paid Today:</b> $${Number(amount).toLocaleString()}</p>
        <p><b>Total Estimated:</b> $${Number(totalEst||0).toLocaleString()}</p>
        <p><b>Payment:</b> ${isShort ? `Full payment of $${Number(amount).toLocaleString()} due at signing.` : `$${Number(amount).toLocaleString()} due at signing ($700 deposit + prorated first month). Then $1,400 on the 1st of each month.`}</p>
        <hr style="border:1px solid #ddd;margin:16px 0"/>
        <h3 style="color:#333">Agreed Terms:</h3>
        <p><b>1. USE:</b> Residential only. Common areas shared with other tenants.</p>
        <p><b>2. RENT:</b> ${isShort ? "$1,400/month. Full payment collected at signing." : "$1,400/month due on the 1st. If payment is not received by the 5th, tenant forfeits their right to occupy the property and landlord may request immediate vacating. $50 late fee also applies."}</p>
        <p><b>3. CHECK-IN/OUT:</b> Check-in at 3:00 PM on move-in date. Check-out at 11:00 AM on move-out date.</p>
        <p><b>4. ENTRY:</b> Property is in the upstairs apartment. Tenant may enter through the front door or the upstairs back door.</p>
        <p><b>5. RULES:</b> No smoking. No pets without written approval. Quiet hours 10pm–8am. Tenants must wash their own dishes and keep all shared spaces clean at all times.</p>
        <p><b>6. UTILITIES:</b> Electric, heat, water, and WiFi (TMobile-A500) included in rent.</p>
        <p><b>7. DEPOSIT:</b> $700 required at signing. Returned at end of stay barring damages.</p>
        <p><b>8. ACCESS CODES:</b> Tenant receives one outside door code and one private room code. Both must not be shared.</p>
        <p><b>9. CHECK-IN SMS:</b> Both codes, full address, and WiFi details sent via text at 8 AM on check-in date.</p>
        <p><b>10. TERMINATION:</b> ${isShort ? "Stay ends on the agreed check-out date. No early refunds." : "30 days written notice from either party. Failure to pay by the 5th is grounds for immediate removal."}</p>
        <p><b>11. LANDLORD ACCESS:</b> Landlord may enter with 24-hour notice.</p>
        <hr style="border:1px solid #ddd;margin:16px 0"/>
        <p style="color:green;font-weight:bold">✅ Digitally signed by ${name} on ${new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})} at time of payment.</p>
        <p><b>Payment ID:</b> ${paymentIntent.id}</p>
      </div>
    `;

    if (process.env.RESEND_API_KEY) {
      const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.RESEND_API_KEY}` };
      fetch("https://api.resend.com/emails", { method: "POST", headers, body: JSON.stringify({ from: "bookings@greaterbostonhousing.com", to: ["greaterbostonhousing@gmail.com"], subject: `🏠 NEW BOOKING + LEASE — ${room} | ${name} | ${checkIn}`, html: `<div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;padding:20px"><h2 style="color:#C8944A;border-bottom:2px solid #C8944A;padding-bottom:10px">New Booking Received!</h2><table style="width:100%;border-collapse:collapse;margin-bottom:20px"><tr><td style="padding:10px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9">Tenant</td><td style="padding:10px;border:1px solid #ddd">${name}</td></tr><tr><td style="padding:10px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9">Email</td><td style="padding:10px;border:1px solid #ddd"><a href="mailto:${email}">${email}</a></td></tr><tr><td style="padding:10px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9">Phone</td><td style="padding:10px;border:1px solid #ddd"><a href="tel:${phone||''}">${phone||"Not provided"}</a></td></tr><tr><td style="padding:10px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9">Room</td><td style="padding:10px;border:1px solid #ddd"><strong>${room} — ${bed}</strong></td></tr><tr><td style="padding:10px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9">Check-in</td><td style="padding:10px;border:1px solid #ddd"><strong>${checkIn} at 3:00 PM</strong></td></tr><tr><td style="padding:10px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9">Check-out</td><td style="padding:10px;border:1px solid #ddd"><strong>${checkOut} at 11:00 AM</strong></td></tr><tr><td style="padding:10px;border:1px solid #ddd;font-weight:bold;background:#e8f5e9">Paid Today</td><td style="padding:10px;border:1px solid #ddd;color:green;font-size:20px;font-weight:bold">$${Number(amount).toLocaleString()}</td></tr><tr><td style="padding:10px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9">Total Est.</td><td style="padding:10px;border:1px solid #ddd">$${Number(totalEst||0).toLocaleString()}</td></tr></table><div style="background:#fff3cd;border:2px solid #ffc107;border-radius:8px;padding:16px;margin-bottom:20px"><strong>⚠️ Check-in SMS auto-sends to ${phone||"guest"} on ${checkIn} at 8:00 AM with door codes.</strong></div>${leaseHtml}<a href="https://dashboard.stripe.com/payments/${paymentIntent.id}" style="display:inline-block;background:#C8944A;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">View in Stripe →</a></div>` }) }).catch(e => console.error("Owner email failed:", e));
      fetch("https://api.resend.com/emails", { method: "POST", headers, body: JSON.stringify({ from: "bookings@greaterbostonhousing.com", to: [email], subject: `Booking Confirmed — ${room} at Greater Boston Housing 🎉`, html: `<div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto"><div style="background:linear-gradient(135deg,#1a1208,#C8944A);padding:30px;text-align:center;border-radius:12px 12px 0 0"><h1 style="color:white;margin:0;font-size:28px">Booking Confirmed! 🎉</h1><p style="color:rgba(255,255,255,0.85);margin:8px 0 0">Greater Boston Housing</p></div><div style="background:#f9f9f9;padding:28px;border-radius:0 0 12px 12px"><p style="font-size:16px;color:#333;margin-top:0">Hi <strong>${name}</strong>, your room is officially booked!</p><table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;margin:16px 0"><tr style="background:#12100d;color:white"><td colspan="2" style="padding:14px 16px;font-weight:bold">📋 Booking Details</td></tr><tr><td style="padding:11px 16px;border-bottom:1px solid #eee;font-weight:bold;color:#555;width:140px">Room</td><td style="padding:11px 16px;border-bottom:1px solid #eee"><strong>${room} — ${bed}</strong></td></tr><tr><td style="padding:11px 16px;border-bottom:1px solid #eee;font-weight:bold;color:#555">Address</td><td style="padding:11px 16px;border-bottom:1px solid #eee">20 Hadley Pl, Medford, MA 02155<br><small>Upstairs apartment</small></td></tr><tr><td style="padding:11px 16px;border-bottom:1px solid #eee;font-weight:bold;color:#555">Check-in</td><td style="padding:11px 16px;border-bottom:1px solid #eee"><strong style="color:#C8944A">${checkIn} at 3:00 PM</strong></td></tr><tr><td style="padding:11px 16px;border-bottom:1px solid #eee;font-weight:bold;color:#555">Check-out</td><td style="padding:11px 16px;border-bottom:1px solid #eee"><strong style="color:#C8944A">${checkOut} at 11:00 AM</strong></td></tr><tr style="background:#f0f8f0"><td style="padding:11px 16px;font-weight:bold;color:#555">Paid Today</td><td style="padding:11px 16px;color:green;font-weight:bold;font-size:18px">$${Number(amount).toLocaleString()}</td></tr></table><div style="background:#fff8f0;border-left:4px solid #C8944A;padding:18px;border-radius:0 8px 8px 0;margin:20px 0"><h3 style="margin:0 0 10px;color:#C8944A">📱 Your Check-in Text</h3><p style="margin:0;color:#555">On <strong>${checkIn} at 8:00 AM</strong> you'll receive a text with your door codes, WiFi password, and entry instructions.</p></div>${leaseHtml}<div style="text-align:center;margin-top:24px"><a href="tel:7815392300" style="display:inline-block;background:#C8944A;color:white;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;margin:4px">📞 (781) 539-2300</a><a href="mailto:greaterbostonhousing@gmail.com" style="display:inline-block;background:#12100d;color:white;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;margin:4px">✉️ Email Us</a></div></div></div>` }) }).catch(e => console.error("Guest email failed:", e));
    }

    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      const auth64 = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
      const th = { "Authorization": `Basic ${auth64}`, "Content-Type": "application/x-www-form-urlencoded" };
      const tu = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
      fetch(tu, { method: "POST", headers: th, body: new URLSearchParams({ From: process.env.TWILIO_PHONE_NUMBER, To: "+17815392300", Body: `🏠 NEW BOOKING!\nTenant: ${name}\nPhone: ${phone||"N/A"}\nRoom: ${room}\nCheck-in: ${checkIn}\nCheck-out: ${checkOut}\nPaid: $${Number(amount).toLocaleString()}\nTotal Est: $${Number(totalEst||0).toLocaleString()}\n✅ Stripe confirmed\nLease signed digitally.` }) }).catch(e => console.error("Owner SMS failed:", e));
      if (phone) fetch(tu, { method: "POST", headers: th, body: new URLSearchParams({ From: process.env.TWILIO_PHONE_NUMBER, To: phone, Body: `Hi ${name}! Booking confirmed at Greater Boston Housing!\nRoom: ${room}\nCheck-in: ${checkIn} at 3PM\nCheck-out: ${checkOut} at 11AM\nPaid: $${Number(amount).toLocaleString()}\nYou'll get door codes by text on ${checkIn} at 8AM.\nQuestions? (781) 539-2300` }) }).catch(e => console.error("Guest SMS failed:", e));
    }

    res.status(200).json({ success: true, paymentIntentId: paymentIntent.id });

  } catch (err) {
    const msg = err.code === "card_declined" ? "Your card was declined. Please try a different card." : err.code === "insufficient_funds" ? "Insufficient funds. Please try a different card." : err.code === "incorrect_cvc" ? "Incorrect security code." : err.code === "expired_card" ? "Your card has expired." : err.message || "Payment failed. Please try again.";
    res.status(400).json({ error: msg });
  }
};

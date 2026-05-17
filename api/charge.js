const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { paymentMethodId, amount, email, name, room, checkIn, checkOut } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Stripe uses cents
      currency: 'usd',
      payment_method: paymentMethodId,
      confirm: true,
      receipt_email: email,
      description: `Greater Boston Housing — ${room} | ${checkIn} to ${checkOut}`,
      metadata: { name, email, room, checkIn, checkOut },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
    });

    res.status(200).json({ success: true, paymentIntentId: paymentIntent.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

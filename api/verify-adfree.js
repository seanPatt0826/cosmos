// Confirms a "remove ads" payment with Stripe before the page drops its ads.
//
// The page sends people to a Stripe Payment Link. When they have paid, Stripe
// sends them back to the site with ?adfree_session=<Checkout Session id>.
// The page asks this function whether that session was really paid; only a
// "yes" from Stripe removes the ads. Without this, typing the return address
// by hand would be enough to skip the payment.
//
// Needs one setting in Vercel (Project → Settings → Environment Variables):
//   STRIPE_SECRET_KEY   the secret key from the Stripe dashboard (sk_live_…)
// It never reaches the browser; only this function reads it.

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const id = String((req.query && req.query.session) || '');
  const key = process.env.STRIPE_SECRET_KEY;
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(id) || !key) {
    res.status(200).json({ paid: false });
    return;
  }
  try {
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) {
      res.status(200).json({ paid: false });
      return;
    }
    const session = await r.json();
    res.status(200).json({ paid: session.payment_status === 'paid' });
  } catch (e) {
    res.status(200).json({ paid: false });
  }
};

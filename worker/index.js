// The Cloudflare Worker behind the site.
//
// Every file of the site itself (index.html, src/, assets/, …) is served by
// Cloudflare straight from the uploaded static assets; this script never sees
// those requests. It only runs for addresses that are not a file:
//
//   /api/verify-adfree     the "remove ads" payment check, below
//   /api/dock/<ROOM>       a Shuttle Docking room's WebSocket, handed to that
//                          room's Durable Object (worker/dock-room.js)
//
// The page sends people to a Stripe Payment Link. When they have paid, Stripe
// sends them back to the site with ?adfree_session=<Checkout Session id>.
// The page asks this function whether that session was really paid; only a
// "yes" from Stripe removes the ads. Without this, typing the return address
// by hand would be enough to skip the payment.
//
// Needs one secret, set once from the cosmos folder:
//   npx wrangler@4.146.0 secret put STRIPE_SECRET_KEY
// (the secret key from the Stripe dashboard, sk_live_…). It never reaches the
// browser; only this function reads it.

export { DockRoom } from './dock-room.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/verify-adfree') return verifyAdFree(url, env);
    const dock = url.pathname.match(/^\/api\/dock\/([A-Za-z0-9]{3,8})$/);
    if (dock) {
      // Room codes are case-blind: "abcd" and "ABCD" are the same room.
      const room = env.DOCK.get(env.DOCK.idFromName(dock[1].toUpperCase()));
      return room.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

async function verifyAdFree(url, env) {
  const id = url.searchParams.get('session') || '';
  const key = env.STRIPE_SECRET_KEY;
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(id) || !key) return answer(false);
  try {
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return answer(false);
    const session = await r.json();
    return answer(session.payment_status === 'paid');
  } catch (e) {
    return answer(false);
  }
}

function answer(paid) {
  return new Response(JSON.stringify({ paid }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

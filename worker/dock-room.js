// One Shuttle Docking room, as a Cloudflare Durable Object.
//
// Every room code maps to exactly one of these, wherever its players are, so
// it is the single authority for that room: it runs the referee
// (src/dock/game.js) and tells every browser what happened. A Durable Object
// handles one event at a time, which is what makes a shuttle claim atomic.
//
// Players talk to it over one WebSocket each. Messages are small JSON objects:
//
//   from a browser   {t:'join', name} {t:'input', i:{up,down,...}}
//                    {t:'settings', s:{...}} {t:'start', practice?} {t:'again'}
//                    {t:'ping', c}
//   to a browser     {t:'hello', id} {t:'state', ...snapshot, events}
//                    {t:'error', code} {t:'pong', c, now}
//
// The room ticks only while someone is connected, and forgets everything once
// the last player goes; nothing is stored.

import { DockGame } from '../src/dock/game.js';
import { DOCK } from '../src/dock/sim.js';

export class DockRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.game = new DockGame();
    this.sockets = new Map();
    this.loop = null;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const id = crypto.randomUUID().slice(0, 8);
    this.sockets.set(id, server);

    server.addEventListener('message', (e) => this.onMessage(id, server, e.data));
    const gone = () => this.onClose(id);
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);

    send(server, { t: 'hello', id });
    return new Response(null, { status: 101, webSocket: client });
  }

  onMessage(id, ws, data) {
    let m;
    try {
      m = JSON.parse(data);
    } catch (e) {
      return;
    }
    if (!m || typeof m !== 'object') return;
    const g = this.game;
    const joined = g.players.has(id);
    // Lets a browser measure its round trip, to keep its own ship in step.
    if (m.t === 'ping') {
      send(ws, { t: 'pong', c: m.c, now: g.now() });
      return;
    }

    if (m.t === 'join' && !joined) {
      const r = g.join(id, m.name);
      if (r.error) {
        send(ws, { t: 'error', code: r.error });
        ws.close(1000, r.error);
        return;
      }
      this.run();
      return;
    }
    if (!joined) return;
    if (m.t === 'input') g.setInput(id, m.i);
    else if (m.t === 'settings') g.setSettings(id, m.s);
    else if (m.t === 'start') {
      const r = g.start(id, { practice: m.practice === true });
      if (r.error) send(ws, { t: 'error', code: r.error });
    } else if (m.t === 'again') g.again(id);
  }

  onClose(id) {
    if (!this.sockets.has(id)) return;
    this.sockets.delete(id);
    this.game.leave(id);
    if (this.sockets.size === 0) {
      clearInterval(this.loop);
      this.loop = null;
      // A fresh room for whoever comes next.
      this.game = new DockGame();
    }
  }

  run() {
    if (this.loop) return;
    this.loop = setInterval(() => this.step(), DOCK.tickMs);
  }

  step() {
    const events = this.game.tick();
    const msg = JSON.stringify({ t: 'state', ...this.game.snapshot(), events });
    for (const [id, ws] of this.sockets) {
      try {
        ws.send(msg);
      } catch (e) {
        this.onClose(id);
      }
    }
  }
}

function send(ws, m) {
  try {
    ws.send(JSON.stringify(m));
  } catch (e) {
    /* The socket closed under us; its close handler tidies up. */
  }
}

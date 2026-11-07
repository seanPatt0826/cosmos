// The result card: what the race decided, and ways to pass it on.
//
// Shown a moment after a race ends and kept until the next one starts (or it
// is closed), because the arena itself moves on: the field lines up again for
// another go. What it says follows the purpose chosen before the race
// (purpose.js): the one name picked, the penalty, the full order, or two
// teams.
//
// Two buttons:
//   Share  draws a square picture of the finish with the result written on
//          it and hands it to the phone's share sheet (KakaoTalk, Instagram,
//          ...). Where the browser cannot share files, it downloads the
//          picture instead.
//   Copy   puts the result on the clipboard as plain text, ready to paste
//          into a chat.
// Both end with the site's address, so every result passed on brings
// someone back.

import { t } from './i18n.js';
import { getPurpose, finishOrder, teamsOf, verdict } from './purpose.js';

const SITE = 'cosmosroulette.com';
const SIZE = 1080;

export function createResult() {
  const el = {
    card: document.getElementById('result-card'),
    title: document.getElementById('rc-title'),
    body: document.getElementById('rc-body'),
    share: document.getElementById('rc-share'),
    copy: document.getElementById('rc-copy'),
    close: document.getElementById('rc-close'),
    note: document.getElementById('rc-note'),
  };
  if (!el.card) return { show() {}, hide() {}, isOpen: () => false };

  let current = null; // { purpose, universe, verdict, order, teams, shot }

  // ── What to say ────────────────────────────────────────────────────────

  const nameOf = (p) => p.name || p.label;

  function headline(r) {
    if (r.purpose === 'teams') return t('The teams are made!');
    if (r.purpose === 'order') return t('Turn order');
    if (r.verdict.kind === 'penalty') return t('{name} gets the penalty!', { name: r.verdict.name });
    if (r.verdict.kind === 'last') return t('{name} is last!', { name: r.verdict.name });
    return t('{name} wins!', { name: r.verdict.name });
  }

  // The result as lines of plain text: the card, the copy, and the picture
  // all say the same thing.
  function lines(r) {
    if (r.purpose === 'teams') {
      return [
        `${t('Team A')}: ${r.teams[0].map(nameOf).join(', ')}`,
        `${t('Team B')}: ${r.teams[1].map(nameOf).join(', ')}`,
      ];
    }
    if (r.purpose === 'order') return r.order.map((p, i) => `${i + 1}. ${nameOf(p)}`);
    return [];
  }

  function icon(r) {
    if (r.purpose === 'teams') return '👥';
    if (r.purpose === 'order') return '🔢';
    if (r.verdict.kind === 'penalty') return '😈';
    if (r.verdict.kind === 'last') return '🐢';
    return '🏆';
  }

  function asText(r) {
    return [
      `${icon(r)} ${headline(r)}`,
      ...lines(r),
      '',
      `${t('Cosmos')} · ${r.universe} — ${SITE}`,
    ].join('\n');
  }

  // ── The card ───────────────────────────────────────────────────────────

  function paint() {
    if (!current) return;
    el.title.textContent = `${icon(current)} ${headline(current)}`;
    const ls = lines(current);
    el.body.innerHTML = '';
    if (current.purpose === 'order') {
      const ol = document.createElement('ol');
      for (const p of current.order) {
        const li = document.createElement('li');
        li.textContent = nameOf(p);
        ol.appendChild(li);
      }
      el.body.appendChild(ol);
    } else if (ls.length) {
      for (const l of ls) {
        const p = document.createElement('p');
        p.textContent = l;
        el.body.appendChild(p);
      }
    }
    el.body.hidden = !el.body.childNodes.length;
    el.share.textContent = t('Share result');
    el.copy.textContent = t('Copy result');
    el.close.setAttribute('aria-label', t('Close'));
    el.note.textContent = '';
  }

  function show(round, shot) {
    current = {
      purpose: getPurpose(),
      universe: t(round.mapDef.name),
      verdict: verdict(round),
      order: finishOrder(round),
      teams: teamsOf(finishOrder(round)),
      shot,
    };
    paint();
    el.card.hidden = false;
  }

  function hide() {
    el.card.hidden = true;
  }

  // ── The picture ────────────────────────────────────────────────────────

  // Square, because that is what every chat and feed shows whole: the finish
  // filling the frame, darkened at the bottom where the result is written.
  function picture(r) {
    const c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    const g = c.getContext('2d');
    g.fillStyle = '#07060F';
    g.fillRect(0, 0, SIZE, SIZE);
    if (r.shot) {
      // Cover the square with the middle of the snapshot.
      const s = r.shot;
      const k = Math.max(SIZE / s.width, SIZE / s.height);
      const w = s.width * k;
      const h = s.height * k;
      g.drawImage(s, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
    }
    const ls = lines(r);
    const listH = Math.min(ls.length, 10) * 46;
    const panelTop = SIZE - 300 - listH;
    const grad = g.createLinearGradient(0, panelTop - 160, 0, SIZE);
    grad.addColorStop(0, 'rgba(7, 6, 15, 0)');
    grad.addColorStop(0.35, 'rgba(7, 6, 15, 0.82)');
    grad.addColorStop(1, 'rgba(7, 6, 15, 0.95)');
    g.fillStyle = grad;
    g.fillRect(0, panelTop - 160, SIZE, SIZE - panelTop + 160);

    const font = '"Gaegu", "Shantell Sans", "Comic Sans MS", cursive';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = r.verdict.kind === 'penalty' || r.verdict.kind === 'last' ? '#F08A7A' : '#E8A33D';
    fitText(g, `${icon(r)} ${headline(r)}`, SIZE / 2, panelTop + 40, SIZE - 120, 92, font);

    g.fillStyle = '#F2EADB';
    let y = panelTop + 120;
    for (const l of ls.slice(0, 10)) {
      fitText(g, l, SIZE / 2, y, SIZE - 140, 40, font);
      y += 46;
    }
    if (ls.length > 10) {
      g.fillStyle = 'rgba(242, 234, 219, 0.7)';
      fitText(g, t('+{n} more', { n: ls.length - 10 }), SIZE / 2, y, SIZE - 140, 34, font);
    }

    g.fillStyle = 'rgba(242, 234, 219, 0.78)';
    fitText(g, `${t('Cosmos')} · ${r.universe}`, SIZE / 2, SIZE - 92, SIZE - 140, 36, font);
    g.fillStyle = '#E8A33D';
    fitText(g, SITE, SIZE / 2, SIZE - 44, SIZE - 140, 34, '"Shantell Sans", "Comic Sans MS", cursive');
    return c;
  }

  // Writes text at the biggest size up to `size` that fits `maxW`.
  function fitText(g, text, x, y, maxW, size, font) {
    let s = size;
    g.font = `700 ${s}px ${font}`;
    while (s > 16 && g.measureText(text).width > maxW) {
      s -= 2;
      g.font = `700 ${s}px ${font}`;
    }
    g.fillText(text, x, y);
  }

  // ── Buttons ────────────────────────────────────────────────────────────

  function note(text) {
    el.note.textContent = text;
  }

  el.share.addEventListener('click', async () => {
    if (!current) return;
    const canvas = picture(current);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) return;
    const file = new File([blob], 'cosmos-result.png', { type: 'image/png' });
    const text = asText(current);
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text, url: `https://${SITE}/` });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // closed the share sheet
    }
    // No file sharing here (most computers): save the picture instead.
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cosmos-result.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    note(t('Picture saved. Send it to your friends!'));
  });

  el.copy.addEventListener('click', async () => {
    if (!current) return;
    const text = asText(current);
    try {
      await navigator.clipboard.writeText(text);
      note(t('Copied. Paste it into a chat!'));
    } catch (e) {
      window.prompt(t('Copy result'), text);
    }
  });

  el.close.addEventListener('click', hide);

  return {
    show,
    hide,
    repaint: paint,
    isOpen: () => !el.card.hidden,
    // For tests.
    _text: () => (current ? asText(current) : ''),
  };
}

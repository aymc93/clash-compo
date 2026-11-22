// Image de la compo (PNG) : les 5 splash arts, les rôles, les champions et les joueurs.
import { ROLES, ROLE_LABEL, champ, loadingUrl } from './data.js';

const W = 1600;
const H = 900;
const COL_W = 270;
const GAP = 24;
const ART_H = 490;

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxW) {
  let t = String(text);
  while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -1);
  return t === String(text) ? t : `${t.slice(0, -1)}…`;
}

/**
 * slots : { role: { champ, name, color } } ; title ; subtitle (ex. note) ; rating
 * → Blob PNG
 */
export async function compImage({ slots, title, subtitle = '', rating = null }) {
  try { await document.fonts.ready; } catch { /* polices système */ }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Fond
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b1222');
  bg.addColorStop(1, '#05080f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.15, 0, 0, W * 0.15, 0, 700);
  glow.addColorStop(0, 'rgba(216,180,106,0.18)');
  glow.addColorStop(1, 'rgba(216,180,106,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Titre
  ctx.fillStyle = '#f3dfa6';
  ctx.font = '700 46px "Chakra Petch", system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitText(ctx, title, W - 380), 64, 96);
  if (subtitle) {
    ctx.fillStyle = '#aab5c8';
    ctx.font = '500 24px Inter, system-ui, sans-serif';
    ctx.fillText(fitText(ctx, subtitle, W - 380), 64, 136);
  }
  if (rating != null) {
    ctx.textAlign = 'right';
    ctx.fillStyle = rating >= 88 ? '#ffb547' : rating >= 75 ? '#3ddc97' : '#5aa9ff';
    ctx.font = '700 84px "Chakra Petch", system-ui, sans-serif';
    ctx.fillText(String(rating), W - 120, 110);
    ctx.fillStyle = '#6e7c95';
    ctx.font = '600 28px "Chakra Petch", system-ui, sans-serif';
    ctx.fillText('/100', W - 60, 110);
    ctx.textAlign = 'left';
  }

  // Cartes
  const startX = (W - (5 * COL_W + 4 * GAP)) / 2;
  const top = 190;
  const imgs = await Promise.all(ROLES.map((r) => (slots[r] ? loadImage(loadingUrl(slots[r].champ)) : null)));
  ROLES.forEach((role, i) => {
    const s = slots[role];
    const x = startX + i * (COL_W + GAP);
    ctx.save();
    roundRect(ctx, x, top, COL_W, ART_H, 18);
    ctx.clip();
    ctx.fillStyle = '#17233d';
    ctx.fillRect(x, top, COL_W, ART_H);
    const img = imgs[i];
    if (img) {
      const scale = Math.max(COL_W / img.width, ART_H / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, x + (COL_W - w) / 2, top + (ART_H - h) * 0.2, w, h);
    }
    const shade = ctx.createLinearGradient(0, top + ART_H * 0.45, 0, top + ART_H);
    shade.addColorStop(0, 'rgba(6,10,19,0)');
    shade.addColorStop(1, 'rgba(6,10,19,0.95)');
    ctx.fillStyle = shade;
    ctx.fillRect(x, top, COL_W, ART_H);
    ctx.fillStyle = s?.color || '#d8b46a';
    ctx.fillRect(x, top + ART_H - 6, COL_W, 6);
    ctx.restore();

    // Rôle
    ctx.fillStyle = 'rgba(6,10,19,0.7)';
    roundRect(ctx, x + 14, top + 14, 118, 34, 9);
    ctx.fill();
    ctx.fillStyle = '#f3dfa6';
    ctx.font = '600 18px "Chakra Petch", system-ui, sans-serif';
    ctx.fillText(ROLE_LABEL[role].toUpperCase(), x + 28, top + 38);

    if (!s) return;
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 32px "Chakra Petch", system-ui, sans-serif';
    ctx.fillText(fitText(ctx, champ(s.champ).name.toUpperCase(), COL_W - 32), x + 16, top + ART_H - 58);
    ctx.fillStyle = s.color || '#e6ebf4';
    ctx.beginPath();
    ctx.arc(x + 24, top + ART_H - 29, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e6ebf4';
    ctx.font = '600 22px Inter, system-ui, sans-serif';
    ctx.fillText(fitText(ctx, s.name || '', COL_W - 56), x + 38, top + ART_H - 21);
  });

  // Pied
  ctx.fillStyle = '#6e7c95';
  ctx.font = '500 20px Inter, system-ui, sans-serif';
  ctx.fillText('Clash Compo', 64, H - 48);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('image'))), 'image/png'));
}

/** Copie l'image dans le presse-papiers si possible, sinon la télécharge. → 'copied' | 'downloaded' */
export async function shareImage(blob, filename = 'compo.png') {
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    }
  } catch { /* téléchargement à la place */ }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}

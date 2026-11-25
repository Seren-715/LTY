// 界面交互效果
// 思路与参数移植自以下 MIT 许可的开源项目，改写为不依赖框架的原生 JS：
//   · Bencho（© 2026 Lorenzo Cabra）：界面音效（Web Audio 合成，无音频文件）
//     其中 Plop 改编自 cuelume（© 2026 Daniel Belyi）
//   · Magic UI（© Magic UI）：Ripple Button、Magic Card、Number Ticker、Confetti、Particles、Blur Fade
//   · Preline UI（© Preline Labs Ltd.）：Tooltip、Toggle Password
// 所有动画都会在系统开启「减少动态效果」时自动关闭。

export const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ================= 音效（Bencho sounds） =================
const SOUNDS = {
  // 发送：Plop
  plop: [
    { hz: 480, to: 300, glide: 18, ms: 23, gain: 0.064, atk: 1 },
    { hz: 600, to: 900, glide: 40, ms: 61, gain: 0.015, atk: 12 },
    { hz: 960, to: 600, glide: 18, ms: 18, gain: 0.016, atk: 1 },
  ],
  // 任务完成：Landed
  landed: [
    { hz: 330, to: 620, ms: 120, gain: 0.018, wave: 'triangle', cut: 1400, atk: 30 },
    { hz: 784, ms: 120, gain: 0.04, wave: 'sine', cut: 2600, atk: 4, at: 70 },
    { hz: 1047, ms: 130, gain: 0.04, wave: 'sine', cut: 2800, atk: 4, at: 140 },
    { hz: 1319, ms: 520, gain: 0.044, wave: 'sine', cut: 3000, atk: 5, at: 210 },
    { hz: 2638, ms: 320, gain: 0.007, wave: 'sine', atk: 8, at: 215 },
  ],
  // 成功提示：Paid
  paid: [
    { hz: 587, ms: 170, gain: 0.05, wave: 'sine', cut: 2600, atk: 5 },
    { hz: 880, ms: 460, gain: 0.046, wave: 'sine', cut: 2800, atk: 6, at: 95 },
    { hz: 1760, ms: 300, gain: 0.009, wave: 'sine', atk: 8, at: 100 },
  ],
  // 失败：Buzz；出错提示：Bump
  buzz: [{ hz: 344, to: 239, ms: 24, gain: 0.048, wave: 'triangle', cut: 1100, atk: 7 }],
  bump: [{ hz: 208, to: 165, ms: 120, gain: 0.03, wave: 'sine', cut: 520, atk: 10 }],
  // 停止：Hush；删除：Sigh
  hush: [{ hz: 330, to: 247, ms: 88, gain: 0.03, wave: 'sine', cut: 720, atk: 8 }],
  sigh: [{ hz: 262, to: 131, ms: 28, gain: 0.065, wave: 'triangle', cut: 1700, atk: 8 }],
  // 打开面板 / 添加附件：Wisp；复制 / 选择：Latch、Tick
  wisp: [{ hz: 660, to: 720, ms: 38, gain: 0.028, wave: 'sine' }],
  latch: [{ hz: 256, ms: 90, gain: 0.058, wave: 'square', cut: 2400, atk: 10 }],
  tick: [{ hz: 196, to: 130, ms: 150, gain: 0.07, wave: 'sine', cut: 900 }],
};

let actx = null;
export const soundEnabled = () => {
  try {
    return localStorage.getItem('rty:sound') !== 'false';
  } catch {
    return true;
  }
};
export function setSoundEnabled(on) {
  try {
    localStorage.setItem('rty:sound', on ? 'true' : 'false');
  } catch {
    /* ignore */
  }
  if (on) play('tick');
}

function schedule(c, notes, when, volume, bend) {
  for (const n of notes) {
    const t0 = when + (n.at ?? 0) / 1000;
    const t1 = t0 + n.ms / 1000;
    const tg = n.glide ? t0 + n.glide / 1000 : t1;
    const o = c.createOscillator();
    o.type = n.wave ?? 'sine';
    o.frequency.setValueAtTime(n.hz * bend, t0);
    if (n.to) o.frequency.exponentialRampToValueAtTime(n.to * bend, tg);
    const g = c.createGain();
    const atk = Math.min((n.atk ?? 4) / 1000, (n.ms / 1000) * 0.6);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime((n.gain ?? 0.05) * volume, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    let tail = o;
    if (n.cut) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = n.cut;
      o.connect(f);
      tail = f;
    }
    tail.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t1 + 0.02);
  }
}

/** 播放一个界面音效。浏览器要求先有一次用户操作，之后才能出声 */
export function play(name, { volume = 1, pitch = 1 } = {}) {
  if (!soundEnabled() || !SOUNDS[name]) return;
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    schedule(actx, SOUNDS[name], actx.currentTime + 0.005, volume, pitch);
  } catch {
    /* 不支持 Web Audio 时静默 */
  }
}

// ================= 点击波纹（Magic UI · Ripple Button） =================
const RIPPLE_SEL = '.btn.primary, .btn.soft, .send-btn, .plus-btn, .sb-item, .template-opt';
function onRipple(e) {
  if (e.button !== 0 || reduceMotion()) return;
  const btn = e.target.closest(RIPPLE_SEL);
  if (!btn || btn.disabled) return;
  const r = btn.getBoundingClientRect();
  const size = Math.max(r.width, r.height);
  const s = document.createElement('span');
  s.className = 'fx-ripple';
  s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
  btn.classList.add('fx-ripple-host');
  btn.appendChild(s);
  setTimeout(() => s.remove(), 650);
}

// ================= 光标聚光卡片（Magic UI · Magic Card） =================
const SPOT_SEL = 'a.card, .fx-spot';
let spotCard = null;
function onSpot(e) {
  const card = e.target.closest?.(SPOT_SEL);
  if (spotCard && spotCard !== card) {
    // 离开卡片后把光斑移出可见范围
    spotCard.style.setProperty('--mx', '-300px');
    spotCard.style.setProperty('--my', '-300px');
  }
  spotCard = card;
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${e.clientX - r.left}px`);
  card.style.setProperty('--my', `${e.clientY - r.top}px`);
}

// ================= 数字滚动（Magic UI · Number Ticker） =================
const NUM_RE = /-?\d[\d,]*(?:\.\d+)?/;
/** 把文本中的第一个数字从旧值滚动到新值，其余文字保持不变 */
export function tickText(node, text) {
  const m = String(text).match(NUM_RE);
  const prev = Number(node.dataset.tick ?? NaN);
  if (!m) {
    node.textContent = text;
    delete node.dataset.tick;
    return;
  }
  const target = Number(m[0].replace(/,/g, ''));
  const decimals = (m[0].split('.')[1] || '').length;
  const grouped = m[0].includes(',');
  node.dataset.tick = target;
  const fmt = (v) => {
    const s = v.toFixed(decimals);
    return grouped ? Number(s).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : s;
  };
  const from = Number.isFinite(prev) ? prev : 0;
  if (reduceMotion() || from === target) {
    node.textContent = text;
    return;
  }
  const head = text.slice(0, m.index);
  const tail = text.slice(m.index + m[0].length);
  const start = performance.now();
  const dur = 900;
  const token = (node._tickToken = {});
  const step = (now) => {
    if (node._tickToken !== token) return;
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(2, -10 * p); // easeOutExpo，接近 Magic UI 的弹簧阻尼
    node.textContent = head + fmt(from + (target - from) * (p === 1 ? 1 : eased)) + tail;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
/** 对容器中匹配的元素逐个做数字滚动 */
export function tickAll(root, selector) {
  root.querySelectorAll(selector).forEach((n) => {
    const text = n.textContent;
    n.dataset.tick = 0;
    tickText(n, text);
  });
}

// ================= 彩纸（Magic UI · Confetti） =================
const CONFETTI_COLORS = ['#5aa6ff', '#2b7de9', '#01d0be', '#ff8ac4', '#ffd166', '#a78bfa'];
/** 从屏幕上的某一点喷出一小簇彩纸 */
export function confetti(x = innerWidth / 2, y = innerHeight / 2, { count = 70, spread = 70, power = 11 } = {}) {
  if (reduceMotion()) return;
  const cv = document.createElement('canvas');
  cv.className = 'fx-confetti';
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => {
    const a = (-90 + (Math.random() - 0.5) * spread) * (Math.PI / 180);
    const v = power * (0.55 + Math.random() * 0.6);
    return {
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      w: 5 + Math.random() * 5,
      h: 7 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
      round: Math.random() < 0.3,
    };
  });
  const start = performance.now();
  const life = 1700;
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const alpha = Math.max(0, 1 - Math.max(0, t - life * 0.55) / (life * 0.45));
    for (const p of parts) {
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + 0.32;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 1);
      ctx.restore();
    }
    if (t < life) requestAnimationFrame(frame);
    else cv.remove();
  };
  requestAnimationFrame(frame);
}
/** 从某个元素的上沿中间喷彩纸 */
export function confettiFrom(elm, opts) {
  if (!elm) return confetti(undefined, undefined, opts);
  const r = elm.getBoundingClientRect();
  confetti(r.left + r.width / 2, r.top + 10, opts);
}

// ================= 漂浮粒子背景（Magic UI · Particles） =================
/** 在容器里铺一层会被鼠标轻轻吸引的粒子，容器离开页面后自动停止 */
export function mountParticles(host, { quantity = 70, color = '43, 125, 233' } = {}) {
  if (reduceMotion()) return;
  const cv = document.createElement('canvas');
  cv.className = 'fx-particles';
  host.prepend(cv);
  const ctx = cv.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  let w = 0;
  let h = 0;
  const mouse = { x: -9999, y: -9999 };
  const resize = () => {
    w = cv.clientWidth;
    h = cv.clientHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const make = () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    tx: 0,
    ty: 0,
    size: Math.random() * 1.8 + 0.6,
    alpha: 0,
    target: Math.random() * 0.5 + 0.15,
    dx: (Math.random() - 0.5) * 0.18,
    dy: (Math.random() - 0.5) * 0.18,
    mag: 0.1 + Math.random() * 3.5,
  });
  const dots = Array.from({ length: quantity }, make);
  const onMove = (e) => {
    const r = cv.getBoundingClientRect();
    mouse.x = e.clientX - r.left - w / 2;
    mouse.y = e.clientY - r.top - h / 2;
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('resize', resize);
  const frame = () => {
    if (!cv.isConnected) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', resize);
      return;
    }
    ctx.clearRect(0, 0, w, h);
    dots.forEach((d, i) => {
      // 越靠近边缘越透明
      const edge = Math.min(d.x + d.tx, w - d.x - d.tx, d.y + d.ty, h - d.y - d.ty);
      const fade = Math.max(0, Math.min(1, edge / 20));
      d.alpha += ((fade > 0 ? d.target * fade : 0) - d.alpha) * 0.05;
      d.x += d.dx;
      d.y += d.dy;
      // 跟随鼠标的轻微偏移（staticity = 50, ease = 50）
      d.tx += (mouse.x / (50 / d.mag) - d.tx) / 50;
      d.ty += (mouse.y / (50 / d.mag) - d.ty) / 50;
      if (d.x < -20 || d.x > w + 20 || d.y < -20 || d.y > h + 20) dots[i] = make();
      ctx.beginPath();
      ctx.arc(d.x + d.tx, d.y + d.ty, d.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color}, ${d.alpha})`;
      ctx.fill();
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ================= 抖动（Bencho · Upload dropzone 的拒收反馈） =================
export function shake(elm) {
  if (!elm || reduceMotion()) return;
  elm.classList.remove('fx-shake');
  void elm.offsetWidth;
  elm.classList.add('fx-shake');
  setTimeout(() => elm.classList.remove('fx-shake'), 450);
}

// ================= 悬浮提示（Preline · Tooltip） =================
const TIP_SEL = '.icon-btn[title], .sb-row-actions [title], .send-btn[title], .plus-btn[title], [data-tip]';
let tipEl = null;
let tipTarget = null;
let tipTimer = 0;
function hideTip() {
  clearTimeout(tipTimer);
  if (tipTarget?.dataset.tipTitle) {
    tipTarget.setAttribute('title', tipTarget.dataset.tipTitle);
    delete tipTarget.dataset.tipTitle;
  }
  tipTarget = null;
  tipEl?.classList.remove('show');
}
function onTipOver(e) {
  if (e.pointerType === 'touch') return;
  const t = e.target.closest?.(TIP_SEL);
  if (t === tipTarget) return;
  hideTip();
  if (!t) return;
  const text = t.dataset.tip || t.getAttribute('title');
  if (!text) return;
  tipTarget = t;
  // 暂时移走 title，避免和浏览器自带提示重叠
  if (t.hasAttribute('title')) {
    t.dataset.tipTitle = t.getAttribute('title');
    t.removeAttribute('title');
  }
  tipTimer = setTimeout(() => {
    if (tipTarget !== t || !t.isConnected) return;
    tipEl ||= document.body.appendChild(Object.assign(document.createElement('div'), { className: 'fx-tip', role: 'tooltip' }));
    tipEl.textContent = text;
    const r = t.getBoundingClientRect();
    const tw = tipEl.offsetWidth;
    const th = tipEl.offsetHeight;
    let top = r.top - th - 8;
    let below = false;
    if (top < 6) {
      top = r.bottom + 8;
      below = true;
    }
    const left = Math.max(6, Math.min(innerWidth - tw - 6, r.left + r.width / 2 - tw / 2));
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
    tipEl.classList.toggle('below', below);
    tipEl.classList.add('show');
  }, 380);
}

// ================= 显示 / 隐藏密码（Preline · Toggle Password） =================
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.4 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.6 6.6A18.4 18.4 0 0 0 2 12s3.6 8 10 8a9.7 9.7 0 0 0 5.4-1.6"/><path d="M14.1 14.1a3 3 0 1 1-4.24-4.24M2 2l20 20"/></svg>';
export function passwordToggle(input) {
  const wrap = document.createElement('div');
  wrap.className = 'fx-pw';
  input.replaceWith(wrap);
  wrap.appendChild(input);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'fx-pw-btn';
  b.setAttribute('aria-label', '显示');
  b.innerHTML = EYE;
  b.onclick = () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.innerHTML = show ? EYE_OFF : EYE;
    b.setAttribute('aria-label', show ? '隐藏' : '显示');
    input.focus();
  };
  wrap.appendChild(b);
}

// ================= 入场动画（Magic UI · Blur Fade） =================
/** 给一组元素依次加上模糊淡入动画 */
export function blurIn(nodes, { step = 45, max = 12 } = {}) {
  if (reduceMotion()) return;
  [...nodes].forEach((n, i) => {
    n.style.setProperty('--fx-delay', `${Math.min(i, max) * step}ms`);
    n.classList.add('fx-in');
  });
}

let installed = false;
export function installFx() {
  if (installed) return;
  installed = true;
  document.addEventListener('pointerdown', onRipple, true);
  document.addEventListener('pointermove', onSpot, { passive: true });
  document.addEventListener('pointerover', onTipOver);
  document.addEventListener('pointerdown', hideTip, true);
  window.addEventListener('scroll', hideTip, true);
  window.addEventListener('hashchange', hideTip);
}

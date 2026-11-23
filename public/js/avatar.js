// 头像：默认图片、选择图片并裁剪成 256×256 的圆形头像
import { el, $, modal, toast } from './ui.js';

export const DEFAULT_AVATAR = 'img/avatar.jpg';
export const avatarSrc = (user) => (user && user.avatar) || DEFAULT_AVATAR;

const STAGE = 260; // 裁剪区域显示尺寸
const OUT = 256; // 输出尺寸

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('无法读取这张图片'));
    img.src = url;
  });
}

/** 弹出文件选择框，返回选中的图片文件（取消则为 null） */
export function pickImageFile() {
  return new Promise((resolve) => {
    const input = el('<input type="file" accept="image/*" style="display:none">');
    input.onchange = () => {
      resolve(input.files[0] || null);
      input.remove();
    };
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

/** 打开裁剪框，返回 JPEG data URL（取消则为 null） */
export async function cropAvatar(file) {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  if (file.size > 20 * 1024 * 1024) throw new Error('图片太大了（超过 20MB）');
  const img = await loadImage(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const base = Math.max(STAGE / w, STAGE / h); // 刚好铺满裁剪区
  let zoom = 1;
  let ox = (STAGE - w * base) / 2;
  let oy = (STAGE - h * base) / 2;

  const body = el(`<div class="cropper">
    <div class="crop-stage" style="width:${STAGE}px;height:${STAGE}px"><img draggable="false" alt=""><div class="crop-mask"></div></div>
    <div class="crop-zoom"><span>－</span><input type="range" min="1" max="4" step="0.01" value="1"><span>＋</span></div>
    <div class="crop-tip">拖动图片调整位置，滚轮或滑块缩放</div>
  </div>`);
  const stage = $(body, '.crop-stage');
  const view = $(body, '.crop-stage img');
  const slider = $(body, 'input');
  view.src = img.src;

  const clamp = () => {
    const dw = w * base * zoom;
    const dh = h * base * zoom;
    ox = Math.min(0, Math.max(STAGE - dw, ox));
    oy = Math.min(0, Math.max(STAGE - dh, oy));
  };
  const paint = () => {
    clamp();
    view.style.width = `${w * base * zoom}px`;
    view.style.height = `${h * base * zoom}px`;
    view.style.transform = `translate(${ox}px, ${oy}px)`;
  };
  // 以裁剪区中心为基准缩放
  const setZoom = (z, cx = STAGE / 2, cy = STAGE / 2) => {
    const nz = Math.min(4, Math.max(1, z));
    const k = nz / zoom;
    ox = cx - (cx - ox) * k;
    oy = cy - (cy - oy) * k;
    zoom = nz;
    slider.value = String(zoom);
    paint();
  };
  paint();

  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, ox, oy };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    ox = drag.ox + e.clientX - drag.x;
    oy = drag.oy + e.clientY - drag.y;
    paint();
  });
  const end = () => (drag = null);
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      setZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false },
  );
  slider.oninput = () => setZoom(Number(slider.value));

  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(img.src);
      resolve(v);
    };
    const m = modal({
      title: '裁剪头像',
      body,
      width: '360px',
      actions: [
        { label: '取消', onClick: () => finish(null) },
        {
          label: '使用这张',
          primary: true,
          onClick: () => {
            const s = base * zoom;
            const canvas = document.createElement('canvas');
            canvas.width = OUT;
            canvas.height = OUT;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, OUT, OUT);
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, -ox / s, -oy / s, STAGE / s, STAGE / s, 0, 0, OUT, OUT);
            finish(canvas.toDataURL('image/jpeg', 0.88));
          },
        },
      ],
    });
    // 通过 Esc / 点击遮罩关闭时也要结束
    const obs = new MutationObserver(() => {
      if (!document.body.contains(m.body)) {
        obs.disconnect();
        finish(null);
      }
    });
    obs.observe(document.body, { childList: true });
  });
}

/** 完整流程：选图 → 裁剪 → 返回 data URL */
export async function chooseAvatar() {
  const file = await pickImageFile();
  if (!file) return null;
  try {
    return await cropAvatar(file);
  } catch (e) {
    toast(e.message, 'error');
    return null;
  }
}

/** 校验头像 data URL（前后端共用规则：JPEG/PNG/WebP，不超过约 300KB） */
export function isValidAvatar(v) {
  return typeof v === 'string' && v.length <= 400000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
}

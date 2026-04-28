const TOPPINGS = [
  { id: "pepper", src: "./resources/pepper.svg", label: "Green pepper" },
  { id: "pepperoni", src: "./resources/pepperoni.svg", label: "Pepperoni" },
  { id: "mushroom", src: "./resources/mushroom.svg", label: "Mushroom" },
  { id: "tomato", src: "./resources/tomato.svg", label: "Tomato slice" },
];

const DESIGN_WIDTH = 1920;
const BASE_ITEM_SCALE = 0.60;
const MAX_PER_ITEM = 8;
const MASK_SRC = "./resources/mask.png";
const MASK_BLOCK_RGB_MAX = 40;

// Right-side ingredient icons on background.png
const HOTSPOTS = [
  { id: "pepper", x: 80.5, y: 22.5, w: 14, h: 12 },
  { id: "pepperoni", x: 80.5, y: 37.5, w: 14, h: 12 },
  { id: "tomato", x: 80.5, y: 52.5, w: 14, h: 12 },
  { id: "mushroom", x: 80.5, y: 67.5, w: 14, h: 12 },
];

const sceneEl = document.getElementById("scene");
const hotspotsEl = document.getElementById("hotspots");
const placedLayerEl = document.getElementById("placed-layer");
const resetBtn = document.getElementById("reset-btn");

let drag = null;
let zStack = 1;

const sourceImageCache = new Map();
const maskImage = new Image();
let maskReady = false;
let maskPixels = null;
let maskWidth = 0;
let maskHeight = 0;
const candidateCanvas = document.createElement("canvas");
const candidateCtx = candidateCanvas.getContext("2d", { willReadFrequently: true });

function getItemById(id) {
  return TOPPINGS.find((x) => x.id === id) || null;
}

function getSourceImage(item) {
  let img = sourceImageCache.get(item.id);
  if (!img) {
    img = new Image();
    img.src = item.src;
    sourceImageCache.set(item.id, img);
  }
  return img;
}

function getSceneScale() {
  const sceneRect = sceneEl?.getBoundingClientRect();
  const sceneWidth = sceneRect?.width || DESIGN_WIDTH;
  return sceneWidth / DESIGN_WIDTH;
}

function getItemScale() {
  return BASE_ITEM_SCALE * getSceneScale();
}

function getPlacedCount(itemId) {
  return placedLayerEl.querySelectorAll(`[data-item-id="${itemId}"]`).length;
}

function createPlacedItem(item, xPct, yPct) {
  const img = document.createElement("img");
  img.src = item.src;
  img.alt = "";
  img.className = "placed-item placed-item--draggable";
  img.dataset.itemId = item.id;
  img.style.left = `${xPct}%`;
  img.style.top = `${yPct}%`;
  img.style.setProperty("--item-scale", String(getItemScale()));
  img.style.zIndex = String(++zStack);

  const applyNaturalWidth = () => {
    if (!img.naturalWidth) return;
    img.style.width = `${img.naturalWidth}px`;
    img.style.height = "auto";
  };
  if (img.complete) {
    applyNaturalWidth();
  } else {
    img.addEventListener("load", applyNaturalWidth, { once: true });
  }

  img.addEventListener("pointerdown", onPlacedPointerDown);
  return img;
}

function clientToScenePercent(clientX, clientY) {
  const r = sceneEl.getBoundingClientRect();
  return {
    xPct: ((clientX - r.left) / r.width) * 100,
    yPct: ((clientY - r.top) / r.height) * 100,
  };
}

function overlapsAnyPlaced(clientX, clientY, excludeElement) {
  for (const img of sceneEl.querySelectorAll(".placed-item")) {
    if (img === excludeElement) continue;
    if (img.style.visibility === "hidden") continue;

    const br = img.getBoundingClientRect();
    if (br.width < 2 || br.height < 2) continue;

    const ox = br.left + br.width / 2;
    const oy = br.top + br.height / 2;
    const ro = Math.max(br.width, br.height) * 0.46;
    const rNew = ro * 0.95;

    if (Math.hypot(clientX - ox, clientY - oy) < ro + rNew) {
      return true;
    }
  }
  return false;
}

function isMaskAllowedForItemAtClient(item, clientX, clientY) {
  // Fail-closed: if mask is not ready, do not allow placement.
  if (!maskReady || !maskPixels || !candidateCtx || !sceneEl) {
    return false;
  }

  const source = getSourceImage(item);
  if (!source || !source.naturalWidth || !source.naturalHeight) return false;

  const itemScale = getItemScale();
  const drawW = Math.max(1, Math.round(source.naturalWidth * itemScale));
  const drawH = Math.max(1, Math.round(source.naturalHeight * itemScale));
  candidateCanvas.width = drawW;
  candidateCanvas.height = drawH;
  candidateCtx.clearRect(0, 0, drawW, drawH);
  candidateCtx.drawImage(source, 0, 0, drawW, drawH);

  const px = candidateCtx.getImageData(0, 0, drawW, drawH).data;
  const sceneRect = sceneEl.getBoundingClientRect();
  const left = clientX - drawW / 2;
  const top = clientY - drawH / 2;
  // Higher sampling density near boundaries to prevent leaking outside mask.
  const step = Math.max(1, Math.floor(Math.min(drawW, drawH) / 220));

  for (let y = 0; y < drawH; y += step) {
    for (let x = 0; x < drawW; x += step) {
      const idx = (y * drawW + x) * 4;
      const alpha = px[idx + 3];
      if (alpha < 24) continue;

      const sceneX = left + x;
      const sceneY = top + y;
      const nx = (sceneX - sceneRect.left) / sceneRect.width;
      const ny = (sceneY - sceneRect.top) / sceneRect.height;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
        return false;
      }

      const mx = Math.max(0, Math.min(maskWidth - 1, Math.round(nx * (maskWidth - 1))));
      const my = Math.max(0, Math.min(maskHeight - 1, Math.round(ny * (maskHeight - 1))));
      const maskIndex = (my * maskWidth + mx) * 4;
      const isBlack =
        maskPixels[maskIndex] <= MASK_BLOCK_RGB_MAX &&
        maskPixels[maskIndex + 1] <= MASK_BLOCK_RGB_MAX &&
        maskPixels[maskIndex + 2] <= MASK_BLOCK_RGB_MAX;
      if (isBlack) {
        return false;
      }
    }
  }
  return true;
}

function tryPlacementClientPosition(item, clientX, clientY, excludeElement) {
  if (overlapsAnyPlaced(clientX, clientY, excludeElement)) {
    return null;
  }
  if (!isMaskAllowedForItemAtClient(item, clientX, clientY)) {
    return null;
  }
  return { x: clientX, y: clientY };
}

function attachGlobalPointerListeners() {
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerUp, true);
}

function detachGlobalPointerListeners() {
  document.removeEventListener("pointermove", onPointerMove, true);
  document.removeEventListener("pointerup", onPointerUp, true);
  document.removeEventListener("pointercancel", onPointerUp, true);
}

function cleanupDragPreview() {
  if (!drag) return;
  if (drag.mode === "placed" && drag.element && drag.element.isConnected) {
    drag.element.style.visibility = drag.prevVisibility || "visible";
  }
  drag.preview.remove();
  drag = null;
  detachGlobalPointerListeners();
}

function resetPizza() {
  cleanupDragPreview();
  placedLayerEl.innerHTML = "";
  zStack = 1;
}

function beginPaletteDrag(e, item) {
  e.preventDefault();

  const preview = document.createElement("img");
  preview.src = item.src;
  preview.className = "drag-preview";
  preview.alt = "";
  document.body.appendChild(preview);

  drag = {
    mode: "palette",
    item,
    preview,
    pointerId: e.pointerId,
    captureTarget: e.currentTarget,
  };

  preview.style.left = `${e.clientX}px`;
  preview.style.top = `${e.clientY}px`;

  if (e.currentTarget && typeof e.currentTarget.setPointerCapture === "function") {
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  attachGlobalPointerListeners();
}

function onHotspotPointerDown(e) {
  if (e.button !== 0) return;
  const target = e.currentTarget;
  const item = getItemById(target.dataset.itemId);
  if (!item) return;

  if (getPlacedCount(item.id) >= MAX_PER_ITEM) {
    return;
  }

  beginPaletteDrag(e, item);
}

function onPlacedPointerDown(e) {
  if (e.button !== 0) return;
  const element = e.currentTarget;
  const item = getItemById(element.dataset.itemId);
  if (!item) return;

  e.preventDefault();
  e.stopPropagation();

  const preview = document.createElement("img");
  preview.src = item.src;
  preview.className = "drag-preview";
  preview.alt = "";
  document.body.appendChild(preview);

  const prevLeft = element.style.left || "";
  const prevTop = element.style.top || "";
  const prevVisibility = element.style.visibility || "";

  element.style.visibility = "hidden";

  drag = {
    mode: "placed",
    item,
    element,
    preview,
    pointerId: e.pointerId,
    prevLeft,
    prevTop,
    prevVisibility,
    captureTarget: element,
  };

  preview.style.left = `${e.clientX}px`;
  preview.style.top = `${e.clientY}px`;

  if (typeof element.setPointerCapture === "function") {
    element.setPointerCapture(e.pointerId);
  }

  attachGlobalPointerListeners();
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  drag.preview.style.left = `${e.clientX}px`;
  drag.preview.style.top = `${e.clientY}px`;
}

function onPointerUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;

  detachGlobalPointerListeners();
  if (drag.captureTarget && typeof drag.captureTarget.releasePointerCapture === "function") {
    drag.captureTarget.releasePointerCapture(e.pointerId);
  }

  if (drag.mode === "palette") {
    const placement = tryPlacementClientPosition(drag.item, e.clientX, e.clientY, null);
    if (placement) {
      const { xPct, yPct } = clientToScenePercent(placement.x, placement.y);
      const node = createPlacedItem(drag.item, xPct, yPct);
      placedLayerEl.appendChild(node);
    }
  } else if (drag.mode === "placed") {
    const { element, prevLeft, prevTop, prevVisibility } = drag;
    const placement = tryPlacementClientPosition(drag.item, e.clientX, e.clientY, element);
    if (placement) {
      const { xPct, yPct } = clientToScenePercent(placement.x, placement.y);
      element.style.left = `${xPct}%`;
      element.style.top = `${yPct}%`;
      element.style.zIndex = String(++zStack);
    } else {
      element.style.left = prevLeft;
      element.style.top = prevTop;
    }
    if (element.isConnected) {
      element.style.visibility = prevVisibility || "visible";
    }
  }

  drag.preview.remove();
  drag = null;
}

function renderHotspots() {
  hotspotsEl.innerHTML = "";
  HOTSPOTS.forEach((hs) => {
    const item = getItemById(hs.id);
    if (!item) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hotspot";
    button.dataset.itemId = item.id;
    button.setAttribute("aria-label", `place ${item.label}`);
    button.style.left = `${hs.x}%`;
    button.style.top = `${hs.y}%`;
    button.style.width = `${hs.w}%`;
    button.style.height = `${hs.h}%`;
    button.addEventListener("pointerdown", onHotspotPointerDown);
    hotspotsEl.appendChild(button);
  });
}

function initMask() {
  maskImage.addEventListener("load", () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || !maskImage.naturalWidth || !maskImage.naturalHeight) {
      maskReady = false;
      maskPixels = null;
      return;
    }

    maskWidth = maskImage.naturalWidth;
    maskHeight = maskImage.naturalHeight;
    canvas.width = maskWidth;
    canvas.height = maskHeight;
    ctx.drawImage(maskImage, 0, 0);
    maskPixels = ctx.getImageData(0, 0, maskWidth, maskHeight).data;
    maskReady = true;
  });
  maskImage.addEventListener("error", () => {
    maskReady = false;
    maskPixels = null;
    maskWidth = 0;
    maskHeight = 0;
  });
  maskImage.src = MASK_SRC;
}

function preloadSourceImages() {
  TOPPINGS.forEach((item) => {
    getSourceImage(item);
  });
}

initMask();
preloadSourceImages();
renderHotspots();
resetBtn?.addEventListener("click", resetPizza);

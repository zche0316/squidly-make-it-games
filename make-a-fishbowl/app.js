const CENTER_TYPES = new Set(["fish", "star", "bubble"]);
const FIXED_BOTTOM_ITEM_SLOT = {
  sand: 0,
  pebble: 0,
};
const DESIGN_WIDTH = 1920;
const BASE_ITEM_SCALE = 0.55;
const MAX_PER_ITEM = 4;
const MASK_SRC = "./resources/mask.png";

// Fishbowl area constraint in scene percentage space.
const BOWL = {
  cx: 37,
  cy: 60,
  rx: 33,
  ry: 37,
};

const RESOURCE_ITEMS = [
  { id: "sand", label: "sand", src: "./resources/sand.svg", type: "bottom" },
  { id: "pebble", label: "pebble", src: "./resources/pebble.svg", type: "bottom" },
  { id: "stones", label: "stones", src: "./resources/stones.svg", type: "bottom" },
  { id: "shell1", label: "shell1", src: "./resources/shell1.svg", type: "bottom" },
  { id: "shell2", label: "shell2", src: "./resources/shell2.svg", type: "bottom" },
  { id: "shell3", label: "shell3", src: "./resources/shell3.svg", type: "bottom" },
  { id: "seaweed1", label: "seaweed1", src: "./resources/seaweed1.svg", type: "bottom" },
  { id: "seaweed2", label: "seaweed2", src: "./resources/seaweed2.svg", type: "bottom" },
  { id: "seaweed3", label: "seaweed3", src: "./resources/seaweed3.svg", type: "bottom" },
  { id: "seaweed4", label: "seaweed4", src: "./resources/seaweed4.svg", type: "bottom" },
  { id: "fish1", label: "fish1", src: "./resources/fish1.svg", type: "fish" },
  { id: "fish2", label: "fish2", src: "./resources/fish2.svg", type: "fish" },
  { id: "fish3", label: "fish3", src: "./resources/fish3.svg", type: "fish" },
  { id: "fish4", label: "fish4", src: "./resources/fish4.svg", type: "fish" },
  { id: "fish5", label: "fish5", src: "./resources/fish5.svg", type: "fish" },
  { id: "fish6", label: "fish6", src: "./resources/fish6.svg", type: "fish" },
  { id: "starBlue", label: "star-blue", src: "./resources/star-blue.svg", type: "star" },
  { id: "starRed", label: "star-red", src: "./resources/star-red.svg", type: "star" },
  { id: "starYellow", label: "star-yellow", src: "./resources/star-yellow.svg", type: "star" },
  { id: "bubble", label: "bubble", src: "./resources/bubble.svg", type: "bubble" },
];

const BOTTOM_SLOTS = [
  { x: 35, y: 90 },
  { x: 35, y: 90 },
];

// Click hotspots aligned to the printed background asset.
const HOTSPOTS = [
  { id: "sand", x: 6, y: 0.5, w: 45, h: 12.5 },
  { id: "stones", x: 77, y: 31, w: 17, h: 8.5 },
  { id: "pebble", x: 80, y: 8, w: 15, h: 10 },
  { id: "bubble", x: 66, y: 27, w: 9, h: 9 },
  { id: "starBlue", x: 64, y: 37.5, w: 9, h: 9.5 },
  { id: "starYellow", x: 71, y: 33, w: 8.5, h: 8.5 },
  { id: "starRed", x: 78, y: 33.5, w: 8.5, h: 8.5 },
  { id: "fish1", x: 66.5, y: 43.3, w: 12, h: 11.2 },
  { id: "fish2", x: 78.7, y: 43.2, w: 12, h: 11.2 },
  { id: "fish3", x: 66.5, y: 54.2, w: 12, h: 11.2 },
  { id: "fish4", x: 78.7, y: 54.2, w: 12, h: 11.2 },
  { id: "fish5", x: 72.6, y: 64.6, w: 12, h: 11.2 },
  { id: "fish6", x: 84.6, y: 64.6, w: 12, h: 11.2 },
  { id: "seaweed1", x: 66.2, y: 81.8, w: 5.6, h: 11 },
  { id: "seaweed2", x: 73, y: 80.6, w: 6.2, h: 12.2 },
  { id: "seaweed3", x: 70, y: 90, w: 5.8, h: 8.2 },
  { id: "seaweed4", x: 77.4, y: 90.4, w: 6.6, h: 8.2 },
  { id: "shell1", x: 82.8, y: 88.8, w: 6.7, h: 8.5 },
  { id: "shell2", x: 88.8, y: 89.4, w: 6.7, h: 8.5 },
  { id: "shell3", x: 91.8, y: 80.6, w: 6.7, h: 8.5 },
];

const hotspotsEl = document.getElementById("hotspots");
const sceneEl = document.getElementById("scene");
const placedBottomEl = document.getElementById("placed-bottom");
const placedCenterEl = document.getElementById("placed-center");
const resetBtn = document.getElementById("reset-btn");

const bottomPlacedBySlot = new Map();
let drag = null;
let zStack = 1;
const sourceImageCache = new Map();
const maskImage = new Image();
let maskReady = false;
const candidateCanvas = document.createElement("canvas");
const candidateCtx = candidateCanvas.getContext("2d", { willReadFrequently: true });
const maskSampleCanvas = document.createElement("canvas");
maskSampleCanvas.width = 1;
maskSampleCanvas.height = 1;
const maskSampleCtx = maskSampleCanvas.getContext("2d", { willReadFrequently: true });

function getItemById(id) {
  return RESOURCE_ITEMS.find((x) => x.id === id) || null;
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

function isCenterItemType(type) {
  return CENTER_TYPES.has(type);
}

function getPlacedCount(itemId) {
  const bottomCount = placedBottomEl.querySelectorAll(`[data-item-id="${itemId}"]`).length;
  const centerCount = placedCenterEl.querySelectorAll(`[data-item-id="${itemId}"]`).length;
  return bottomCount + centerCount;
}

function createPlacedItem(item, xPct, yPct, draggable = true) {
  const img = document.createElement("img");
  img.src = item.src;
  img.alt = "";
  img.className = "placed-item";
  img.dataset.itemId = item.id;
  img.dataset.itemType = item.type;
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

  if (draggable) {
    img.classList.add("placed-item--draggable");
    img.addEventListener("pointerdown", onPlacedPointerDown);
  }
  return img;
}

function placeFixedBottom(item) {
  const slotIndex = FIXED_BOTTOM_ITEM_SLOT[item.id] ?? 0;
  const slot = BOTTOM_SLOTS[slotIndex];
  const existing = bottomPlacedBySlot.get(slotIndex);
  if (existing) {
    existing.remove();
  }
  const node = createPlacedItem(item, slot.x, slot.y, false);
  placedBottomEl.appendChild(node);
  bottomPlacedBySlot.set(slotIndex, node);
}

function getBowlClientParams() {
  const r = sceneEl.getBoundingClientRect();
  return {
    cx: r.left + (BOWL.cx / 100) * r.width,
    cy: r.top + (BOWL.cy / 100) * r.height,
    rx: (BOWL.rx / 100) * r.width,
    ry: (BOWL.ry / 100) * r.height,
  };
}

function clientToScenePercent(clientX, clientY) {
  const r = sceneEl.getBoundingClientRect();
  return {
    xPct: ((clientX - r.left) / r.width) * 100,
    yPct: ((clientY - r.top) / r.height) * 100,
  };
}

function projectIntoBowl(clientX, clientY) {
  const { cx, cy, rx, ry } = getBowlClientParams();
  const dx = clientX - cx;
  const dy = clientY - cy;
  const metric = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  if (metric <= 1) {
    return { x: clientX, y: clientY };
  }
  const s = 1 / Math.sqrt(metric);
  return { x: cx + dx * s, y: cy + dy * s };
}

function isMaskAllowedForItemAtClient(item, clientX, clientY) {
  if (!maskReady || !candidateCtx || !sceneEl) return true;

  const source = getSourceImage(item);
  if (!source || !source.naturalWidth || !source.naturalHeight) return true;

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
  const step = Math.max(1, Math.floor(Math.min(drawW, drawH) / 80));

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

      const mx = Math.max(0, Math.min(maskImage.naturalWidth - 1, Math.round(nx * (maskImage.naturalWidth - 1))));
      const my = Math.max(0, Math.min(maskImage.naturalHeight - 1, Math.round(ny * (maskImage.naturalHeight - 1))));
      if (!maskSampleCtx) return false;
      maskSampleCtx.clearRect(0, 0, 1, 1);
      maskSampleCtx.drawImage(maskImage, mx, my, 1, 1, 0, 0, 1, 1);
      const m = maskSampleCtx.getImageData(0, 0, 1, 1).data;
      const isBlack = m[0] <= 20 && m[1] <= 20 && m[2] <= 20;
      if (isBlack) {
        return false;
      }
    }
  }
  return true;
}

function overlapsAnyPlaced(clientX, clientY, excludeElement, dragItem = null) {
  const dragRadius = dragItem ? getItemScale() * 30 : 0;
  
  for (const img of sceneEl.querySelectorAll(".placed-item")) {
    if (img === excludeElement) continue;
    if (img.style.visibility === "hidden") continue;
    if (img.dataset.itemId === "sand" || img.dataset.itemId === "pebble") continue;

    const br = img.getBoundingClientRect();
    if (br.width < 2 || br.height < 2) continue;

    const ox = br.left + br.width / 2;
    const oy = br.top + br.height / 2;
    const ro = Math.max(br.width, br.height) * 0.46;
    const rNew = dragRadius || (ro * 0.95);

    if (Math.hypot(clientX - ox, clientY - oy) < ro + rNew) {
      return true;
    }
  }
  return false;
}

function tryPlacementClientPosition(item, clientX, clientY, excludeElement) {
  const p = projectIntoBowl(clientX, clientY);
  if (overlapsAnyPlaced(p.x, p.y, excludeElement, item)) {
    return null;
  }
  if (!isMaskAllowedForItemAtClient(item, p.x, p.y)) {
    return null;
  }
  return p;
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

  if (item.id === "sand" || item.id === "pebble") {
    placeFixedBottom(item);
    return;
  }

  if (getPlacedCount(item.id) >= MAX_PER_ITEM) {
    return;
  }

  beginPaletteDrag(e, item);
}

function onPlacedPointerDown(e) {
  if (e.button !== 0) return;
  const element = e.currentTarget;
  const item = getItemById(element.dataset.itemId);
  if (!item || item.id === "sand" || item.id === "pebble") {
    return;
  }

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
      const node = createPlacedItem(drag.item, xPct, yPct, true);
      const targetLayer = isCenterItemType(drag.item.type) ? placedCenterEl : placedBottomEl;
      targetLayer.appendChild(node);
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

function resetBowl() {
  cleanupDragPreview();
  placedBottomEl.innerHTML = "";
  placedCenterEl.innerHTML = "";
  bottomPlacedBySlot.clear();
  zStack = 1;
}

function refreshPlacedItemScale() {
  const scale = String(getItemScale());
  document.querySelectorAll(".placed-item").forEach((node) => {
    node.style.setProperty("--item-scale", scale);
  });
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
    maskReady = true;
  });
  maskImage.addEventListener("error", () => {
    maskReady = false;
    console.warn("[fishbowl] mask.png failed to load, fallback to geometric checks.");
  });
  maskImage.src = MASK_SRC;
}

function preloadSourceImages() {
  RESOURCE_ITEMS.forEach((item) => {
    getSourceImage(item);
  });
}

initMask();
preloadSourceImages();
renderHotspots();
resetBtn?.addEventListener("click", resetBowl);
window.addEventListener("resize", refreshPlacedItemScale);

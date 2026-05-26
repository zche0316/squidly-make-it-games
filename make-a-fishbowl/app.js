import { initBackToHub } from "../shared/back-nav.js";
import { createSessionSync } from "../shared/session-sync.js";
import {
  ART_VIEW_BOX,
  BOWL,
  BOWL_PALETTE_GAP,
  CENTER_TYPES,
  COLOR_COUNT,
  ITEM_BY_ID,
  MAX_PER_ITEM,
  PALETTE_ACCESS_GROUP,
  PALETTE_BOTTOM_HIT_WIDTH_FRAC,
  PALETTE_CENTER_BY_ID,
  PALETTE_CENTERS,
  RESOURCE_ITEMS,
  SLOT_ACCESS_GROUP,
  FISH_SLOT_FLIPPED,
  PALETTE_FISH_FLIPPED,
  SLOT_BY_ID,
  SLOT_ITEM_FILL,
  SLOT_LAYOUT,
} from "./fishbowl-layout.js";

const sceneEl = document.getElementById("scene");
const hotspotsEl = document.getElementById("hotspots");
const placedBottomEl = document.getElementById("placed-bottom");
const placedCenterEl = document.getElementById("placed-center");
const slotsAccessEl = document.getElementById("fishbowl-slots-access");
const resetBtn = document.getElementById("reset-btn");
const resetAccessBtn = document.getElementById("reset-access-btn");
const squidlyAPI = window.SquidlyAPI;

let zStack = 1;
let selectedItemId = null;
const paletteColorByItemId = new Map();
const slotPlacements = new Map();
const sourceImageCache = new Map();

const sessionSync = createSessionSync({
  gameSlug: "make-a-fishbowl",
  serialize: serializeFishbowlState,
  apply: applyFishbowlState,
});

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const getItemById = (id) => ITEM_BY_ID.get(id) ?? null;
const hasArtFamily = (item) => Boolean(item?.artFamily);
const isCenterLayer = (type) => CENTER_TYPES.has(type);

function resolveLegacyPlacement(itemId, colorIndex) {
  const hasColor = Number.isFinite(colorIndex);
  const fish = /^fish(\d)$/.exec(itemId);
  if (fish) {
    return { itemId: "fish", colorIndex: hasColor ? colorIndex : (Number(fish[1]) - 1) % COLOR_COUNT };
  }
  const seaweed = /^seaweed(\d)$/.exec(itemId);
  if (seaweed) {
    return {
      itemId: "seaweed",
      colorIndex: hasColor ? colorIndex : (Number(seaweed[1]) - 1) % COLOR_COUNT,
    };
  }
  const shell = /^shell(\d)$/.exec(itemId);
  if (shell) {
    return {
      itemId: "shell",
      colorIndex: hasColor ? colorIndex : (Number(shell[1]) - 1) % COLOR_COUNT,
    };
  }
  if (itemId === "starBlue") return { itemId: "star", colorIndex: hasColor ? colorIndex : 1 };
  if (itemId === "starYellow") return { itemId: "star", colorIndex: hasColor ? colorIndex : 2 };
  if (itemId === "starRed") return { itemId: "star", colorIndex: hasColor ? colorIndex : 3 };
  return { itemId, colorIndex: hasColor ? colorIndex : 0 };
}

function serializeFishbowlState() {
  const slots = [];
  for (const { id: slotId } of SLOT_LAYOUT) {
    const node = slotPlacements.get(slotId);
    if (!node?.isConnected) continue;
    const item = getItemById(node.dataset.itemId);
    if (!item) continue;
    const left = Number.parseFloat(node.style.left);
    const top = Number.parseFloat(node.style.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) continue;
    const entry = {
      slotId,
      itemId: item.id,
      xPct: Number(left.toFixed(3)),
      yPct: Number(top.toFixed(3)),
      z: Number.parseInt(node.style.zIndex || "1", 10) || 1,
    };
    if (hasArtFamily(item)) {
      const c = Number.parseInt(node.dataset.colorIndex ?? "", 10);
      entry.colorIndex = Number.isFinite(c) ? c : 0;
    }
    slots.push(entry);
  }
  slots.sort((a, b) => a.z - b.z);
  return JSON.stringify({ v: 2, slots });
}

function applyFishbowlState(statePayload) {
  if (typeof statePayload !== "string" || !statePayload.trim()) return;
  let parsed;
  try {
    parsed = JSON.parse(statePayload);
  } catch {
    return;
  }
  const version = parsed?.v;
  if ((version !== 1 && version !== 2) || !Array.isArray(parsed.slots)) return;

  placedBottomEl.innerHTML = "";
  placedCenterEl.innerHTML = "";
  slotPlacements.clear();
  zStack = 1;
  selectedItemId = null;
  paletteColorByItemId.clear();

  const bySlot = new Map();
  for (const s of parsed.slots) {
    if (!s?.slotId) continue;
    const rawColor = version === 2 && Number.isFinite(s.colorIndex) ? s.colorIndex : null;
    const { itemId, colorIndex } = resolveLegacyPlacement(s.itemId, rawColor);
    const item = getItemById(itemId);
    if (!item || !slotAccepts(s.slotId, item)) continue;
    const z = Number.isFinite(s.z) ? s.z : 1;
    const prev = bySlot.get(s.slotId);
    if (!prev || z >= (prev.z || 1)) {
      bySlot.set(s.slotId, { slotId: s.slotId, xPct: s.xPct, yPct: s.yPct, z, item, colorIndex });
    }
  }

  for (const entry of [...bySlot.values()].sort((a, b) => (a.z || 1) - (b.z || 1))) {
    const xPct = Number(entry.xPct);
    const yPct = Number(entry.yPct);
    if (!Number.isFinite(xPct) || !Number.isFinite(yPct)) continue;
    const node = createPlacedItem(entry.item, xPct, yPct, entry.colorIndex);
    const itemZ = entry.z || zStack + 1;
    node.style.zIndex = String(itemZ);
    zStack = Math.max(zStack, itemZ);
    node.dataset.fishbowlSlot = entry.slotId;
    if (entry.item.type === "fish") applyFishArtFlip(node, fishFlipForSlot(entry.slotId));
    (isCenterLayer(entry.item.type) ? placedCenterEl : placedBottomEl).appendChild(node);
    slotPlacements.set(entry.slotId, node);
  }

  syncSlotFilledClasses();
  syncPaletteSelectionStyles();
  syncSlotTargetStyles();
}

function getPaletteColorIndex(item) {
  if (!item) return 0;
  const stored = paletteColorByItemId.get(item.id);
  return stored !== undefined ? stored : 0;
}

function paletteAriaLabel(item, colorIndex) {
  if (!item) return "Select item";
  return hasArtFamily(item)
    ? `Select ${item.label}, color ${(colorIndex % COLOR_COUNT) + 1} of ${COLOR_COUNT}`
    : `Select ${item.label}`;
}

function isFishArtEl(el) {
  return el?.classList?.contains("item-art--fish");
}

function applyFishArtFlip(el, flipped) {
  if (!isFishArtEl(el)) return;
  el.classList.toggle("is-flipped", Boolean(flipped));
}

function fishFlipForSlot(slotId) {
  return Boolean(FISH_SLOT_FLIPPED[slotId]);
}

function createItemArtElement(item, colorIndex, extraClass = "") {
  const n = colorIndex % COLOR_COUNT;
  const span = document.createElement("span");
  span.className = `item-art item-art--${item.artFamily} color-${n} ${extraClass}`.trim();
  span.setAttribute("role", "img");
  span.setAttribute("aria-hidden", "true");
  span.dataset.colorIndex = String(n);
  return span;
}

function getSourceImage(item) {
  if (!item?.src) return null;
  if (!sourceImageCache.has(item.id)) {
    const img = new Image();
    img.src = item.src;
    sourceImageCache.set(item.id, img);
  }
  return sourceImageCache.get(item.id);
}

function getPrimarySlotRectForItem(item) {
  if (!item) return null;
  if (item.id === "stones") return SLOT_BY_ID.get("stone-slot");
  if (item.id === "shell") return SLOT_BY_ID.get("shell-slot");
  if (item.id === "seaweed") return SLOT_BY_ID.get("seaweed-slot");
  if (item.type === "fish") {
    const a = SLOT_BY_ID.get("fish-slot-1");
    const b = SLOT_BY_ID.get("fish-slot-2");
    return { w: Math.max(a.w, b.w), h: Math.max(a.h, b.h) };
  }
  if (item.type === "star") return SLOT_BY_ID.get("seastar-slot");
  if (item.type === "bubble") return SLOT_BY_ID.get("bubble-slot");
  if (item.id === "sand" || item.id === "pebble") return SLOT_BY_ID.get("bottom-slot");
  return null;
}

function computeItemDisplayMetrics(item) {
  const slot = getPrimarySlotRectForItem(item);
  if (!slot || !sceneEl) return null;
  let nw;
  let nh;
  if (hasArtFamily(item)) {
    const box = ART_VIEW_BOX[item.artFamily];
    if (!box) return null;
    nw = box.w;
    nh = box.h;
  } else {
    const img = getSourceImage(item);
    if (!img?.naturalWidth) return null;
    nw = img.naturalWidth;
    nh = img.naturalHeight;
  }
  const r = sceneEl.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const scale = Math.min(
    ((slot.w / 100) * r.width * SLOT_ITEM_FILL) / nw,
    ((slot.h / 100) * r.height * SLOT_ITEM_FILL) / nh,
  );
  const widthPx = nw * scale;
  const heightPx = nh * scale;
  return {
    widthPct: (widthPx / r.width) * 100,
    heightPct: (heightPx / r.height) * 100,
    widthPx,
    heightPx,
  };
}

function applyItemMetrics(node, item, palette = false) {
  const m = computeItemDisplayMetrics(item);
  if (!m) return;
  if (palette) {
    node.style.width = `${m.widthPx}px`;
    node.style.height = `${m.heightPx}px`;
  } else {
    node.style.width = `${m.widthPct}%`;
    node.style.height = `${m.heightPct}%`;
  }
}

function bindItemLayout(node, item, palette = false) {
  if (hasArtFamily(item)) {
    applyItemMetrics(node, item, palette);
    return;
  }
  const img = getSourceImage(item);
  if (!img) return;
  const apply = () => applyItemMetrics(node, item, palette);
  if (img.complete && img.naturalWidth) apply();
  else img.addEventListener("load", apply, { once: true });
}

function createPlacedItem(item, xPct, yPct, colorIndex = null) {
  const color =
    colorIndex !== null && colorIndex !== undefined
      ? colorIndex % COLOR_COUNT
      : getPaletteColorIndex(item);
  let node;
  if (hasArtFamily(item)) {
    node = createItemArtElement(item, color, "placed-item");
  } else {
    node = document.createElement("img");
    node.src = item.src;
    node.alt = "";
    node.className = "placed-item";
  }
  node.dataset.itemId = item.id;
  if (hasArtFamily(item)) node.dataset.colorIndex = String(color);
  node.style.left = `${xPct}%`;
  node.style.top = `${yPct}%`;
  node.style.zIndex = String(++zStack);
  bindItemLayout(node, item);
  return node;
}

function createPaletteVisual(item) {
  if (hasArtFamily(item)) {
    const node = createItemArtElement(item, getPaletteColorIndex(item), "palette-item-visual");
    if (item.id === "fish") applyFishArtFlip(node, PALETTE_FISH_FLIPPED);
    return node;
  }
  const img = document.createElement("img");
  img.className = "palette-item-visual";
  img.src = item.src;
  img.alt = "";
  img.draggable = false;
  return img;
}

function bowlRightEdgePctAtY(yPct) {
  const dy = (yPct - BOWL.cy) / BOWL.ry;
  if (dy <= -1) return BOWL.cx;
  if (dy >= 1) return BOWL.cx + BOWL.rx;
  return BOWL.cx + BOWL.rx * Math.sqrt(1 - dy * dy);
}

function keepPaletteRectOutsideBowl(rect) {
  let minLeft = 0;
  for (let i = 0; i < 5; i += 1) {
    const y = rect.y + (rect.h * i) / 4;
    minLeft = Math.max(minLeft, bowlRightEdgePctAtY(y) + BOWL_PALETTE_GAP);
  }
  return rect.x >= minLeft ? rect : { ...rect, x: clamp(minLeft, 0, 100 - rect.w) };
}

function getPaletteAccessRect(item) {
  const anchor = PALETTE_CENTER_BY_ID.get(item.id);
  if (!anchor) return null;
  if (item.id === "sand" || item.id === "pebble") {
    const bottom = SLOT_BY_ID.get("bottom-slot");
    const w = bottom.w * PALETTE_BOTTOM_HIT_WIDTH_FRAC;
    const h = bottom.h;
    return {
      x: clamp(anchor.cx - w / 2, 0, 100 - w),
      y: clamp(anchor.cy - h / 2, 0.15, 100 - h - 0.15),
      w,
      h,
    };
  }
  const slot = getPrimarySlotRectForItem(item);
  if (!slot?.w) return null;
  return keepPaletteRectOutsideBowl({
    x: clamp(anchor.cx - slot.w / 2, 0, 100 - slot.w),
    y: clamp(anchor.cy - slot.h / 2, 0.15, 100 - slot.h - 0.15),
    w: slot.w,
    h: slot.h,
  });
}

function slotAccepts(slotId, item) {
  if (!item) return false;
  switch (slotId) {
    case "fish-slot-1":
    case "fish-slot-2":
      return item.type === "fish";
    case "seastar-slot":
      return item.type === "star";
    case "bubble-slot":
      return item.type === "bubble";
    case "seaweed-slot":
      return item.id === "seaweed";
    case "stone-slot":
      return item.id === "stones";
    case "shell-slot":
      return item.id === "shell";
    case "bottom-slot":
      return item.id === "sand" || item.id === "pebble";
    default:
      return false;
  }
}

function getPlacedCount(itemId) {
  return (
    placedBottomEl.querySelectorAll(`[data-item-id="${itemId}"]`).length +
    placedCenterEl.querySelectorAll(`[data-item-id="${itemId}"]`).length
  );
}

function sceneRect() {
  return sceneEl.getBoundingClientRect();
}

function clientToScenePercent(clientX, clientY) {
  const r = sceneRect();
  return { xPct: ((clientX - r.left) / r.width) * 100, yPct: ((clientY - r.top) / r.height) * 100 };
}

function scenePercentToClient(xPct, yPct) {
  const r = sceneRect();
  return { x: r.left + (xPct / 100) * r.width, y: r.top + (yPct / 100) * r.height };
}

function projectIntoBowl(clientX, clientY) {
  const r = sceneRect();
  const cx = r.left + (BOWL.cx / 100) * r.width;
  const cy = r.top + (BOWL.cy / 100) * r.height;
  const rx = (BOWL.rx / 100) * r.width;
  const ry = (BOWL.ry / 100) * r.height;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const metric = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  if (metric <= 1) return { x: clientX, y: clientY };
  const s = 1 / Math.sqrt(metric);
  return { x: cx + dx * s, y: cy + dy * s };
}

function overlapsAnyPlaced(clientX, clientY, excludeElement, itemToPlace = null) {
  let newRadius = null;
  if (itemToPlace) {
    const m = computeItemDisplayMetrics(itemToPlace);
    if (m) newRadius = Math.max(m.widthPx, m.heightPx) * 0.46;
  }
  for (const el of sceneEl.querySelectorAll(".placed-item")) {
    if (el === excludeElement || el.style.visibility === "hidden") continue;
    if (el.dataset.itemId === "sand" || el.dataset.itemId === "pebble") continue;
    const br = el.getBoundingClientRect();
    if (br.width < 2 || br.height < 2) continue;
    const ro = Math.max(br.width, br.height) * 0.46;
    const ox = br.left + br.width / 2;
    const oy = br.top + br.height / 2;
    if (Math.hypot(clientX - ox, clientY - oy) < ro + (newRadius ?? ro) * 0.95) return true;
  }
  return false;
}

function placeItemInSlot(slotId, item) {
  if (!item || !slotAccepts(slotId, item)) return false;
  const slot = SLOT_BY_ID.get(slotId);
  if (!slot) return false;
  const prevEl = slotPlacements.get(slotId);
  if (getPlacedCount(item.id) >= MAX_PER_ITEM && (!prevEl || prevEl.dataset.itemId !== item.id)) {
    return false;
  }
  const { x: clientX, y: clientY } = scenePercentToClient(slot.x + slot.w / 2, slot.y + slot.h / 2);
  const p = projectIntoBowl(clientX, clientY);
  if (!p || overlapsAnyPlaced(p.x, p.y, prevEl || null, item)) return false;
  prevEl?.remove();
  slotPlacements.delete(slotId);
  const { xPct, yPct } = clientToScenePercent(p.x, p.y);
  const node = createPlacedItem(item, xPct, yPct);
  node.dataset.fishbowlSlot = slotId;
  if (item.type === "fish") applyFishArtFlip(node, fishFlipForSlot(slotId));
  (isCenterLayer(item.type) ? placedCenterEl : placedBottomEl).appendChild(node);
  slotPlacements.set(slotId, node);
  syncSlotFilledClasses();
  syncSlotTargetStyles();
  sessionSync.publish(squidlyAPI);
  return true;
}

function selectItem(itemId) {
  selectedItemId = itemId;
  syncPaletteSelectionStyles();
  syncSlotTargetStyles();
}

function updatePaletteArt(wrap) {
  const item = getItemById(wrap?.dataset?.itemId);
  const visual = wrap?.querySelector(".palette-item-visual");
  if (!item || !visual || !hasArtFamily(item)) return;
  const n = getPaletteColorIndex(item) % COLOR_COUNT;
  visual.className = `item-art item-art--${item.artFamily} color-${n} palette-item-visual`;
  if (item.id === "fish") applyFishArtFlip(visual, PALETTE_FISH_FLIPPED);
  visual.dataset.colorIndex = String(n);
  wrap.dataset.colorIndex = String(n);
  wrap.querySelector(".hotspot")?.setAttribute("aria-label", paletteAriaLabel(item, n));
}

function syncPaletteSelectionStyles() {
  hotspotsEl.querySelectorAll(".access-wrap--palette").forEach((wrap) => {
    const item = getItemById(wrap.dataset.itemId);
    const selected = wrap.dataset.itemId === selectedItemId;
    wrap.classList.toggle("palette-ingredient-selected", selected);
    if (selected && item?.artFamily) wrap.dataset.colorIndex = String(getPaletteColorIndex(item));
    else delete wrap.dataset.colorIndex;
    wrap.querySelector(".hotspot")?.setAttribute(
      "aria-label",
      paletteAriaLabel(item, getPaletteColorIndex(item)),
    );
  });
}

function syncSlotFilledClasses() {
  slotsAccessEl?.querySelectorAll(".access-wrap--fishbowl-slot").forEach((wrap) => {
    wrap.classList.toggle("fishbowl-slot--filled", slotPlacements.has(wrap.dataset.slotId));
  });
}

function syncSlotTargetStyles() {
  const item = getItemById(selectedItemId);
  slotsAccessEl?.classList.toggle("fishbowl-slots-access--ready", Boolean(item));
  document.querySelectorAll(".access-wrap--fishbowl-slot").forEach((wrap) => {
    wrap.classList.toggle("slot-drop-ready", Boolean(item && slotAccepts(wrap.dataset.slotId, item)));
  });
  sceneEl.querySelectorAll(".placed-item--slot-drop-ready").forEach((el) => {
    el.classList.remove("placed-item--slot-drop-ready");
  });
  if (!item) return;
  for (const [slotId, el] of slotPlacements) {
    if (el.isConnected && slotAccepts(slotId, item)) el.classList.add("placed-item--slot-drop-ready");
  }
}

function activatePaletteWrap(wrap) {
  const item = getItemById(wrap?.dataset?.itemId);
  if (!item) return;
  if (item.id === "sand" || item.id === "pebble") {
    placeItemInSlot("bottom-slot", item);
    return;
  }
  if (selectedItemId === item.id && hasArtFamily(item)) {
    paletteColorByItemId.set(item.id, (getPaletteColorIndex(item) + 1) % COLOR_COUNT);
    updatePaletteArt(wrap);
    syncPaletteSelectionStyles();
    return;
  }
  selectItem(item.id);
}

function activateSlotWrap(wrap) {
  const item = getItemById(selectedItemId);
  if (item && wrap?.dataset?.slotId) placeItemInSlot(wrap.dataset.slotId, item);
}

function resetBowl() {
  placedBottomEl.innerHTML = "";
  placedCenterEl.innerHTML = "";
  slotPlacements.clear();
  zStack = 1;
  selectedItemId = null;
  paletteColorByItemId.clear();
  syncPaletteSelectionStyles();
  syncSlotTargetStyles();
  syncSlotFilledClasses();
  sessionSync.publish(squidlyAPI);
}

function refreshAllItemVisualSizes() {
  sceneEl.querySelectorAll(".placed-item").forEach((node) => {
    const item = getItemById(node.dataset.itemId);
    if (item) applyItemMetrics(node, item);
  });
  hotspotsEl.querySelectorAll(".palette-item-visual").forEach((node) => {
    const item = getItemById(node.closest(".access-wrap--palette")?.dataset?.itemId);
    if (item) applyItemMetrics(node, item, true);
  });
}

function renderFishbowlSlotsAccess() {
  if (!slotsAccessEl) return;
  slotsAccessEl.innerHTML = "";
  SLOT_LAYOUT.forEach((slot, i) => {
    const art = document.createElement("img");
    art.className = "fishbowl-slot-art";
    art.src = slot.art;
    art.alt = "";
    art.draggable = false;
    const dropBtn = document.createElement("button");
    dropBtn.type = "button";
    dropBtn.className = "fishbowl-slot-drop";
    dropBtn.setAttribute("aria-label", `Place item in ${slot.id}`);
    dropBtn.addEventListener("click", (e) => {
      e.preventDefault();
      activateSlotWrap(dropBtn.closest(".access-wrap--fishbowl-slot"));
    });
    const wrap = document.createElement("access-button");
    wrap.className = "access-wrap access-wrap--fishbowl-slot";
    wrap.dataset.slotId = slot.id;
    wrap.setAttribute("access-group", SLOT_ACCESS_GROUP);
    wrap.setAttribute("access-order", String(i + 1));
    wrap.style.cssText = `left:${slot.x}%;top:${slot.y}%;width:${slot.w}%;height:${slot.h}%`;
    wrap.addEventListener("access-click", (e) => activateSlotWrap(e.currentTarget));
    wrap.append(art, dropBtn);
    slotsAccessEl.appendChild(wrap);
  });
}

function renderPaletteHotspots() {
  hotspotsEl.innerHTML = "";
  PALETTE_CENTERS.forEach((anchor, idx) => {
    const item = getItemById(anchor.id);
    const rect = item && getPaletteAccessRect(item);
    if (!item || !rect) return;
    const art = createPaletteVisual(item);
    const hotspotButton = document.createElement("button");
    hotspotButton.type = "button";
    hotspotButton.className = "hotspot";
    hotspotButton.dataset.itemId = item.id;
    hotspotButton.setAttribute("aria-label", paletteAriaLabel(item, getPaletteColorIndex(item)));
    hotspotButton.addEventListener("click", (e) => {
      e.preventDefault();
      activatePaletteWrap(hotspotButton.closest(".access-wrap--palette"));
    });
    const wrap = document.createElement("access-button");
    wrap.className = "access-wrap access-wrap--palette";
    wrap.dataset.itemId = item.id;
    wrap.setAttribute("access-group", PALETTE_ACCESS_GROUP);
    wrap.setAttribute("access-order", String(idx + 1));
    wrap.style.cssText = `left:${rect.x}%;top:${rect.y}%;width:${rect.w}%;height:${rect.h}%`;
    wrap.addEventListener("access-click", (e) => activatePaletteWrap(e.currentTarget));
    wrap.append(art, hotspotButton);
    hotspotsEl.appendChild(wrap);
    bindItemLayout(art, item, true);
  });
  syncPaletteSelectionStyles();
}

RESOURCE_ITEMS.forEach((item) => {
  if (item.src) getSourceImage(item);
});
renderFishbowlSlotsAccess();
renderPaletteHotspots();
refreshAllItemVisualSizes();
syncSlotTargetStyles();
resetBtn?.addEventListener("click", resetBowl);
resetAccessBtn?.addEventListener("access-click", resetBowl);
window.addEventListener("resize", refreshAllItemVisualSizes);
initBackToHub();
if (squidlyAPI?.addSessionInfoListener) {
  squidlyAPI.addSessionInfoListener((info) => sessionSync.init(info, squidlyAPI));
} else {
  sessionSync.init(null, squidlyAPI);
}

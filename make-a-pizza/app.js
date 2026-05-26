import { initBackToHub } from "../shared/back-nav.js";
import { createSessionSync } from "../shared/session-sync.js";

const TOPPINGS = [
  { id: "pepper", src: "./resources/pepper.svg", label: "Green pepper" },
  { id: "pepperoni", src: "./resources/pepperoni.svg", label: "Pepperoni" },
  { id: "mushroom", src: "./resources/mushroom.svg", label: "Mushroom" },
  { id: "tomato", src: "./resources/tomato.svg", label: "Tomato slice" },
];

const DESIGN_WIDTH = 1920;
const BASE_ITEM_SCALE = 1;
const MAX_PER_ITEM = 8;
const PIZZA_CENTER = { xPct: 40, yPct: 50 };
const PIZZA_RADIUS = { xPct: 25, yPct: 32 };
const INGREDIENT_ACCESS_GROUP = "ingredient-palette";

const HOTSPOTS = [
  { id: "pepper", x: 85.6, y: 13.311, w: 11.667, h: 23.925 },
  { id: "pepperoni", x: 85.666, y: 38.013, w: 11.302, h: 14.126 },
  { id: "tomato", x: 83.332, y: 56.764, w: 13.775, h: 17.502 },
  { id: "mushroom", x: 85.078, y: 74.802, w: 10.133, h: 13.161 },
];

const sceneEl = document.getElementById("scene");
const hotspotsEl = document.getElementById("hotspots");
const placedLayerEl = document.getElementById("placed-layer");
const pizzaAccessLayerEl = document.getElementById("pizza-access-layer");
const resetBtn = document.getElementById("reset-btn");
const resetAccessBtn = document.getElementById("reset-access-btn");
const squidlyAPI = window.SquidlyAPI;

let drag = null;
let zStack = 1;
let selectedItemId = null;

const sourceImageCache = new Map();

const sessionSync = createSessionSync({
  gameSlug: "make-a-pizza",
  serialize: serializePlacedState,
  apply: applyPlacedState,
});

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

function placedItemWidthPercentFromNatural(naturalWidth) {
  if (!naturalWidth || !DESIGN_WIDTH) return 8;
  return (naturalWidth / DESIGN_WIDTH) * 100 * BASE_ITEM_SCALE;
}

function placedItemWidthPxFromNatural(naturalWidth) {
  const sceneW = sceneEl?.getBoundingClientRect()?.width ?? 0;
  if (!sceneW || !naturalWidth) return 100;
  return (placedItemWidthPercentFromNatural(naturalWidth) / 100) * sceneW;
}

function bindPlacedItemLayout(img) {
  const apply = () => {
    const nw = img.naturalWidth;
    if (!nw) return;
    img.style.width = `${placedItemWidthPercentFromNatural(nw)}%`;
    img.style.height = "auto";
  };
  if (img.complete) {
    apply();
  } else {
    img.addEventListener("load", apply, { once: true });
  }
}

function sizeDragPreviewToScene(preview) {
  const apply = () => {
    const nw = preview.naturalWidth;
    if (!nw) return;
    preview.style.width = `${placedItemWidthPxFromNatural(nw)}px`;
    preview.style.height = "auto";
  };
  if (preview.complete) {
    apply();
  } else {
    preview.addEventListener("load", apply, { once: true });
  }
}

function getPlacedCount(itemId) {
  return placedLayerEl.querySelectorAll(`[data-item-id="${itemId}"]`).length;
}

function serializePlacedState() {
  const items = Array.from(placedLayerEl.querySelectorAll(".placed-item"))
    .map((node) => {
      const itemId = node.dataset.itemId;
      const left = Number.parseFloat(node.style.left);
      const top = Number.parseFloat(node.style.top);
      const z = Number.parseInt(node.style.zIndex || "1", 10);
      if (!itemId || !Number.isFinite(left) || !Number.isFinite(top)) return null;
      return {
        itemId,
        xPct: Number(left.toFixed(3)),
        yPct: Number(top.toFixed(3)),
        z: Number.isFinite(z) ? z : 1,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.z - b.z);
  return JSON.stringify({ v: 1, items });
}

function applyPlacedState(statePayload) {
  if (typeof statePayload !== "string" || !statePayload.trim()) return;
  let parsed;
  try {
    parsed = JSON.parse(statePayload);
  } catch {
    return;
  }
  if (!parsed || !Array.isArray(parsed.items)) return;

  cleanupDragPreview();
  placedLayerEl.innerHTML = "";
  zStack = 1;

  parsed.items
    .filter((item) => item && getItemById(item.itemId))
    .sort((a, b) => (a.z || 1) - (b.z || 1))
    .forEach((item) => {
      const node = createPlacedItem(getItemById(item.itemId), item.xPct, item.yPct);
      const itemZ = Number.isFinite(item.z) ? item.z : zStack + 1;
      node.style.zIndex = String(itemZ);
      zStack = Math.max(zStack, itemZ);
      placedLayerEl.appendChild(node);
    });
}

function createPlacedItem(item, xPct, yPct) {
  const img = document.createElement("img");
  img.src = item.src;
  img.alt = "";
  img.className = "placed-item placed-item--draggable";
  img.dataset.itemId = item.id;
  img.style.left = `${xPct}%`;
  img.style.top = `${yPct}%`;
  img.style.zIndex = String(++zStack);

  bindPlacedItemLayout(img);

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

function scenePercentToClient(xPct, yPct) {
  const r = sceneEl.getBoundingClientRect();
  return {
    x: r.left + (xPct / 100) * r.width,
    y: r.top + (yPct / 100) * r.height,
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

function isPizzaAreaAllowedAtClient(clientX, clientY) {
  const sceneRect = sceneEl?.getBoundingClientRect();
  if (!sceneRect) return false;
  const xPct = ((clientX - sceneRect.left) / sceneRect.width) * 100;
  const yPct = ((clientY - sceneRect.top) / sceneRect.height) * 100;
  const dx = (xPct - PIZZA_CENTER.xPct) / PIZZA_RADIUS.xPct;
  const dy = (yPct - PIZZA_CENTER.yPct) / PIZZA_RADIUS.yPct;
  return Number.isFinite(dx) && Number.isFinite(dy) && (dx * dx + dy * dy <= 1);
}

function tryPlacementClientPosition(clientX, clientY, excludeElement) {
  if (overlapsAnyPlaced(clientX, clientY, excludeElement)) return null;
  if (!isPizzaAreaAllowedAtClient(clientX, clientY)) return null;
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
  selectedItemId = null;
  syncSelectionStyles();
  sessionSync.publish(squidlyAPI);
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

  sizeDragPreviewToScene(preview);

  if (e.currentTarget && typeof e.currentTarget.setPointerCapture === "function") {
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  attachGlobalPointerListeners();
}

function syncSelectionStyles() {
  hotspotsEl.querySelectorAll(".access-wrap--ingredient").forEach((wrap) => {
    wrap.classList.toggle("ingredient-selected", wrap.dataset.itemId === selectedItemId);
  });
  pizzaAccessLayerEl?.classList.toggle("pizza-access-layer--ready", Boolean(selectedItemId));
}

function selectItem(itemId) {
  selectedItemId = itemId;
  syncSelectionStyles();
}

function onHotspotPointerDown(e) {
  if (e.button !== 0) return;
  const target = e.currentTarget;
  const item = getItemById(target.dataset.itemId);
  if (!item) return;

  if (getPlacedCount(item.id) >= MAX_PER_ITEM) {
    return;
  }

  selectItem(item.id);
  beginPaletteDrag(e, item);
}

function onIngredientAccessClick(e) {
  const ingredientAccessButton = e.currentTarget;
  const item = getItemById(ingredientAccessButton.dataset.itemId);
  if (!item) return;
  if (getPlacedCount(item.id) >= MAX_PER_ITEM) return;
  selectItem(item.id);
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

  sizeDragPreviewToScene(preview);

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
    const placement = tryPlacementClientPosition(e.clientX, e.clientY, null);
    if (placement) {
      const { xPct, yPct } = clientToScenePercent(placement.x, placement.y);
      const node = createPlacedItem(drag.item, xPct, yPct);
      placedLayerEl.appendChild(node);
      selectItem(drag.item.id);
      sessionSync.publish(squidlyAPI);
    }
  } else if (drag.mode === "placed") {
    const { element, prevLeft, prevTop, prevVisibility } = drag;
    const placement = tryPlacementClientPosition(e.clientX, e.clientY, element);
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
    sessionSync.publish(squidlyAPI);
  }

  drag.preview.remove();
  drag = null;
}

function renderIngredientAccessButtons() {
  hotspotsEl.innerHTML = "";
  HOTSPOTS.forEach((hotspot, hotspotIndex) => {
    const item = getItemById(hotspot.id);
    if (!item) return;
    const paletteImg = document.createElement("img");
    paletteImg.className = "palette-ingredient-visual";
    paletteImg.src = item.src;
    paletteImg.alt = "";
    paletteImg.draggable = false;

    const hotspotButton = document.createElement("button");
    hotspotButton.type = "button";
    hotspotButton.className = "hotspot";
    hotspotButton.dataset.itemId = item.id;
    hotspotButton.setAttribute("aria-label", `place ${item.label}`);
    hotspotButton.addEventListener("pointerdown", onHotspotPointerDown);

    const ingredientAccessButton = document.createElement("access-button");
    ingredientAccessButton.className = "access-wrap access-wrap--ingredient";
    ingredientAccessButton.dataset.itemId = item.id;
    ingredientAccessButton.setAttribute("access-group", INGREDIENT_ACCESS_GROUP);
    ingredientAccessButton.setAttribute("access-order", String(hotspotIndex + 1));
    ingredientAccessButton.style.left = `${hotspot.x}%`;
    ingredientAccessButton.style.top = `${hotspot.y}%`;
    ingredientAccessButton.style.width = `${hotspot.w}%`;
    ingredientAccessButton.style.height = `${hotspot.h}%`;
    ingredientAccessButton.addEventListener("access-click", onIngredientAccessClick);
    ingredientAccessButton.appendChild(paletteImg);
    ingredientAccessButton.appendChild(hotspotButton);
    hotspotsEl.appendChild(ingredientAccessButton);
  });
  syncSelectionStyles();
}

function placeSelectedItemAtScenePercent(xPct, yPct) {
  const item = getItemById(selectedItemId);
  if (!item) return false;
  if (getPlacedCount(item.id) >= MAX_PER_ITEM) return false;

  const { x, y } = scenePercentToClient(xPct, yPct);
  const placement = tryPlacementClientPosition(x, y, null);
  if (!placement) return false;

  const scenePct = clientToScenePercent(placement.x, placement.y);
  const node = createPlacedItem(item, scenePct.xPct, scenePct.yPct);
  placedLayerEl.appendChild(node);
  sessionSync.publish(squidlyAPI);
  return true;
}

function onPizzaDropSlotAccessClick(e) {
  const wrap = e.currentTarget;
  const xPct = Number(wrap.dataset.slotXPct);
  const yPct = Number(wrap.dataset.slotYPct);
  if (!Number.isFinite(xPct) || !Number.isFinite(yPct)) return;
  placeSelectedItemAtScenePercent(xPct, yPct);
}

function initPizzaDropSlots() {
  pizzaAccessLayerEl?.querySelectorAll(".pizza-drop-slot").forEach((el) => {
    el.addEventListener("access-click", onPizzaDropSlotAccessClick);
  });
}

function preloadSourceImages() {
  TOPPINGS.forEach((item) => {
    getSourceImage(item);
  });
}

preloadSourceImages();
renderIngredientAccessButtons();
initPizzaDropSlots();
resetBtn?.addEventListener("click", resetPizza);
resetAccessBtn?.addEventListener("access-click", resetPizza);

initBackToHub();
if (squidlyAPI?.addSessionInfoListener) {
  squidlyAPI.addSessionInfoListener((info) => sessionSync.init(info, squidlyAPI));
} else {
  sessionSync.init(null, squidlyAPI);
}

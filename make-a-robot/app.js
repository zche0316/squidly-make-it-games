import { initBackToHub } from "../shared/back-nav.js";
import { createSessionSync } from "../shared/session-sync.js";

const sceneEl = document.getElementById("scene");
const sceneBgEl = document.getElementById("scene-bg");
const robotLayerEl = document.getElementById("robot-layer");
const categoryAccessEl = document.getElementById("category-access");
const pickerLayerEl = document.getElementById("picker-layer");
const pickerTitleEl = document.getElementById("picker-title");
const pickerBackWrapEl = document.getElementById("picker-back-wrap");
const pickerBackBtn = document.getElementById("picker-back");
const pickerGridEl = document.getElementById("picker-grid");
const resetBtn = document.getElementById("reset-btn");
const resetAccessBtn = document.getElementById("reset-access-btn");
const squidlyAPI = window.SquidlyAPI;

const BACKGROUND_P1 = "./resources/backgrounds/p1.png";
const BACKGROUND_LOCATION = "./resources/backgrounds/background-location.png";
const ROBOT_LAYOUT_URL = "./resources/robot-layout.json";

let robotLayout = null;

const CATEGORY_ACCESS_GROUP = "robot-category";
const PICKER_ACCESS_GROUP = "robot-picker";
/** Head/body: 3 types × 4 variants (ids 1–4, 5–8, 9–12). */
const HEAD_BODY_COLORS_PER_SHAPE = 4;
/** Arms/legs: 3 types in 6-id bands (1, 7, 13); only the first 4 per band are used (5–6, 11–12, 17–18 unused). */
const PAIR_LIMB_ID_BAND = 6;
const PAIR_LIMB_VARIANTS_SHOWN = 4;
const LIMB_SHAPE_COUNT = 3;

const CATEGORIES = [
  { key: "head", label: "Head", title: "Choose a head" },
  { key: "body", label: "Body", title: "Choose a body" },
  { key: "arms", label: "Arms", title: "Choose arms" },
  { key: "legs", label: "Legs", title: "Choose legs" },
  { key: "wheels", label: "Wheels", title: "Choose wheels" },
];

/** Left dock: ~15×11% cells, spaced for Squidly eye-gaze (16:9 scene baseline). */
const CATEGORY_TRIGGERS = [
  { key: "head", left: 2, top: 3, w: 15, h: 11 },
  { key: "body", left: 2, top: 16, w: 15, h: 11 },
  { key: "arms", left: 2, top: 29, w: 15, h: 11 },
  { key: "legs", left: 2, top: 42, w: 15, h: 11 },
  { key: "wheels", left: 2, top: 55, w: 15, h: 11 },
];

let catalog = null;

const imageAvailability = new Map();
const resolvedSrcCache = new Map();

let state = {
  openCategory: null,
  pickerStep: null,
  pickerShapeIndex: null,
  selectedHead: null,
  selectedBody: null,
  selectedArms: null,
  selectedLegs: null,
  selectedWheel: null,
};

const sessionSync = createSessionSync({
  gameSlug: "make-a-robot",
  serialize: serializeRobotState,
  apply: applyRobotState,
});

function serializeRobotState() {
  return JSON.stringify({
    v: 1,
    head: state.selectedHead?.id ?? null,
    body: state.selectedBody?.id ?? null,
    arms: state.selectedArms?.id ?? null,
    legs: state.selectedLegs?.id ?? null,
    wheel: state.selectedWheel?.id ?? null,
  });
}

async function applyRobotState(statePayload) {
  if (typeof statePayload !== "string" || !statePayload.trim()) return;
  let parsed;
  try {
    parsed = JSON.parse(statePayload);
  } catch {
    return;
  }
  if (parsed?.v !== 1) return;

  await ensureCatalogLoaded();

  state.openCategory = null;
  state.pickerStep = null;
  state.pickerShapeIndex = null;
  state.selectedHead = null;
  state.selectedBody = null;
  state.selectedArms = null;
  state.selectedLegs = null;
  state.selectedWheel = null;

  const applyPart = async (categoryKey, id) => {
    if (!id || typeof id !== "string") return;
    const list = getCatalogListForCategory(categoryKey);
    const rawItem = list.find((item) => item.id === id);
    if (rawItem) await applySelection(categoryKey, rawItem);
  };

  await applyPart("head", parsed.head);
  await applyPart("body", parsed.body);
  await applyPart("arms", parsed.arms);
  await applyPart("legs", parsed.legs);
  await applyPart("wheels", parsed.wheel);

  await render();
}

async function ensureCatalogLoaded() {
  if (catalog) return;
  try {
    const res = await fetch("./resources-catalog.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    catalog = await res.json();
  } catch {
    catalog = { heads: [], bodies: [], arms: [], legs: [], wheels: [] };
  }
}

function verifyImageExists(src) {
  const cached = imageAvailability.get(src);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      imageAvailability.set(src, true);
      resolve(true);
    };
    image.onerror = () => {
      imageAvailability.set(src, false);
      resolve(false);
    };
    image.src = src;
  });
}

function svgToPng(src) {
  return src.replace(/\.svg$/i, ".png");
}

function idNumberFromKey(id, prefix) {
  const match = String(id).match(new RegExp(`^${prefix}-(\\d+)$`));
  return match ? match[1] : null;
}

/** One PNG per pair (both limbs on one sheet), e.g. arms1/arms1.png, legs4/legs4.png */
function pairPngCandidates(kind, n) {
  const folderVariants = [`${kind}${n}`, `${kind}${n}.png`, `${kind}${n}.svg`];
  const candidates = [];
  for (const folder of folderVariants) {
    candidates.push(`./resources/${kind}/${folder}/${folder}.png`);
    candidates.push(`./resources/${kind}/${folder}/${kind}${n}.png`);
  }
  if (kind === "legs" && n === 14) {
    candidates.push("./resources/legs/legs13/legs14.png");
  }
  return [...new Set(candidates)];
}

async function resolvePairPng(kind, n) {
  const cacheKey = `pair::${kind}::${n}`;
  if (resolvedSrcCache.has(cacheKey)) {
    return resolvedSrcCache.get(cacheKey);
  }
  for (const candidate of pairPngCandidates(kind, n)) {
    if (await verifyImageExists(candidate)) {
      resolvedSrcCache.set(cacheKey, candidate);
      return candidate;
    }
  }
  resolvedSrcCache.set(cacheKey, null);
  return null;
}

const HEAD_SHAPE_ASSET_PREFIXES = ["head-round", "head-rec", "head-square"];
const BODY_SHAPE_ASSET_PREFIXES = ["body-round", "body-rec", "body-tr"];

function isPairLimbCategory(categoryKey) {
  return categoryKey === "arms" || categoryKey === "legs";
}

function idBandSizeForCategory(categoryKey) {
  return isPairLimbCategory(categoryKey) ? PAIR_LIMB_ID_BAND : HEAD_BODY_COLORS_PER_SHAPE;
}

function pickerVariantsForCategory(categoryKey) {
  return isPairLimbCategory(categoryKey) ? PAIR_LIMB_VARIANTS_SHOWN : HEAD_BODY_COLORS_PER_SHAPE;
}

function shapeCountForCategory(categoryKey) {
  if (categoryKey === "head" || categoryKey === "body" || isPairLimbCategory(categoryKey)) {
    return LIMB_SHAPE_COUNT;
  }
  return 1;
}

function shapedAssetCandidates(prefixes, folder, numericId) {
  const num = Number(numericId);
  if (!num) return [];
  const shapeIndex = Math.floor((num - 1) / HEAD_BODY_COLORS_PER_SHAPE);
  const colorIndex = (num - 1) % HEAD_BODY_COLORS_PER_SHAPE;
  const candidates = [];
  const prefix = prefixes[shapeIndex];
  if (prefix && colorIndex < HEAD_BODY_COLORS_PER_SHAPE) {
    const base = `${prefix}-${colorIndex + 1}`;
    candidates.push(
      `./resources/${folder}/${base}.svg`,
      `./resources/${folder}/${base}.png`
    );
  }
  return candidates;
}

function candidateSrcsForCatalogPath(src, itemId) {
  const candidates = [];

  const headN = idNumberFromKey(itemId, "head");
  if (headN) {
    candidates.push(...shapedAssetCandidates(HEAD_SHAPE_ASSET_PREFIXES, "head", headN));
  }

  const bodyN = idNumberFromKey(itemId, "body");
  if (bodyN) {
    candidates.push(...shapedAssetCandidates(BODY_SHAPE_ASSET_PREFIXES, "body", bodyN));
  }

  if (src) candidates.push(src);
  const png = svgToPng(src);
  if (png && png !== src) candidates.push(png);

  const armsN = idNumberFromKey(itemId, "arms");
  if (armsN) {
    candidates.push(...pairPngCandidates("arms", armsN));
  }

  const legsN = idNumberFromKey(itemId, "legs");
  if (legsN) {
    candidates.push(...pairPngCandidates("legs", legsN));
  }

  const wheelN = idNumberFromKey(itemId, "wheel");
  if (wheelN) {
    candidates.push(
      `./resources/legs/legs-wheels/legs-wheels-${wheelN}.png`,
      `./resources/legs/legs-wheels/legs-wheels-${wheelN}.svg`
    );
  }

  return [...new Set(candidates.filter(Boolean))];
}

async function resolvePartSrc(src, itemId = "") {
  const cacheKey = `${itemId}::${src}`;
  if (resolvedSrcCache.has(cacheKey)) {
    return resolvedSrcCache.get(cacheKey);
  }
  const candidates = candidateSrcsForCatalogPath(src, itemId);
  for (const candidate of candidates) {
    if (await verifyImageExists(candidate)) {
      resolvedSrcCache.set(cacheKey, candidate);
      return candidate;
    }
  }
  resolvedSrcCache.set(cacheKey, null);
  return null;
}

async function resolvePairItem(item, kind) {
  if (!item?.id) return null;
  const n = idNumberFromKey(item.id, kind);
  if (!n) return null;
  const pairSrc = await resolvePairPng(kind, n);
  if (!pairSrc) return null;
  return { ...item, pairSrc };
}

async function resolveSingleItem(item) {
  if (!item) return null;
  const src = await resolvePartSrc(item.src, item.id);
  if (!src) return null;
  return { ...item, src };
}

function wheelsEnabled() {
  return (catalog?.wheels?.length ?? 0) > 0;
}

function getCategoryTriggers() {
  return wheelsEnabled()
    ? CATEGORY_TRIGGERS
    : CATEGORY_TRIGGERS.filter((t) => t.key !== "wheels");
}

function getCatalogListForCategory(categoryKey) {
  if (!catalog) return [];
  switch (categoryKey) {
    case "head":
      return catalog.heads || [];
    case "body":
      return catalog.bodies || [];
    case "arms":
      return catalog.arms || [];
    case "legs":
      return catalog.legs || [];
    case "wheels":
      return catalog.wheels || [];
    default:
      return [];
  }
}

function getSelectedForCategory(categoryKey) {
  switch (categoryKey) {
    case "head":
      return state.selectedHead;
    case "body":
      return state.selectedBody;
    case "arms":
      return state.selectedArms;
    case "legs":
      return state.selectedLegs;
    case "wheels":
      return state.selectedWheel;
    default:
      return null;
  }
}

function isItemSelected(categoryKey, itemId) {
  const selected = getSelectedForCategory(categoryKey);
  return selected?.id === itemId;
}

function idPrefixForCategory(categoryKey) {
  switch (categoryKey) {
    case "head":
      return "head";
    case "body":
      return "body";
    case "arms":
      return "arms";
    case "legs":
      return "legs";
    case "wheels":
      return "wheel";
    default:
      return "";
  }
}

function shapeColorIndicesFromItem(categoryKey, item) {
  const prefix = idPrefixForCategory(categoryKey);
  const n = idNumberFromKey(item?.id, prefix);
  if (!n) return { shapeIndex: 0, colorIndex: 0 };
  const num = Number(n);
  if (categoryKey === "wheels") {
    return { shapeIndex: 0, colorIndex: num - 1 };
  }
  const band = idBandSizeForCategory(categoryKey);
  return {
    shapeIndex: Math.floor((num - 1) / band),
    colorIndex: (num - 1) % band,
  };
}

function getSelectedShapeIndex(categoryKey) {
  const selected = getSelectedForCategory(categoryKey);
  if (!selected?.id) return null;
  return shapeColorIndicesFromItem(categoryKey, selected).shapeIndex;
}

function isShapeHighlighted(categoryKey, shapeIndex) {
  if (state.pickerShapeIndex === shapeIndex) return true;
  const selected = getSelectedForCategory(categoryKey);
  if (!selected?.id) return false;
  return shapeColorIndicesFromItem(categoryKey, selected).shapeIndex === shapeIndex;
}

function buildPickerModel(categoryKey, items) {
  const valid = items.filter((item) => item?.id);
  if (categoryKey === "wheels") {
    const variants = [...valid]
      .sort((a, b) => {
        const na = Number(idNumberFromKey(a.id, "wheel")) || 0;
        const nb = Number(idNumberFromKey(b.id, "wheel")) || 0;
        return na - nb;
      })
      .slice(0, pickerVariantsForCategory("wheels"));
    return { shapes: [{ shapeIndex: 0, variants, previewItem: variants[0] || null }] };
  }

  const variantLimit = pickerVariantsForCategory(categoryKey);
  const shapeCount = shapeCountForCategory(categoryKey);
  const byShape = new Map();

  if (isPairLimbCategory(categoryKey)) {
    for (let s = 0; s < shapeCount; s++) {
      byShape.set(s, { shapeIndex: s, variants: [], previewItem: null });
    }
  }

  for (const item of valid) {
    const { shapeIndex, colorIndex } = shapeColorIndicesFromItem(categoryKey, item);
    if (shapeIndex < 0 || shapeIndex >= shapeCount) continue;
    if (!byShape.has(shapeIndex)) {
      byShape.set(shapeIndex, { shapeIndex, variants: [], previewItem: null });
    }
    const group = byShape.get(shapeIndex);
    if (colorIndex < variantLimit) {
      group.variants[colorIndex] = item;
    }
  }

  const shapes = [...byShape.values()].sort((a, b) => a.shapeIndex - b.shapeIndex);
  for (const shape of shapes) {
    shape.variants = shape.variants.slice(0, variantLimit);
    shape.previewItem = shape.variants.find(Boolean) || null;
  }
  return { shapes };
}

function resetPickerForCategory(categoryKey) {
  state.pickerStep = categoryKey === "wheels" ? "color" : "shape";
  state.pickerShapeIndex =
    categoryKey === "wheels" ? 0 : getSelectedShapeIndex(categoryKey);
}

function pickerTitleForStep(categoryKey, step) {
  const meta = CATEGORIES.find((c) => c.key === categoryKey);
  const part = meta?.label?.toLowerCase() || categoryKey;
  if (step === "shape") return `Choose a ${part} shape`;
  return "Choose a color";
}

function pickerItemCount(categoryKey, step) {
  if (categoryKey === "wheels") {
    const count = catalog?.wheels?.length ?? 0;
    return count > 0 ? count : HEAD_BODY_COLORS_PER_SHAPE;
  }
  if (step === "shape") return shapeCountForCategory(categoryKey);
  return pickerVariantsForCategory(categoryKey);
}

function applyPickerGridLayout(categoryKey, step) {
  pickerGridEl.dataset.step = step;
  pickerGridEl.dataset.category = categoryKey;
  pickerGridEl.style.setProperty("--picker-item-count", String(pickerItemCount(categoryKey, step)));
}

async function applySelection(categoryKey, rawItem) {
  if (!rawItem) return;

  switch (categoryKey) {
    case "head":
      state.selectedHead = await resolveSingleItem(rawItem);
      break;
    case "body":
      state.selectedBody = await resolveSingleItem(rawItem);
      break;
    case "arms":
      state.selectedArms = await resolvePairItem(rawItem, "arms");
      break;
    case "legs":
      state.selectedLegs = await resolvePairItem(rawItem, "legs");
      state.selectedWheel = null;
      break;
    case "wheels":
      state.selectedWheel = await resolveSingleItem(rawItem);
      state.selectedLegs = null;
      break;
    default:
      return;
  }
  sessionSync.publish(squidlyAPI);
}

function toggleCategory(categoryKey) {
  if (categoryKey === "wheels" && !wheelsEnabled()) return;
  if (state.openCategory === categoryKey) {
    state.openCategory = null;
    state.pickerStep = null;
    state.pickerShapeIndex = null;
    return;
  }
  state.openCategory = categoryKey;
  resetPickerForCategory(categoryKey);
}

/** Fallback when robot-layout.json has no computed slot yet. */
const ROBOT_PART_LAYOUT_FALLBACK = {
  head: { x: 50, y: 33, w: 20, h: 20 },
  body: { x: 50, y: 51, w: 28, h: 26 },
  arm1: { x: 39, y: 50, w: 6, h: 18 },
  arm2: { x: 64, y: 50, w: 6, h: 18 },
  leg1: { x: 48, y: 76, w: 7, h: 18 },
  leg2: { x: 56, y: 76, w: 7, h: 18 },
  wheels: { x: 50, y: 65, w: 30, h: 16 },
};

const CORNER_KEYS = ["tl", "tr", "br", "bl"];

async function ensureRobotLayoutLoaded() {
  if (robotLayout) return;
  try {
    const res = await fetch(ROBOT_LAYOUT_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    robotLayout = await res.json();
  } catch {
    robotLayout = { version: 1, background: BACKGROUND_LOCATION, computed: {} };
  }
}

function cornersToLayout(corners) {
  if (!corners) return null;
  const pts = CORNER_KEYS.map((k) => corners[k]).filter(Boolean);
  if (pts.length < 4) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    w: maxX - minX,
    h: maxY - minY,
  };
}

/** Non-round heads (rec, square) sit on the calibrated slot bottom edge. */
function isHeadBottomAligned(headId) {
  const n = idNumberFromKey(headId, "head");
  if (!n) return false;
  return Math.floor((Number(n) - 1) / HEAD_BODY_COLORS_PER_SHAPE) >= 1;
}

/** Natural size of body-1 asset — reference for contain height in the body slot. */
const BODY1_REFERENCE_SIZE = { w: 963, h: 974 };
const BODY_SCALE_MAX = 1.65;

/**
 * rec/tr bodies use wider source art; object-fit:contain becomes width-limited and renders
 * shorter than round bodies in the same slot. Scale so displayed height matches body-1.
 */
function getBodyContainHeightScale(img, bodyId) {
  const n = idNumberFromKey(bodyId, "body");
  if (!n || Math.floor((Number(n) - 1) / HEAD_BODY_COLORS_PER_SHAPE) < 1) return 1;

  const layout = getLayoutForSlot("body");
  if (!layout?.w || !layout?.h) return 1;

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return 1;

  const { w: slotW, h: slotH } = layout;
  const fit = Math.min(slotW / w, slotH / h);
  const displayedH = h * fit;

  const { w: refW, h: refH } = BODY1_REFERENCE_SIZE;
  const refFit = Math.min(slotW / refW, slotH / refH);
  const refDisplayedH = refH * refFit;

  if (!displayedH || !refDisplayedH) return 1;
  return Math.min(BODY_SCALE_MAX, Math.max(1, refDisplayedH / displayedH));
}

function applyBodyVisualScale(node, bodyId) {
  const scale = getBodyContainHeightScale(node, bodyId);
  if (scale <= 1.01) return;
  node.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function attachBodyVisualScale(node, bodyId) {
  const run = () => applyBodyVisualScale(node, bodyId);
  if (node.complete && node.naturalWidth > 0) {
    run();
  } else {
    node.addEventListener("load", run, { once: true });
  }
}

function getLayoutForSlot(slotKey) {
  const fromComputed = robotLayout?.computed?.[slotKey];
  if (fromComputed?.w > 0 && fromComputed?.h > 0) {
    return fromComputed;
  }
  const corners = robotLayout?.slots?.[slotKey]?.corners;
  const fromCorners = cornersToLayout(corners);
  if (fromCorners?.w > 0 && fromCorners?.h > 0) {
    return fromCorners;
  }
  return ROBOT_PART_LAYOUT_FALLBACK[slotKey] || null;
}

/** Same calibrated w/h per slot for every catalog item in that category. */
function createPartForSlot(src, className, slotKey, options = {}) {
  const layout = getLayoutForSlot(slotKey);
  if (!layout) return null;
  const node = document.createElement("img");
  node.src = src;
  node.alt = "";
  node.className = `robot-part ${className}`;
  node.style.left = `${layout.x}%`;
  node.style.top = `${layout.y}%`;
  node.style.width = `${layout.w}%`;
  node.style.height = `${layout.h}%`;
  node.style.maxWidth = "none";
  if (options.objectFit) node.style.objectFit = options.objectFit;
  if (options.objectPosition) node.style.objectPosition = options.objectPosition;
  if (options.alignBottom && layout) {
    node.classList.add("robot-part--align-bottom");
    node.style.top = `${layout.y + layout.h / 2}%`;
    node.style.transform = "translate(-50%, -100%)";
    if (!options.objectPosition) {
      node.style.objectPosition = "bottom center";
    }
  }
  if (options.bodyId) {
    attachBodyVisualScale(node, options.bodyId);
  }
  return node;
}

function renderRobot() {
  robotLayerEl.innerHTML = "";

  const hasAny =
    state.selectedHead ||
    state.selectedBody ||
    state.selectedArms ||
    state.selectedLegs ||
    state.selectedWheel;

  robotLayerEl.setAttribute("aria-hidden", hasAny ? "false" : "true");
  if (!hasAny) return;

  const append = (node) => {
    if (node) robotLayerEl.appendChild(node);
  };

  if (state.selectedLegs?.pairSrc) {
    append(
      createPartForSlot(state.selectedLegs.pairSrc, "part-legs part-leg1", "leg1", {
        objectFit: "cover",
        objectPosition: "left center",
      })
    );
    append(
      createPartForSlot(state.selectedLegs.pairSrc, "part-legs part-leg2", "leg2", {
        objectFit: "cover",
        objectPosition: "right center",
      })
    );
  }

  if (state.selectedBody?.src) {
    append(
      createPartForSlot(state.selectedBody.src, "part-body", "body", {
        objectFit: "contain",
        bodyId: state.selectedBody.id,
      })
    );
  }

  if (state.selectedArms?.pairSrc) {
    append(
      createPartForSlot(state.selectedArms.pairSrc, "part-arms part-arm1", "arm1", {
        objectFit: "cover",
        objectPosition: "left center",
      })
    );
    append(
      createPartForSlot(state.selectedArms.pairSrc, "part-arms part-arm2", "arm2", {
        objectFit: "cover",
        objectPosition: "right center",
      })
    );
  }

  if (state.selectedHead?.src) {
    append(
      createPartForSlot(state.selectedHead.src, "part-head", "head", {
        objectFit: "contain",
        alignBottom: isHeadBottomAligned(state.selectedHead.id),
      })
    );
  }

  if (state.selectedWheel?.src) {
    append(
      createPartForSlot(state.selectedWheel.src, "part-wheels", "wheels", {
        objectFit: "contain",
      })
    );
  }
}

function openCategoryFromElement(el) {
  const key = el?.dataset?.categoryKey ?? el?.closest?.(".access-wrap--category")?.dataset?.categoryKey;
  if (!key) return;
  toggleCategory(key);
  void render();
}

function goToPickerColorStep(el) {
  const wrap = el?.closest?.(".access-wrap--picker") ?? el;
  const categoryKey = wrap?.dataset?.categoryKey;
  const shapeIndex = wrap?.dataset?.shapeIndex;
  if (!categoryKey || shapeIndex === undefined) return;
  state.pickerShapeIndex = Number(shapeIndex);
  state.pickerStep = "color";
  void render();
}

async function selectPickerItem(el) {
  const wrap = el?.closest?.(".access-wrap--picker") ?? el;
  const categoryKey = wrap?.dataset?.categoryKey;
  const itemId = wrap?.dataset?.itemId;
  if (!categoryKey || !itemId) return;
  const rawItem = getCatalogListForCategory(categoryKey).find((item) => item.id === itemId);
  if (!rawItem) return;
  await applySelection(categoryKey, rawItem);
  await render();
}

function onPickerBackClick() {
  if (!state.openCategory || state.openCategory === "wheels") return;
  state.pickerStep = "shape";
  void render();
}

function renderCategoryAccess() {
  categoryAccessEl.innerHTML = "";

  getCategoryTriggers().forEach((trigger, idx) => {
    const meta = CATEGORIES.find((c) => c.key === trigger.key);
    if (!meta) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "category-btn squidly-btn squidly-btn--normal";
    btn.textContent = meta.label;
    btn.setAttribute("aria-label", `${meta.label} parts`);
    btn.setAttribute("aria-expanded", state.openCategory === trigger.key ? "true" : "false");
    btn.addEventListener("click", (e) => openCategoryFromElement(wrap));

    const wrap = document.createElement("access-button");
    wrap.className = "access-wrap access-wrap--category";
    if (state.openCategory === trigger.key) {
      wrap.classList.add("category-open");
    }
    wrap.dataset.categoryKey = trigger.key;
    wrap.setAttribute("access-group", CATEGORY_ACCESS_GROUP);
    wrap.setAttribute("access-order", String(idx + 1));
    wrap.style.left = `${trigger.left}%`;
    wrap.style.top = `${trigger.top}%`;
    wrap.style.width = `${trigger.w}%`;
    wrap.style.height = `${trigger.h}%`;
    wrap.addEventListener("access-click", (e) => openCategoryFromElement(e.currentTarget));
    wrap.appendChild(btn);
    categoryAccessEl.appendChild(wrap);
  });
}

async function previewSrcForPickerItem(categoryKey, item) {
  if (categoryKey === "arms" || categoryKey === "legs") {
    const n = idNumberFromKey(item.id, categoryKey);
    return n ? resolvePairPng(categoryKey, n) : null;
  }
  return resolvePartSrc(item.src, item.id);
}

function appendPickerCell({
  categoryKey,
  order,
  previewSrc,
  ariaLabel,
  selected,
  shapeIndex,
  itemId,
  onAccessClick,
  onButtonClick,
}) {
  const wrap = document.createElement("access-button");
  wrap.className = "access-wrap access-wrap--picker";
  wrap.dataset.categoryKey = categoryKey;
  if (shapeIndex !== undefined) {
    wrap.dataset.shapeIndex = String(shapeIndex);
  }
  if (itemId) {
    wrap.dataset.itemId = itemId;
  }
  wrap.setAttribute("access-group", PICKER_ACCESS_GROUP);
  wrap.setAttribute("access-order", String(order));
  if (selected) {
    wrap.classList.add("picker-item-selected");
  }
  wrap.addEventListener("access-click", onAccessClick);

  const img = document.createElement("img");
  img.className = "picker-item-visual";
  img.src = previewSrc;
  img.alt = "";
  img.draggable = false;
  img.addEventListener("error", () => {
    wrap.classList.add("access-wrap--hidden");
  });

  const hotspotButton = document.createElement("button");
  hotspotButton.type = "button";
  hotspotButton.className = "picker-hotspot";
  hotspotButton.dataset.categoryKey = categoryKey;
  if (shapeIndex !== undefined) {
    hotspotButton.dataset.shapeIndex = String(shapeIndex);
  }
  if (itemId) {
    hotspotButton.dataset.itemId = itemId;
  }
  hotspotButton.setAttribute("aria-label", ariaLabel);
  hotspotButton.addEventListener("click", onButtonClick);

  wrap.appendChild(img);
  wrap.appendChild(hotspotButton);
  pickerGridEl.appendChild(wrap);
}

async function renderPickerAccess() {
  pickerGridEl.innerHTML = "";

  if (!state.openCategory) {
    pickerLayerEl.hidden = true;
    pickerTitleEl.textContent = "";
    pickerBackWrapEl.hidden = true;
    return;
  }

  const categoryKey = state.openCategory;
  const step = state.pickerStep || (categoryKey === "wheels" ? "color" : "shape");
  const meta = CATEGORIES.find((c) => c.key === categoryKey);

  pickerLayerEl.hidden = false;
  if (categoryKey === "wheels") {
    pickerTitleEl.textContent = meta?.title || "Choose wheels";
  } else {
    pickerTitleEl.textContent = pickerTitleForStep(categoryKey, step);
  }

  pickerBackWrapEl.hidden = step !== "color" || categoryKey === "wheels";
  applyPickerGridLayout(categoryKey, step);

  const list = getCatalogListForCategory(categoryKey);
  const model = buildPickerModel(categoryKey, list);
  let order = 0;

  if (categoryKey === "wheels" || step === "color") {
    const shapeIndex =
      categoryKey === "wheels" ? 0 : state.pickerShapeIndex ?? 0;
    const shape = model.shapes.find((s) => s.shapeIndex === shapeIndex) || model.shapes[0];
    const variants = shape?.variants || [];

    for (const item of variants) {
      if (!item?.id) continue;
      const previewSrc = await previewSrcForPickerItem(categoryKey, item);
      if (!previewSrc) continue;

      order += 1;
      appendPickerCell({
        categoryKey,
        order,
        previewSrc,
        ariaLabel: `Select ${item.id}`,
        selected: isItemSelected(categoryKey, item.id),
        itemId: item.id,
        onAccessClick: (e) => void selectPickerItem(e.currentTarget),
        onButtonClick: (e) => void selectPickerItem(e.currentTarget),
      });
    }
    return;
  }

  for (const shape of model.shapes) {
    const previewItem = shape.previewItem;
    if (!previewItem?.id) continue;
    const previewSrc = await previewSrcForPickerItem(categoryKey, previewItem);
    if (!previewSrc) continue;

    order += 1;
    appendPickerCell({
      categoryKey,
      order,
      previewSrc,
      ariaLabel: `Select shape ${shape.shapeIndex + 1}`,
      selected: isShapeHighlighted(categoryKey, shape.shapeIndex),
      shapeIndex: shape.shapeIndex,
      onAccessClick: (e) => goToPickerColorStep(e.currentTarget),
      onButtonClick: (e) => goToPickerColorStep(e.currentTarget),
    });
  }
}

async function applySceneBackground() {
  if (!sceneBgEl) return;
  if (await verifyImageExists(BACKGROUND_P1)) {
    sceneBgEl.src = BACKGROUND_P1;
    return;
  }
  if (await verifyImageExists(BACKGROUND_LOCATION)) {
    sceneBgEl.src = BACKGROUND_LOCATION;
  }
}

async function render() {
  await ensureRobotLayoutLoaded();
  await ensureCatalogLoaded();
  if (state.openCategory === "wheels" && !wheelsEnabled()) {
    state.openCategory = null;
    state.pickerStep = null;
    state.pickerShapeIndex = null;
  }
  renderCategoryAccess();
  await renderPickerAccess();
  renderRobot();
}

function resetGame() {
  state = {
    openCategory: null,
    pickerStep: null,
    pickerShapeIndex: null,
    selectedHead: null,
    selectedBody: null,
    selectedArms: null,
    selectedLegs: null,
    selectedWheel: null,
  };
  sessionSync.publish(squidlyAPI);
  void render();
}

resetBtn?.addEventListener("click", resetGame);
resetAccessBtn?.addEventListener("access-click", resetGame);
pickerBackBtn?.addEventListener("click", onPickerBackClick);
pickerBackWrapEl?.addEventListener("access-click", onPickerBackClick);

async function init() {
  const isCalibrate = new URLSearchParams(location.search).has("calibrate");
  if (isCalibrate) {
    const { startCalibration } = await import("./calibrate.js");
    startCalibration(sceneEl);
    return;
  }
  await applySceneBackground();
  await render();
}

if (squidlyAPI?.addSessionInfoListener) {
  squidlyAPI.addSessionInfoListener((info) => sessionSync.init(info, squidlyAPI));
} else {
  sessionSync.init(null, squidlyAPI);
}

initBackToHub();
init();

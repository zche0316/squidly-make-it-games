const sceneEl = document.getElementById("scene");
const hotspotsEl = document.getElementById("hotspots");
const robotLayerEl = document.getElementById("robot-layer");
const statusEl = document.getElementById("status");
const resetBtn = document.getElementById("reset-btn");

const BACKGROUND_BY_STEP = {
  1: "./resources/backgrounds/p1.png",
  2: "./resources/backgrounds/p2.png",
  3: "./resources/backgrounds/p3.png",
  4: "./resources/backgrounds/p4.png",
  5: "./resources/backgrounds/p5.png",
  6: "./resources/backgrounds/p6.png",
};

const HOTSPOT_SIZE_BY_GROUP = {
  heads: { w: 13, h: 13 },
  bodies: { w: 14, h: 18 },
  arms: { w: 12, h: 12 },
  legs: { w: 11, h: 11 },
  wheels: { w: 12, h: 11 },
};
const STEP_HINTS_STATIC = {
  1: "",
  2: "",
  3: "",
  4: "",
  5: "",
  6: "",
};

let catalog = null;

let state = {
  step: 1,
  step5phase: null,
  locomotionMode: null,
  selectedHead: null,
  selectedBody: null,
  selectedArms: null,
  selectedLegs: null,
  selectedWheel: null,
};

const backgroundAvailability = new Map();

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

function findPairById(list, id) {
  return list?.find?.((item) => item.id === id) || null;
}

function verifyImageExists(src) {
  const cached = backgroundAvailability.get(src);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      backgroundAvailability.set(src, true);
      resolve(true);
    };
    image.onerror = () => {
      backgroundAvailability.set(src, false);
      resolve(false);
    };
    image.src = src;
  });
}

function createPart(src, className, x, y, widthPct) {
  const node = document.createElement("img");
  node.src = src;
  node.alt = "";
  node.className = `robot-part ${className}`;
  node.style.left = `${x}%`;
  node.style.top = `${y}%`;
  node.style.width = `${widthPct}%`;
  return node;
}

function buildHotspotsFromCatalog(list, groupKey, ariaPrefix, idPrefix = "") {
  const size = HOTSPOT_SIZE_BY_GROUP[groupKey] || { w: 12, h: 12 };
  return (list || [])
    .filter((item) => item?.id && item?.pos)
    .map((item) => {
      const cx = Number(item.pos.x);
      const cy = Number(item.pos.y);
      return {
        id: `${idPrefix}${item.id}`,
        x: cx - size.w / 2,
        y: cy - size.h / 2,
        w: size.w,
        h: size.h,
        ariaLabel: `${ariaPrefix} ${item.id}`,
      };
    });
}

function getHintsText() {
  if (state.step === 6) return STEP_HINTS_STATIC[6];
  if (state.step === 5) return STEP_HINTS_STATIC[5];
  if (state.step === 1) return STEP_HINTS_STATIC[1];
  if (state.step === 2) return STEP_HINTS_STATIC[2];
  if (state.step === 3) return STEP_HINTS_STATIC[3];
  if (state.step === 4) return STEP_HINTS_STATIC[4];
  return "";
}

function computeHotspotsForCurrentStep() {
  if (!catalog) return [];

  if (state.step === 1) {
    return [];
  }

  if (state.step === 2) {
    return buildHotspotsFromCatalog(catalog.heads, "heads", "Head option");
  }

  if (state.step === 3) {
    return buildHotspotsFromCatalog(catalog.bodies, "bodies", "Body option");
  }

  if (state.step === 4) {
    return buildHotspotsFromCatalog(catalog.arms, "arms", "Arms pick");
  }

  if (state.step === 5) {
    const legsFromPos = buildHotspotsFromCatalog(catalog.legs, "legs", "Leg pick", "legs:");
    const wheelsFromPos = buildHotspotsFromCatalog(catalog.wheels, "wheels", "Wheel pick", "wheel:");
    return [...legsFromPos, ...wheelsFromPos];
  }

  return [];
}

function advanceAfterHeadSelection() {
  if (!catalog.bodies?.length) {
    state.selectedBody = null;
    state.step = 4;
  } else {
    state.step = 3;
  }
}

function onHotspotClick(id) {
  if (!catalog) return;

  if (state.step === 1 && id === "start") {
    state.step = 2;
    renderSync();
    return;
  }

  if (state.step === 2) {
    state.selectedHead = catalog.heads?.find?.((head) => head.id === id) ?? null;
    if (!state.selectedHead) return;
    advanceAfterHeadSelection();
    renderSync();
    return;
  }

  if (state.step === 3) {
    state.selectedBody = catalog.bodies?.find?.((body) => body.id === id) ?? null;
    if (!state.selectedBody) return;
    state.step = 4;
    renderSync();
    return;
  }

  if (state.step === 4) {
    state.selectedArms = findPairById(catalog.arms, id);
    if (!state.selectedArms) return;
    state.step5phase = "pick";
    state.locomotionMode = null;
    state.step = 5;
    renderSync();
    return;
  }

  if (state.step === 5) {
    if (id.startsWith("legs:")) {
      const legId = id.slice(5);
      state.selectedLegs = findPairById(catalog.legs, legId);
      if (!state.selectedLegs) return;
      state.selectedWheel = null;
      state.locomotionMode = "legs";
      state.step5phase = null;
      state.step = 6;
      renderSync();
      return;
    }
    if (id.startsWith("wheel:")) {
      const wheelId = id.slice(6);
      state.selectedWheel = catalog.wheels?.find?.((wheel) => wheel.id === wheelId) ?? null;
      if (!state.selectedWheel) return;
      state.selectedLegs = null;
      state.locomotionMode = "wheels";
      state.step5phase = null;
      state.step = 6;
      renderSync();
    }
  }
}

function renderRobot() {
  robotLayerEl.innerHTML = "";
  robotLayerEl.setAttribute("aria-hidden", state.step === 6 ? "false" : "true");

  if (state.step !== 6) return;

  if (!state.selectedHead || !state.selectedArms) return;
  if (!state.selectedLegs && !state.selectedWheel) return;

  if (state.selectedLegs) {
    robotLayerEl.appendChild(createPart(state.selectedLegs.left, "part-legs part-legs-left", 56, 66, 14));
    robotLayerEl.appendChild(createPart(state.selectedLegs.right, "part-legs part-legs-right", 44, 66, 14));
  }

  if (state.selectedBody?.src) {
    robotLayerEl.appendChild(createPart(state.selectedBody.src, "part-body", 50, 51, 28));
  }

  robotLayerEl.appendChild(createPart(state.selectedArms.left, "part-arms part-arms-left", 34, 50, 16));
  robotLayerEl.appendChild(createPart(state.selectedArms.right, "part-arms part-arms-right", 66, 50, 16));
  robotLayerEl.appendChild(createPart(state.selectedHead.src, "part-head", 50, 33, 20));

  if (state.selectedWheel?.src) {
    robotLayerEl.appendChild(createPart(state.selectedWheel.src, "part-wheels", 50, 65, 30));
  }
}

function bindHotspots() {
  hotspotsEl.innerHTML = "";
}

function clientToScenePercent(clientX, clientY) {
  const r = sceneEl.getBoundingClientRect();
  return {
    x: ((clientX - r.left) / r.width) * 100,
    y: ((clientY - r.top) / r.height) * 100,
  };
}

function pickNearestHotspot(clientX, clientY) {
  const hotspots = computeHotspotsForCurrentStep();
  if (!hotspots.length) return null;
  const point = clientToScenePercent(clientX, clientY);

  let nearest = null;
  let minDistance = Infinity;
  for (const spot of hotspots) {
    const centerX = spot.x + spot.w / 2;
    const centerY = spot.y + spot.h / 2;
    const distance = Math.hypot(point.x - centerX, point.y - centerY);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = spot;
    }
  }
  return nearest;
}

function onScenePointerDown(e) {
  if (e.button !== 0) return;
  if (state.step === 1) {
    onHotspotClick("start");
    return;
  }
  const nearest = pickNearestHotspot(e.clientX, e.clientY);
  if (!nearest) return;
  onHotspotClick(nearest.id);
}

async function applyBackgroundAndHint() {
  const bgSrc = BACKGROUND_BY_STEP[state.step];
  const exists = await verifyImageExists(bgSrc);
  if (!exists) {
    sceneEl.style.backgroundImage = "none";
    statusEl.textContent = "";
    return;
  }

  sceneEl.style.backgroundImage = `url("${bgSrc}")`;

  let line = getHintsText();
  statusEl.textContent = line;
}

async function render() {
  await ensureCatalogLoaded();
  bindHotspots();
  renderRobot();
  await applyBackgroundAndHint();
}

function renderSync() {
  bindHotspots();
  renderRobot();
  applyBackgroundAndHint();
}

function resetGame() {
  state = {
    step: 1,
    step5phase: null,
    locomotionMode: null,
    selectedHead: null,
    selectedBody: null,
    selectedArms: null,
    selectedLegs: null,
    selectedWheel: null,
  };
  renderSync();
}

resetBtn?.addEventListener("click", resetGame);
sceneEl?.addEventListener("pointerdown", onScenePointerDown);
render();

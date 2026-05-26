export const CENTER_TYPES = new Set(["fish", "star", "bubble"]);
export const SLOT_ITEM_FILL = 0.92;
export const MAX_PER_ITEM = 4;
export const COLOR_COUNT = 4;
export const BOWL_PALETTE_GAP = 1.2;
export const PALETTE_BOTTOM_HIT_WIDTH_FRAC = 0.46;

export const ART_VIEW_BOX = {
  fish: { w: 450.715, h: 331.49 },
  seaweed: { w: 192, h: 271 },
  star: { w: 183.671, h: 177.119 },
  shell: { w: 241, h: 216 },
};

export const BOWL = { cx: 37, cy: 60, rx: 33, ry: 37 };

export const PALETTE_ACCESS_GROUP = "fishbowl-palette";
export const SLOT_ACCESS_GROUP = "fishbowl-slots";

export const SLOT_LAYOUT = [
  { id: "fish-slot-1", x: 7.592, y: 49.148, w: 15.908, h: 15.829, art: "./resources/background/fish-slot-1.svg" },
  { id: "seastar-slot", x: 27.222, y: 56.913, w: 6.892, h: 8.069, art: "./resources/background/seastar-slot.svg" },
  { id: "bubble-slot", x: 35.911, y: 45.507, w: 6.688, h: 11.184, art: "./resources/background/bubble.svg" },
  { id: "fish-slot-2", x: 44.162, y: 48.044, w: 15.713, h: 15.716, art: "./resources/background/fish-slot-2.svg" },
  { id: "seaweed-slot", x: 13.46, y: 68.911, w: 6.111, h: 11.656, art: "./resources/background/seaweed-slot.svg" },
  { id: "stone-slot", x: 29.821, y: 67.13, w: 15.426, h: 11.755, art: "./resources/background/stone-slot.svg" },
  { id: "shell-slot", x: 50.069, y: 70.065, w: 8.188, h: 9.283, art: "./resources/background/shell-slot.svg" },
  { id: "bottom-slot", x: 10.868, y: 81.322, w: 50.51, h: 16.907, art: "./resources/background/bottom-slot.svg" },
];

export const SLOT_BY_ID = new Map(SLOT_LAYOUT.map((s) => [s.id, s]));

/** Placed fish face into the bowl per slot (not tied to palette selection). */
export const FISH_SLOT_FLIPPED = {
  "fish-slot-1": true,
  "fish-slot-2": false,
};

/** Fish icon on the right side of the palette board. */
export const PALETTE_FISH_FLIPPED = true;

export const PALETTE_CENTERS = [
  { id: "sand", cx: 28.5, cy: 7.5 },
  { id: "stones", cx: 99.875, cy: 32.167 },
  { id: "pebble", cx: 66.5, cy: 7.5 },
  { id: "bubble", cx: 69.25, cy: 23 },
  { id: "star", cx: 81.5, cy: 40.833 },
  { id: "fish", cx: 82.5, cy: 63.167 },
  { id: "seaweed", cx: 73.625, cy: 86.333 },
  { id: "shell", cx: 90.875, cy: 88.5 },
];

export const PALETTE_CENTER_BY_ID = new Map(PALETTE_CENTERS.map((a) => [a.id, a]));

export const RESOURCE_ITEMS = [
  { id: "sand", label: "sand", src: "./resources/sand.svg", type: "bottom" },
  { id: "pebble", label: "pebble", src: "./resources/pebble.svg", type: "bottom" },
  { id: "stones", label: "stones", src: "./resources/stones.svg", type: "bottom" },
  { id: "shell", label: "shell", type: "bottom", artFamily: "shell" },
  { id: "seaweed", label: "seaweed", type: "bottom", artFamily: "seaweed" },
  { id: "fish", label: "fish", type: "fish", artFamily: "fish" },
  { id: "star", label: "star", type: "star", artFamily: "star" },
  { id: "bubble", label: "bubble", src: "./resources/bubble.svg", type: "bubble" },
];

export const ITEM_BY_ID = new Map(RESOURCE_ITEMS.map((item) => [item.id, item]));

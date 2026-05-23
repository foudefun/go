export const BEASTMAKER_1000_VIEWBOX = { width: 1000, height: 360 };

export const BEASTMAKER_1000_HOLDS = [
  { slug: "jug_left", label: "Left jug", type: "jug", side: "left", supportsBothHands: false, area: { shape: "rect", x: 92, y: 42, width: 190, height: 48, rx: 22 } },
  { slug: "jug_right", label: "Right jug", type: "jug", side: "right", supportsBothHands: false, area: { shape: "rect", x: 718, y: 42, width: 190, height: 48, rx: 22 } },
  { slug: "sloper_35_left", label: "Left 35 degree sloper", type: "sloper", side: "left", angleDeg: 35, area: { shape: "ellipse", x: 346, y: 66, width: 112, height: 54 } },
  { slug: "sloper_35_right", label: "Right 35 degree sloper", type: "sloper", side: "right", angleDeg: 35, area: { shape: "ellipse", x: 542, y: 66, width: 112, height: 54 } },
  { slug: "sloper_20_left", label: "Left 20 degree sloper", type: "sloper", side: "left", angleDeg: 20, area: { shape: "ellipse", x: 210, y: 108, width: 116, height: 52 } },
  { slug: "sloper_20_right", label: "Right 20 degree sloper", type: "sloper", side: "right", angleDeg: 20, area: { shape: "ellipse", x: 674, y: 108, width: 116, height: 52 } },
  { slug: "very_deep_4_finger_center", label: "Very deep 4-finger pocket", type: "pocket", side: "center", fingerCount: 4, depthCategory: "very_deep", supportsBothHands: true, area: { shape: "rect", x: 414, y: 138, width: 172, height: 54, rx: 20 } },
  { slug: "deep_4_finger_left", label: "Left deep 4-finger pocket", type: "pocket", side: "left", fingerCount: 4, depthCategory: "deep", area: { shape: "rect", x: 118, y: 154, width: 126, height: 42, rx: 16 } },
  { slug: "deep_4_finger_right", label: "Right deep 4-finger pocket", type: "pocket", side: "right", fingerCount: 4, depthCategory: "deep", area: { shape: "rect", x: 756, y: 154, width: 126, height: 42, rx: 16 } },
  { slug: "deep_3_finger_left", label: "Left deep 3-finger pocket", type: "pocket", side: "left", fingerCount: 3, depthCategory: "deep", area: { shape: "rect", x: 270, y: 166, width: 94, height: 40, rx: 15 } },
  { slug: "deep_3_finger_right", label: "Right deep 3-finger pocket", type: "pocket", side: "right", fingerCount: 3, depthCategory: "deep", area: { shape: "rect", x: 636, y: 166, width: 94, height: 40, rx: 15 } },
  { slug: "deep_2_finger_left", label: "Left deep 2-finger pocket", type: "pocket", side: "left", fingerCount: 2, depthCategory: "deep", area: { shape: "rect", x: 154, y: 222, width: 72, height: 38, rx: 14 } },
  { slug: "deep_2_finger_right", label: "Right deep 2-finger pocket", type: "pocket", side: "right", fingerCount: 2, depthCategory: "deep", area: { shape: "rect", x: 774, y: 222, width: 72, height: 38, rx: 14 } },
  { slug: "medium_4_finger_left", label: "Left medium 4-finger pocket", type: "pocket", side: "left", fingerCount: 4, depthCategory: "medium", area: { shape: "rect", x: 288, y: 228, width: 112, height: 34, rx: 12 } },
  { slug: "medium_4_finger_right", label: "Right medium 4-finger pocket", type: "pocket", side: "right", fingerCount: 4, depthCategory: "medium", area: { shape: "rect", x: 600, y: 228, width: 112, height: 34, rx: 12 } },
  { slug: "small_4_finger_10mm_left", label: "Left small 4-finger 10mm edge", type: "edge", side: "left", fingerCount: 4, depthCategory: "small", mm: 10, area: { shape: "rect", x: 294, y: 286, width: 106, height: 18, rx: 7 } },
  { slug: "small_4_finger_10mm_right", label: "Right small 4-finger 10mm edge", type: "edge", side: "right", fingerCount: 4, depthCategory: "small", mm: 10, area: { shape: "rect", x: 600, y: 286, width: 106, height: 18, rx: 7 } },
  { slug: "medium_2_finger_left", label: "Left medium 2-finger pocket", type: "pocket", side: "left", fingerCount: 2, depthCategory: "medium", area: { shape: "rect", x: 430, y: 232, width: 58, height: 32, rx: 12 } },
  { slug: "medium_2_finger_right", label: "Right medium 2-finger pocket", type: "pocket", side: "right", fingerCount: 2, depthCategory: "medium", area: { shape: "rect", x: 512, y: 232, width: 58, height: 32, rx: 12 } },
  { slug: "medium_3_finger_left", label: "Left medium 3-finger pocket", type: "pocket", side: "left", fingerCount: 3, depthCategory: "medium", area: { shape: "rect", x: 412, y: 286, width: 76, height: 30, rx: 11 } },
  { slug: "medium_3_finger_right", label: "Right medium 3-finger pocket", type: "pocket", side: "right", fingerCount: 3, depthCategory: "medium", area: { shape: "rect", x: 512, y: 286, width: 76, height: 30, rx: 11 } },
];

export const BEASTMAKER_1000_HOLD_GROUPS = {
  jugs: ["jug_left", "jug_right"],
  very_deep_4_finger: ["very_deep_4_finger_center"],
  deep_4_finger: ["deep_4_finger_left", "deep_4_finger_right"],
  medium_4_finger: ["medium_4_finger_left", "medium_4_finger_right"],
  small_4_finger_10mm: ["small_4_finger_10mm_left", "small_4_finger_10mm_right"],
  deep_3_finger: ["deep_3_finger_left", "deep_3_finger_right"],
  medium_3_finger: ["medium_3_finger_left", "medium_3_finger_right"],
  deep_2_finger: ["deep_2_finger_left", "deep_2_finger_right"],
  medium_2_finger: ["medium_2_finger_left", "medium_2_finger_right"],
  sloper_20: ["sloper_20_left", "sloper_20_right"],
  sloper_35: ["sloper_35_left", "sloper_35_right"],
};

export const BEASTMAKER_1000_HOLD_BY_SLUG = Object.fromEntries(BEASTMAKER_1000_HOLDS.map((hold) => [hold.slug, hold]));

export function getValidBeastmaker1000HoldSlugs(slugs = []) {
  return (Array.isArray(slugs) ? slugs : []).filter((slug) => Boolean(BEASTMAKER_1000_HOLD_BY_SLUG[slug]));
}

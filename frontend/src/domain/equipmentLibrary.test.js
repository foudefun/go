import test from "node:test";
import assert from "node:assert/strict";
import {
  filterEquipment,
  getEquipmentCategories,
  getEquipmentLabel,
  modelsForBrand,
  normalizeEquipmentDraft,
  normalizePurchaseDraft,
  slugifyEquipmentName,
} from "./equipmentLibrary.js";

test("builds technical equipment names", () => {
  assert.equal(slugifyEquipmentName("La Sportiva Solution Comp"), "la_sportiva_solution_comp");
  assert.equal(slugifyEquipmentName("  Rope / 70m  "), "rope_70m");
});

test("normalizes equipment and purchase drafts", () => {
  assert.deepEqual(normalizeEquipmentDraft({ name: " shoe ", brand_id: "2", model_id: "7" }), {
    id: null,
    name: "shoe",
    brand_id: 2,
    model_id: 7,
    category: "",
    description: "",
    image: "",
    link: "",
  });
  assert.equal(normalizePurchaseDraft({ equipment_id: "4", purchase_price: "129.955" }).purchase_price, 129.96);
});

test("filters equipment by query, brand, and category", () => {
  const items = [
    { name: "solution", display_name: "La Sportiva Solution", brand_id: 1, category: "shoes" },
    { name: "rope", display_name: "Mammut Rope", brand_id: 2, category: "rope" },
  ];
  assert.deepEqual(filterEquipment(items, { query: "mammut" }).map((item) => item.name), ["rope"]);
  assert.deepEqual(filterEquipment(items, { brandId: 1 }).map((item) => item.name), ["solution"]);
  assert.deepEqual(filterEquipment(items, { category: "rope" }).map((item) => item.name), ["rope"]);
});

test("returns labels, categories, and models by brand", () => {
  assert.equal(getEquipmentLabel({ brand_name: "Petzl", model_name: "GriGri", name: "belay_device" }), "Petzl GriGri belay_device");
  assert.deepEqual(getEquipmentCategories([{ category: "shoes" }, { category: "" }, { category: "rope" }]), ["rope", "shoes"]);
  assert.deepEqual(modelsForBrand([{ id: 1, brand_id: 2 }, { id: 2, brand_id: 3 }], 2).map((model) => model.id), [1]);
});

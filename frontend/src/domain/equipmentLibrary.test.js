import test from "node:test";
import assert from "node:assert/strict";
import {
  filterEquipment,
  getEquipmentActivities,
  getEquipmentActivityTypes,
  getEquipmentCategories,
  getEquipmentLabel,
  normalizeBrandDraft,
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
  const normalizedPurchase = normalizePurchaseDraft({ model_version_id: "4", variant_id: "9", purchase_currency: "chf", status: "retired", notes: " worn " });
  assert.deepEqual(
    {
      equipment_id: normalizedPurchase.equipment_id,
      model_version_id: normalizedPurchase.model_version_id,
      variant_id: normalizedPurchase.variant_id,
      purchase_currency: normalizedPurchase.purchase_currency,
      status: normalizedPurchase.status,
      note: normalizedPurchase.note,
    },
    { equipment_id: 4, model_version_id: 4, variant_id: 9, purchase_currency: "CHF", status: "retired", note: "worn" },
  );
});

test("normalizes brand metadata drafts", () => {
  assert.deepEqual(normalizeBrandDraft({ name: " Petzl ", country_id: "4", year_established: "1975", is_active: false }), {
    id: null,
    name: "Petzl",
    normalized_name: "",
    country_id: 4,
    year_established: 1975,
    website_url: "",
    description: "",
    logo_url: "",
    is_active: false,
    created_at: normalizeBrandDraft().created_at,
    updated_at: "",
    history: "",
  });
});

test("filters equipment by query, brand, and category", () => {
  const items = [
    { name: "solution", display_name: "La Sportiva Solution", brand_id: 1, category: "shoes" },
    { name: "rope", display_name: "Mammut Rope", brand_id: 2, category: "rope" },
    { name: "edge_1040", display_name: "Garmin Edge 1040", brand_id: 3, category: "Cycling computer" },
  ];
  assert.deepEqual(filterEquipment(items, { query: "mammut" }).map((item) => item.name), ["rope"]);
  assert.deepEqual(filterEquipment(items, { brandId: 1 }).map((item) => item.name), ["solution"]);
  assert.deepEqual(filterEquipment(items, { category: "rope" }).map((item) => item.name), ["rope"]);
  assert.deepEqual(filterEquipment(items, { activity: "velo" }).map((item) => item.name), ["edge_1040"]);
});

test("returns labels, categories, activities, and models by brand", () => {
  assert.equal(getEquipmentLabel({ brand_name: "Petzl", model_name: "GriGri", name: "belay_device" }), "Petzl GriGri belay_device");
  assert.deepEqual(getEquipmentCategories([{ category: "shoes" }, { category: "" }, { category: "rope" }]), ["rope", "shoes"]);
  assert.deepEqual(getEquipmentActivityTypes({ category: "Corde d'escalade", model_name: "GriGri" }), ["escalade"]);
  assert.deepEqual(getEquipmentActivities([{ category: "Cycling computer" }, { category: "Hockey stick" }]), ["velo", "hockey"]);
  assert.deepEqual(modelsForBrand([{ id: 1, brand_id: 2 }, { id: 2, brand_id: 3 }], 2).map((model) => model.id), [1]);
});

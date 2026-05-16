export function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function blankBrand() {
  return {
    id: null,
    name: "",
    normalized_name: "",
    country_id: "",
    year_established: "",
    website_url: "",
    description: "",
    logo_url: "",
    is_active: true,
    created_at: todayIso(),
    updated_at: "",
    history: "",
  };
}

export function blankModel(brandId = "") {
  return {
    id: null,
    brand_id: brandId || "",
    name: "",
    created_at: todayIso(),
    history: "",
  };
}

export function blankEquipment(brandId = "", modelId = "") {
  return {
    id: null,
    name: "",
    brand_id: brandId || "",
    model_id: modelId || "",
    category: "",
    description: "",
    image: "",
    link: "",
  };
}

export function blankPurchase(equipmentId = "") {
  return {
    id: null,
    equipment_id: equipmentId || "",
    purchase_date: todayIso(),
    purchase_price: "",
    note: "",
  };
}

export function normalizeOptionalInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.trunc(numberValue);
}

export function normalizeOptionalFloat(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return null;
  return Math.round(numberValue * 100) / 100;
}

export function normalizeBrandDraft(brand = {}) {
  return {
    ...blankBrand(),
    id: brand.id ?? null,
    name: String(brand.name || "").trim(),
    normalized_name: String(brand.normalized_name || "").trim(),
    country_id: normalizeOptionalInt(brand.country_id) || "",
    year_established: normalizeOptionalInt(brand.year_established) || "",
    website_url: String(brand.website_url || "").trim(),
    description: String(brand.description || "").trim(),
    logo_url: String(brand.logo_url || "").trim(),
    is_active: brand.is_active !== false,
    created_at: String(brand.created_at || "").trim() || todayIso(),
    updated_at: String(brand.updated_at || "").trim(),
    history: String(brand.history || "").trim(),
  };
}

export function normalizeModelDraft(model = {}) {
  return {
    ...blankModel(),
    id: model.id ?? null,
    brand_id: normalizeOptionalInt(model.brand_id) || "",
    name: String(model.name || "").trim(),
    created_at: String(model.created_at || "").trim() || todayIso(),
    history: String(model.history || "").trim(),
  };
}

export function normalizeEquipmentDraft(equipment = {}) {
  return {
    ...blankEquipment(),
    id: equipment.id ?? null,
    name: String(equipment.name || "").trim(),
    brand_id: normalizeOptionalInt(equipment.brand_id) || "",
    model_id: normalizeOptionalInt(equipment.model_id) || "",
    category: String(equipment.category || "").trim(),
    description: String(equipment.description || "").trim(),
    image: String(equipment.image || "").trim(),
    link: String(equipment.link || "").trim(),
  };
}

export function normalizePurchaseDraft(purchase = {}) {
  return {
    ...blankPurchase(),
    id: purchase.id ?? null,
    equipment_id: normalizeOptionalInt(purchase.equipment_id) || "",
    purchase_date: String(purchase.purchase_date || "").trim() || todayIso(),
    purchase_price: normalizeOptionalFloat(purchase.purchase_price) ?? "",
    note: String(purchase.note || "").trim(),
  };
}

export function slugifyEquipmentName(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getEquipmentLabel(equipment = {}) {
  return (
    String(equipment.display_name || "").trim() ||
    [equipment.brand_name, equipment.model_name, equipment.name].filter(Boolean).join(" ").trim() ||
    String(equipment.name || "").replaceAll("_", " ").trim() ||
    "Unnamed equipment"
  );
}

export function getEquipmentSearchText(equipment = {}) {
  return [
    equipment.name,
    equipment.display_name,
    equipment.brand_name,
    equipment.model_name,
    equipment.category,
    equipment.description,
  ]
    .join(" ")
    .toLowerCase();
}

export function getEquipmentCategories(equipment = []) {
  return Array.from(
    new Set(
      (Array.isArray(equipment) ? equipment : [])
        .map((item) => String(item.category || "").trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function filterEquipment(equipment = [], filters = {}) {
  const query = String(filters.query || "").trim().toLowerCase();
  const brandId = normalizeOptionalInt(filters.brandId);
  const category = String(filters.category || "").trim();

  return (Array.isArray(equipment) ? equipment : [])
    .filter((item) => {
      if (brandId && Number(item.brand_id) !== brandId) return false;
      if (category && item.category !== category) return false;
      if (!query) return true;
      return getEquipmentSearchText(item).includes(query);
    })
    .sort((left, right) => getEquipmentLabel(left).localeCompare(getEquipmentLabel(right)));
}

export function modelsForBrand(models = [], brandId = "") {
  const targetBrandId = normalizeOptionalInt(brandId);
  if (!targetBrandId) return [];
  return (Array.isArray(models) ? models : [])
    .filter((model) => Number(model.brand_id) === targetBrandId)
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));
}

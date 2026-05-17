import { useEffect, useMemo, useState } from "react";
import {
  createEquipment,
  createEquipmentBrand,
  createEquipmentModel,
  createMyEquipment,
  deleteEquipment,
  deleteEquipmentBrand,
  deleteEquipmentModel,
  deleteMyEquipment,
  getCountries,
  getEquipment,
  getEquipmentBrands,
  getEquipmentModels,
  getMyEquipment,
  updateEquipment,
  updateEquipmentBrand,
  updateEquipmentModel,
  updateMyEquipment,
} from "../api/equipmentApi.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import {
  blankBrand,
  blankEquipment,
  blankModel,
  blankPurchase,
  filterEquipment,
  getEquipmentCategories,
  getEquipmentLabel,
  modelsForBrand,
  normalizeBrandDraft,
  normalizeEquipmentDraft,
  normalizeModelDraft,
  normalizePurchaseDraft,
  slugifyEquipmentName,
} from "../domain/equipmentLibrary.js";
import { useTranslation } from "../i18n/translations.js";

function EquipmentImage({ item, large = false }) {
  const { t } = useTranslation();
  if (!item?.image) {
    return <div className={large ? "equipment-image placeholder large" : "equipment-image placeholder"}>{t("No image")}</div>;
  }
  return <img className={large ? "equipment-image large" : "equipment-image"} src={item.image} alt={getEquipmentLabel(item)} />;
}

function BrandLogo({ brand }) {
  const [failed, setFailed] = useState(false);
  const logoUrl = String(brand?.logo_url || "").trim();
  if (!logoUrl || failed) {
    return <div className="brand-logo placeholder">{String(brand?.name || "?").slice(0, 2).toUpperCase()}</div>;
  }
  return <img className="brand-logo" src={logoUrl} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

function EquipmentDetail({ item, canDelete, onEdit, onNew, onDelete, onAddOwned }) {
  const { t } = useTranslation();
  if (!item) {
    return (
      <section className="app-panel equipment-detail-panel">
        <div className="empty-state">{t("Choose equipment to inspect it.")}</div>
      </section>
    );
  }

  return (
    <section className="app-panel equipment-detail-panel">
      <EquipmentImage item={item} large />
      <div className="exercise-detail-content">
        <div>
          <p className="eyebrow">{item.category || t("Equipment")}</p>
          <h2>{getEquipmentLabel(item)}</h2>
          <span className="visually-muted">{item.name}</span>
        </div>
        <div className="exercise-badge-row">
          {item.brand_name ? <span>{item.brand_name}</span> : null}
          {item.model_name ? <span>{item.model_name}</span> : null}
          {item.category ? <span>{item.category}</span> : null}
        </div>
        {item.description ? <p>{item.description}</p> : <p className="visually-muted">{t("No description yet.")}</p>}
        <div className="day-modal-actions">
          <button type="button" className="primary-action" onClick={() => onAddOwned(item)}>
            {t("Add To My Gear")}
          </button>
          <button type="button" className="secondary-action" onClick={() => onEdit(item)}>
            {t("Edit Details")}
          </button>
          <button type="button" className="secondary-action" onClick={onNew}>
            {t("New Equipment")}
          </button>
          {item.link ? (
            <a className="secondary-action" href={item.link} target="_blank" rel="noreferrer">
              {t("Open Link")}
            </a>
          ) : null}
          {canDelete ? (
            <button type="button" onClick={() => onDelete(item)}>
              {t("Delete")}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function EquipmentEditor({ draft, mode, brands, models, saving, onChange, onSave, onCancel }) {
  const { t } = useTranslation();
  const brandModels = modelsForBrand(models, draft.brand_id);

  function updateField(field, value) {
    onChange((current) => {
      const next = { ...current, [field]: value };
      if (field === "name") {
        next.name = slugifyEquipmentName(value);
      }
      if (field === "brand_id") {
        const nextModels = modelsForBrand(models, value);
        next.model_id = nextModels.some((model) => Number(model.id) === Number(current.model_id)) ? current.model_id : nextModels[0]?.id || "";
      }
      return next;
    });
  }

  return (
    <section className="app-panel equipment-editor-panel">
      <header className="strength-editor-header">
        <div>
          <p className="eyebrow">{mode === "create" ? t("New") : t("Editing")}</p>
          <h2>{mode === "create" ? t("Add Equipment") : t("Edit Equipment")}</h2>
        </div>
        <button type="button" onClick={onCancel}>
          {t("Close")}
        </button>
      </header>

      <div className="form-grid">
        <label>
          {t("Technical name")}
          <input value={draft.name || ""} onChange={(event) => updateField("name", event.target.value)} placeholder="solution_comp_pair" />
        </label>
        <label>
          {t("Category")}
          <input value={draft.category || ""} onChange={(event) => updateField("category", event.target.value)} placeholder="shoes, rope, belay..." />
        </label>
        <label>
          {t("Brand")}
          <select value={draft.brand_id || ""} onChange={(event) => updateField("brand_id", event.target.value)}>
            <option value="">{t("Choose brand")}</option>
            {brands.map((brand) => (
              <option value={brand.id} key={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Model")}
          <select value={draft.model_id || ""} onChange={(event) => updateField("model_id", event.target.value)}>
            <option value="">{t("Choose model")}</option>
            {brandModels.map((model) => (
              <option value={model.id} key={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Image URL")}
          <input value={draft.image || ""} onChange={(event) => updateField("image", event.target.value)} placeholder="https://..." />
        </label>
        <label>
          {t("Reference link")}
          <input value={draft.link || ""} onChange={(event) => updateField("link", event.target.value)} placeholder="https://..." />
        </label>
      </div>

      <label>
        {t("Description")}
        <textarea value={draft.description || ""} onChange={(event) => updateField("description", event.target.value)} />
      </label>

      <div className="day-modal-actions">
        <button type="button" className="primary-action" onClick={onSave} disabled={saving || !draft.name || !draft.brand_id || !draft.model_id}>
          {saving ? t("Saving...") : t("Save Equipment")}
        </button>
      </div>
    </section>
  );
}

function OwnedGearPanel({ equipment, purchases, saving, onAdd, onEdit, onDelete, draft, editingId, onDraftChange, onSave, onCancel }) {
  const { t } = useTranslation();
  return (
    <section className="equipment-owned-layout">
      <div className="app-panel equipment-owned-list">
        <div className="exercise-list-header">
          <strong>{t("Owned item count", { count: purchases.length })}</strong>
          <button type="button" className="primary-action" onClick={onAdd}>
            {t("Add Owned Gear")}
          </button>
        </div>
        <div className="exercise-list-scroll">
          {purchases.map((purchase) => (
            <article className="owned-equipment-row" key={purchase.id}>
              <EquipmentImage item={purchase} />
              <div>
                <strong>{purchase.display_name || purchase.equipment_name}</strong>
                <span>{purchase.purchase_date || t("No date")}{purchase.purchase_price ? ` - ${purchase.purchase_price}` : ""}</span>
                {purchase.note ? <small>{purchase.note}</small> : null}
              </div>
              <div className="compact-actions">
                <button type="button" onClick={() => onEdit(purchase)}>
                  {t("Edit")}
                </button>
                <button type="button" onClick={() => onDelete(purchase)}>
                  {t("Delete")}
                </button>
              </div>
            </article>
          ))}
          {!purchases.length ? <div className="empty-state compact">{t("No owned gear yet.")}</div> : null}
        </div>
      </div>

      <section className="app-panel equipment-editor-panel">
        <header className="strength-editor-header">
          <div>
            <p className="eyebrow">{t("My Gear")}</p>
            <h2>{editingId ? t("Edit Owned Gear") : t("Add Owned Gear")}</h2>
          </div>
          {editingId ? (
            <button type="button" onClick={onCancel}>
                {t("Cancel")}
            </button>
          ) : null}
        </header>
        <div className="form-grid">
          <label>
            {t("Equipment")}
            <select value={draft.equipment_id || ""} onChange={(event) => onDraftChange((current) => ({ ...current, equipment_id: event.target.value }))}>
              <option value="">{t("Choose equipment")}</option>
              {equipment.map((item) => (
                <option key={item.id} value={item.id}>
                  {getEquipmentLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Purchase date")}
            <input type="date" value={draft.purchase_date || ""} onChange={(event) => onDraftChange((current) => ({ ...current, purchase_date: event.target.value }))} />
          </label>
          <label>
            {t("Purchase price")}
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.purchase_price || ""}
              onChange={(event) => onDraftChange((current) => ({ ...current, purchase_price: event.target.value }))}
            />
          </label>
        </div>
        <label>
          {t("Notes")}
          <textarea value={draft.note || ""} onChange={(event) => onDraftChange((current) => ({ ...current, note: event.target.value }))} />
        </label>
        <button type="button" className="primary-action" onClick={onSave} disabled={saving || !draft.equipment_id || !draft.purchase_date}>
          {saving ? t("Saving...") : t("Save Owned Gear")}
        </button>
      </section>
    </section>
  );
}

function TaxonomyPanel({
  brands,
  countries,
  models,
  canDelete,
  saving,
  brandDraft,
  modelDraft,
  editingBrandId,
  editingModelId,
  onBrandDraftChange,
  onModelDraftChange,
  onSaveBrand,
  onSaveModel,
  onEditBrand,
  onEditModel,
  onDeleteBrand,
  onDeleteModel,
  onCancelBrand,
  onCancelModel,
}) {
  const { t } = useTranslation();
  const [activeCreator, setActiveCreator] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState(brands[0]?.id || "");
  const [showBrandModels, setShowBrandModels] = useState(false);
  const selectedBrand = brands.find((brand) => Number(brand.id) === Number(selectedBrandId)) || brands[0] || null;
  const activeBrandId = selectedBrand?.id || "";
  const brandModels = modelsForBrand(models, activeBrandId);
  const showBrandEditor = activeCreator === "brand" || Boolean(editingBrandId);
  const showModelEditor = activeCreator === "model" || Boolean(editingModelId);

  useEffect(() => {
    if (!brands.length) {
      setSelectedBrandId("");
      return;
    }
    if (!brands.some((brand) => Number(brand.id) === Number(selectedBrandId))) {
      setSelectedBrandId(brands[0].id);
    }
  }, [brands, selectedBrandId]);

  function closeBrandEditor() {
    onCancelBrand();
    setActiveCreator("");
  }

  function closeModelEditor() {
    onCancelModel();
    setActiveCreator("");
  }

  function openBrandModels(brand) {
    setSelectedBrandId(brand.id);
    onCancelModel();
    setActiveCreator("");
    setShowBrandModels(true);
  }

  function closeBrandModels() {
    onCancelModel();
    setActiveCreator("");
    setShowBrandModels(false);
  }

  function openNewModelForSelectedBrand() {
    if (!activeBrandId) return;
    onCancelBrand();
    onCancelModel();
    onModelDraftChange((current) => ({ ...current, brand_id: activeBrandId }));
    setActiveCreator("model");
  }

  async function saveBrandAndClose() {
    if (!brandDraft.name) return;
    if (await onSaveBrand()) {
      setActiveCreator("");
    }
  }

  async function saveModelAndClose() {
    if (!modelDraft.brand_id || !modelDraft.name) return;
    if (await onSaveModel()) {
      setActiveCreator("");
    }
  }

  return (
    <section className="equipment-taxonomy-grid">
      <div className="app-panel taxonomy-create-panel">
        <header className="strength-editor-header">
          <div>
            <p className="eyebrow">{t("Configuration")}</p>
            <h2>{t("Brands and models")}</h2>
          </div>
          <div className="compact-actions">
            {canDelete ? (
              <>
                <button type="button" onClick={() => {
                  onCancelModel();
                  onCancelBrand();
                  setActiveCreator((current) => (current === "brand" ? "" : "brand"));
                }}>
                  {t("New brand")}
                </button>
              </>
            ) : null}
          </div>
        </header>
      </div>

      {showBrandEditor ? (
        <div className="app-panel equipment-editor-panel taxonomy-editor-panel">
          <header className="strength-editor-header">
            <div>
              <p className="eyebrow">{t("Brands")}</p>
              <h2>{editingBrandId ? t("Edit Brand") : t("Add Brand")}</h2>
            </div>
            <button type="button" onClick={closeBrandEditor}>
              {t("Cancel")}
            </button>
          </header>
          <div className="form-grid">
            <label>
              {t("Brand name")}
              <input value={brandDraft.name || ""} onChange={(event) => onBrandDraftChange((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              {t("Country")}
              <select value={brandDraft.country_id || ""} onChange={(event) => onBrandDraftChange((current) => ({ ...current, country_id: event.target.value }))}>
                <option value="">{t("No country")}</option>
                {countries.map((country) => (
                  <option value={country.id} key={country.id}>
                    {country.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Established")}
              <input
                type="number"
                min="1500"
                max={new Date().getFullYear()}
                value={brandDraft.year_established || ""}
                onChange={(event) => onBrandDraftChange((current) => ({ ...current, year_established: event.target.value }))}
              />
            </label>
            <label>
              {t("Created at")}
              <input type="date" value={brandDraft.created_at || ""} onChange={(event) => onBrandDraftChange((current) => ({ ...current, created_at: event.target.value }))} />
            </label>
            <label>
              {t("Website")}
              <input value={brandDraft.website_url || ""} onChange={(event) => onBrandDraftChange((current) => ({ ...current, website_url: event.target.value }))} placeholder="https://..." />
            </label>
            <label>
              {t("Logo URL")}
              <input value={brandDraft.logo_url || ""} onChange={(event) => onBrandDraftChange((current) => ({ ...current, logo_url: event.target.value }))} placeholder="https://..." />
            </label>
          </div>
          <label>
            {t("Description")}
            <textarea value={brandDraft.description || ""} onChange={(event) => onBrandDraftChange((current) => ({ ...current, description: event.target.value }))} />
          </label>
          <label>
            {t("History")}
            <textarea value={brandDraft.history || ""} onChange={(event) => onBrandDraftChange((current) => ({ ...current, history: event.target.value }))} />
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={brandDraft.is_active !== false} onChange={(event) => onBrandDraftChange((current) => ({ ...current, is_active: event.target.checked }))} />
            {t("Active")}
          </label>
          <button type="button" className="primary-action" onClick={saveBrandAndClose} disabled={saving || !brandDraft.name}>
            {saving ? t("Saving...") : t("Save Brand")}
          </button>
        </div>
      ) : null}

      <div className="app-panel equipment-editor-panel brand-list-panel">
        <header className="strength-editor-header">
          <div>
            <p className="eyebrow">{t("Brands")}</p>
            <h2>{t("All brands")}</h2>
          </div>
          <span className="visually-muted">{t("Brand count", { count: brands.length })}</span>
        </header>
        <div className="taxonomy-list">
          {brands.map((brand) => (
            <article key={brand.id} className="taxonomy-row brand-taxonomy-row">
              <BrandLogo brand={brand} />
              <div className="brand-taxonomy-content">
                <div className="brand-card-header">
                  <div>
                    <strong>{brand.name}</strong>
                    <small>{[brand.country_name, brand.country_iso_code, brand.year_established ? `${t("Established")} ${brand.year_established}` : "", brand.is_active === false ? t("Inactive") : t("Active")].filter(Boolean).join(" - ") || brand.created_at}</small>
                  </div>
                  <div className="compact-actions">
                    <button type="button" onClick={() => openBrandModels(brand)}>
                      {t("Select")}
                    </button>
                    {canDelete ? (
                      <>
                        <button type="button" onClick={() => {
                          setActiveCreator("brand");
                          onEditBrand(brand);
                        }}>
                          {t("Edit")}
                        </button>
                        <button type="button" onClick={() => onDeleteBrand(brand)}>
                          {t("Delete")}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                {brand.description ? <p>{brand.description}</p> : null}
                {brand.history ? <p className="brand-history">{brand.history}</p> : null}
                <div className="brand-link-row">
                  {brand.website_url ? (
                    <a href={brand.website_url} target="_blank" rel="noreferrer">
                      {t("Website")}
                    </a>
                  ) : null}
                  {brand.normalized_name ? <span>{brand.normalized_name}</span> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {showBrandModels && selectedBrand ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeBrandModels}>
          <section className="day-modal brand-model-modal" role="dialog" aria-modal="true" aria-label={t("Brand models", { brand: selectedBrand.name })} onMouseDown={(event) => event.stopPropagation()}>
            <header className="day-modal-header">
              <div>
                <p className="eyebrow">{t("Models")}</p>
                <h2>{selectedBrand.name}</h2>
                <span>{t("Brand models", { brand: selectedBrand.name })}</span>
              </div>
              <div className="compact-actions">
                {canDelete ? (
                  <button type="button" onClick={openNewModelForSelectedBrand}>
                    {t("New model")}
                  </button>
                ) : null}
                <button type="button" onClick={closeBrandModels}>
                  {t("Close")}
                </button>
              </div>
            </header>

            <div className="brand-model-modal-body">
              {showModelEditor && canDelete ? (
                <div className="app-panel equipment-editor-panel taxonomy-editor-panel">
                  <header className="strength-editor-header">
                    <div>
                      <p className="eyebrow">{t("Models")}</p>
                      <h2>{editingModelId ? t("Edit Model") : t("Add Model")}</h2>
                    </div>
                    <button type="button" onClick={closeModelEditor}>
                      {t("Cancel")}
                    </button>
                  </header>
                  <div className="form-grid">
                    <label>
                      {t("Model name")}
                      <input value={modelDraft.name || ""} onChange={(event) => onModelDraftChange((current) => ({ ...current, name: event.target.value }))} />
                    </label>
                    <label>
                      {t("Created at")}
                      <input type="date" value={modelDraft.created_at || ""} onChange={(event) => onModelDraftChange((current) => ({ ...current, created_at: event.target.value }))} />
                    </label>
                  </div>
                  <label>
                    {t("History")}
                    <textarea value={modelDraft.history || ""} onChange={(event) => onModelDraftChange((current) => ({ ...current, history: event.target.value }))} />
                  </label>
                  <button type="button" className="primary-action" onClick={saveModelAndClose} disabled={saving || !modelDraft.brand_id || !modelDraft.name}>
                    {saving ? t("Saving...") : t("Save Model")}
                  </button>
                </div>
              ) : null}

              <div className="taxonomy-list">
                {brandModels.map((model) => (
                  <article key={model.id} className="taxonomy-row">
                    <div>
                      <strong>{model.name}</strong>
                      <small>{model.created_at || selectedBrand.name}</small>
                    </div>
                    <div className="compact-actions">
                      {canDelete ? (
                        <>
                          <button type="button" onClick={() => {
                            setActiveCreator("model");
                            onEditModel(model);
                          }}>
                            {t("Edit")}
                          </button>
                          <button type="button" onClick={() => onDeleteModel(model)}>
                            {t("Delete")}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </article>
                ))}
                {!brandModels.length ? <div className="empty-state compact">{t("No model for this brand yet.")}</div> : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export default function EquipmentPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [countries, setCountries] = useState([]);
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [view, setView] = useState("catalog");
  const [query, setQuery] = useState("");
  const [brandId, setBrandId] = useState("");
  const [category, setCategory] = useState("");
  const [selectedEquipmentId, setSelectedEquipmentId] = useState("");
  const [equipmentEditorMode, setEquipmentEditorMode] = useState("");
  const [equipmentDraft, setEquipmentDraft] = useState(blankEquipment);
  const [purchaseDraft, setPurchaseDraft] = useState(blankPurchase);
  const [editingPurchaseId, setEditingPurchaseId] = useState(null);
  const [brandDraft, setBrandDraft] = useState(blankBrand);
  const [modelDraft, setModelDraft] = useState(blankModel);
  const [editingBrandId, setEditingBrandId] = useState(null);
  const [editingModelId, setEditingModelId] = useState(null);

  function loadData(nextSelectedId = selectedEquipmentId) {
    setStatus("loading");
    setError("");
    return Promise.all([getCountries(), getEquipmentBrands(), getEquipmentModels(), getEquipment(), getMyEquipment()])
      .then(([countryRows, brandRows, modelRows, equipmentRows, purchaseRows]) => {
        const nextCountries = Array.isArray(countryRows) ? countryRows : [];
        const nextBrands = Array.isArray(brandRows) ? brandRows : [];
        const nextModels = Array.isArray(modelRows) ? modelRows : [];
        const nextEquipment = Array.isArray(equipmentRows) ? equipmentRows : [];
        setCountries(nextCountries);
        setBrands(nextBrands);
        setModels(nextModels);
        setEquipment(nextEquipment);
        setPurchases(Array.isArray(purchaseRows) ? purchaseRows : []);
        setSelectedEquipmentId(nextSelectedId || nextEquipment[0]?.id || "");
        setBrandDraft((current) => (current.name ? current : blankBrand()));
        setModelDraft((current) => (current.name ? current : blankModel(nextBrands[0]?.id || "")));
        setPurchaseDraft((current) => (current.equipment_id ? current : blankPurchase(nextEquipment[0]?.id || "")));
        setStatus("ready");
      })
      .catch((loadError) => {
        setError(loadError.message);
        setStatus("error");
      });
  }

  useEffect(() => {
    loadData("");
  }, [user?.language]);

  const categories = useMemo(() => getEquipmentCategories(equipment), [equipment]);
  const filteredEquipment = useMemo(
    () => filterEquipment(equipment, { query, brandId, category }),
    [equipment, query, brandId, category],
  );
  const selectedEquipment = useMemo(
    () =>
      filteredEquipment.find((item) => Number(item.id) === Number(selectedEquipmentId)) ||
      filteredEquipment[0] ||
      equipment.find((item) => Number(item.id) === Number(selectedEquipmentId)) ||
      equipment[0],
    [equipment, filteredEquipment, selectedEquipmentId],
  );

  function openEquipmentEditor(item = null) {
    const firstBrandId = brands[0]?.id || "";
    const firstModelId = modelsForBrand(models, item?.brand_id || firstBrandId)[0]?.id || "";
    setEquipmentDraft(item ? normalizeEquipmentDraft(item) : blankEquipment(firstBrandId, firstModelId));
    setEquipmentEditorMode(item ? "edit" : "create");
    setView("catalog");
  }

  async function saveEquipment() {
    const payload = normalizeEquipmentDraft(equipmentDraft);
    if (!payload.name || !payload.brand_id || !payload.model_id) return;
    setStatus("saving");
    setError("");
    try {
      const result = equipmentEditorMode === "edit" && payload.id ? await updateEquipment(payload.id, payload) : await createEquipment(payload);
      setEquipmentEditorMode("");
      await loadData(result.equipment?.id || payload.id || "");
    } catch (saveError) {
      setError(saveError.message);
      setStatus("ready");
    }
  }

  async function removeEquipment(item) {
    if (!window.confirm(`${t("Delete")} "${getEquipmentLabel(item)}"?`)) return;
    setStatus("saving");
    setError("");
    try {
      await deleteEquipment(item.id);
      await loadData("");
    } catch (deleteError) {
      setError(deleteError.message);
      setStatus("ready");
    }
  }

  function openPurchaseEditor(purchaseOrEquipment = null) {
    if (purchaseOrEquipment?.purchase_date) {
      setPurchaseDraft(normalizePurchaseDraft(purchaseOrEquipment));
      setEditingPurchaseId(purchaseOrEquipment.id);
    } else {
      setPurchaseDraft(blankPurchase(purchaseOrEquipment?.id || selectedEquipment?.id || equipment[0]?.id || ""));
      setEditingPurchaseId(null);
    }
    setView("owned");
  }

  async function savePurchase() {
    const payload = normalizePurchaseDraft(purchaseDraft);
    if (!payload.equipment_id || !payload.purchase_date) return;
    setStatus("saving");
    setError("");
    try {
      if (editingPurchaseId) {
        await updateMyEquipment(editingPurchaseId, payload);
      } else {
        await createMyEquipment(payload);
      }
      setEditingPurchaseId(null);
      await loadData(selectedEquipment?.id || "");
    } catch (saveError) {
      setError(saveError.message);
      setStatus("ready");
    }
  }

  async function removePurchase(purchase) {
    if (!window.confirm(`${t("Delete")} "${purchase.display_name || purchase.equipment_name}"?`)) return;
    setStatus("saving");
    setError("");
    try {
      await deleteMyEquipment(purchase.id);
      await loadData(selectedEquipment?.id || "");
    } catch (deleteError) {
      setError(deleteError.message);
      setStatus("ready");
    }
  }

  async function saveBrand() {
    const payload = normalizeBrandDraft(brandDraft);
    if (!payload.name) return false;
    setStatus("saving");
    setError("");
    try {
      if (editingBrandId) {
        await updateEquipmentBrand(editingBrandId, payload);
      } else {
        await createEquipmentBrand(payload);
      }
      setEditingBrandId(null);
      setBrandDraft(blankBrand());
      await loadData(selectedEquipment?.id || "");
      return true;
    } catch (saveError) {
      setError(saveError.message);
      setStatus("ready");
      return false;
    }
  }

  async function saveModel() {
    const payload = normalizeModelDraft(modelDraft);
    if (!payload.brand_id || !payload.name) return false;
    setStatus("saving");
    setError("");
    try {
      if (editingModelId) {
        await updateEquipmentModel(editingModelId, payload);
      } else {
        await createEquipmentModel(payload);
      }
      setEditingModelId(null);
      setModelDraft(blankModel(payload.brand_id));
      await loadData(selectedEquipment?.id || "");
      return true;
    } catch (saveError) {
      setError(saveError.message);
      setStatus("ready");
      return false;
    }
  }

  async function removeBrand(brand) {
    if (!window.confirm(`${t("Delete")} "${brand.name}"?`)) return;
    setStatus("saving");
    setError("");
    try {
      await deleteEquipmentBrand(brand.id);
      await loadData(selectedEquipment?.id || "");
    } catch (deleteError) {
      setError(deleteError.message);
      setStatus("ready");
    }
  }

  async function removeModel(model) {
    if (!window.confirm(`${t("Delete")} "${model.name}"?`)) return;
    setStatus("saving");
    setError("");
    try {
      await deleteEquipmentModel(model.id);
      await loadData(selectedEquipment?.id || "");
    } catch (deleteError) {
      setError(deleteError.message);
      setStatus("ready");
    }
  }

  return (
    <main className="page-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">{t("Gear")}</p>
          <h1>{t("Equipment")}</h1>
        </div>
        <div className="day-modal-actions">
          <button type="button" className="primary-action" onClick={() => openEquipmentEditor()}>
            {t("Add Equipment")}
          </button>
          <button type="button" className="secondary-action" onClick={() => openPurchaseEditor()}>
            {t("Add Owned Gear")}
          </button>
        </div>
      </section>

      <section className="calendar-toolbar app-panel equipment-toolbar">
        <div className="view-switch">
          <button type="button" className={view === "catalog" ? "active" : ""} onClick={() => setView("catalog")}>
            {t("Catalog")}
          </button>
          <button type="button" className={view === "owned" ? "active" : ""} onClick={() => setView("owned")}>
            {t("My Gear")}
          </button>
          <button type="button" className={view === "taxonomy" ? "active" : ""} onClick={() => setView("taxonomy")}>
            {t("Brands")}
          </button>
        </div>
        {view === "catalog" ? (
          <>
            <label>
              {t("Search")}
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`${t("Brand")}, ${t("Model")}, ${t("Category")}...`} />
            </label>
            <label>
              {t("Brand")}
              <select value={brandId} onChange={(event) => setBrandId(event.target.value)}>
                <option value="">{t("All brands")}</option>
                {brands.map((brand) => (
                  <option value={brand.id} key={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Category")}
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">{t("All categories")}</option>
                {categories.map((categoryName) => (
                  <option value={categoryName} key={categoryName}>
                    {categoryName}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </section>

      {error ? <div className="error-banner">{error}</div> : null}
      {status === "loading" ? <div className="app-panel empty-state">{t("Loading equipment...")}</div> : null}

      {view === "catalog" ? (
        <section className="exercise-library-layout">
          <div className="exercise-list-panel app-panel">
            <div className="exercise-list-header">
              <strong>{filteredEquipment.length} item(s)</strong>
              <span>{purchases.length} owned</span>
            </div>
            <div className="exercise-list-scroll">
              {filteredEquipment.map((item) => (
                <button
                  type="button"
                  className={Number(item.id) === Number(selectedEquipment?.id) ? "exercise-list-row active" : "exercise-list-row"}
                  key={item.id}
                  onClick={() => setSelectedEquipmentId(item.id)}
                >
                  <EquipmentImage item={item} />
                  <span>
                    <strong>{getEquipmentLabel(item)}</strong>
                    <small>{item.category || t("Uncategorized")} - {item.brand_name || t("No brand")}</small>
                  </span>
                </button>
              ))}
              {!filteredEquipment.length && status !== "loading" ? <div className="empty-state compact">{t("No equipment matches this filter.")}</div> : null}
            </div>
          </div>

          <div className="exercise-main-column">
            {equipmentEditorMode ? (
              <EquipmentEditor
                draft={equipmentDraft}
                mode={equipmentEditorMode}
                brands={brands}
                models={models}
                saving={status === "saving"}
                onChange={setEquipmentDraft}
                onSave={saveEquipment}
                onCancel={() => setEquipmentEditorMode("")}
              />
            ) : (
              <EquipmentDetail
                item={selectedEquipment}
                canDelete={Boolean(user?.isAdmin && selectedEquipment?.id)}
                onEdit={openEquipmentEditor}
                onNew={() => openEquipmentEditor()}
                onDelete={removeEquipment}
                onAddOwned={openPurchaseEditor}
              />
            )}
          </div>
        </section>
      ) : null}

      {view === "owned" ? (
        <OwnedGearPanel
          equipment={equipment}
          purchases={purchases}
          saving={status === "saving"}
          onAdd={() => openPurchaseEditor()}
          onEdit={openPurchaseEditor}
          onDelete={removePurchase}
          draft={purchaseDraft}
          editingId={editingPurchaseId}
          onDraftChange={setPurchaseDraft}
          onSave={savePurchase}
          onCancel={() => {
            setEditingPurchaseId(null);
            setPurchaseDraft(blankPurchase(selectedEquipment?.id || ""));
          }}
        />
      ) : null}

      {view === "taxonomy" ? (
        <TaxonomyPanel
          brands={brands}
          countries={countries}
          models={models}
          canDelete={Boolean(user?.isAdmin)}
          saving={status === "saving"}
          brandDraft={brandDraft}
          modelDraft={modelDraft}
          editingBrandId={editingBrandId}
          editingModelId={editingModelId}
          onBrandDraftChange={setBrandDraft}
          onModelDraftChange={setModelDraft}
          onSaveBrand={saveBrand}
          onSaveModel={saveModel}
          onEditBrand={(brand) => {
            setEditingBrandId(brand.id);
            setBrandDraft(normalizeBrandDraft(brand));
          }}
          onEditModel={(model) => {
            setEditingModelId(model.id);
            setModelDraft(normalizeModelDraft(model));
          }}
          onDeleteBrand={removeBrand}
          onDeleteModel={removeModel}
          onCancelBrand={() => {
            setEditingBrandId(null);
            setBrandDraft(blankBrand());
          }}
          onCancelModel={() => {
            setEditingModelId(null);
            setModelDraft(blankModel(brands[0]?.id || ""));
          }}
        />
      ) : null}
    </main>
  );
}

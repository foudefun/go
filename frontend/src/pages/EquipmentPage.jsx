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

function EquipmentImage({ item, large = false }) {
  if (!item?.image) {
    return <div className={large ? "equipment-image placeholder large" : "equipment-image placeholder"}>No image</div>;
  }
  return <img className={large ? "equipment-image large" : "equipment-image"} src={item.image} alt={getEquipmentLabel(item)} />;
}

function EquipmentDetail({ item, canDelete, onEdit, onNew, onDelete, onAddOwned }) {
  if (!item) {
    return (
      <section className="app-panel equipment-detail-panel">
        <div className="empty-state">Choose equipment to inspect it.</div>
      </section>
    );
  }

  return (
    <section className="app-panel equipment-detail-panel">
      <EquipmentImage item={item} large />
      <div className="exercise-detail-content">
        <div>
          <p className="eyebrow">{item.category || "Equipment"}</p>
          <h2>{getEquipmentLabel(item)}</h2>
          <span className="visually-muted">{item.name}</span>
        </div>
        <div className="exercise-badge-row">
          {item.brand_name ? <span>{item.brand_name}</span> : null}
          {item.model_name ? <span>{item.model_name}</span> : null}
          {item.category ? <span>{item.category}</span> : null}
        </div>
        {item.description ? <p>{item.description}</p> : <p className="visually-muted">No description yet.</p>}
        <div className="day-modal-actions">
          <button type="button" className="primary-action" onClick={() => onAddOwned(item)}>
            Add To My Gear
          </button>
          <button type="button" className="secondary-action" onClick={() => onEdit(item)}>
            Edit Details
          </button>
          <button type="button" className="secondary-action" onClick={onNew}>
            New Equipment
          </button>
          {item.link ? (
            <a className="secondary-action" href={item.link} target="_blank" rel="noreferrer">
              Open Link
            </a>
          ) : null}
          {canDelete ? (
            <button type="button" onClick={() => onDelete(item)}>
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function EquipmentEditor({ draft, mode, brands, models, saving, onChange, onSave, onCancel }) {
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
          <p className="eyebrow">{mode === "create" ? "New" : "Editing"}</p>
          <h2>{mode === "create" ? "Add Equipment" : "Edit Equipment"}</h2>
        </div>
        <button type="button" onClick={onCancel}>
          Close
        </button>
      </header>

      <div className="form-grid">
        <label>
          Technical name
          <input value={draft.name || ""} onChange={(event) => updateField("name", event.target.value)} placeholder="solution_comp_pair" />
        </label>
        <label>
          Category
          <input value={draft.category || ""} onChange={(event) => updateField("category", event.target.value)} placeholder="shoes, rope, belay..." />
        </label>
        <label>
          Brand
          <select value={draft.brand_id || ""} onChange={(event) => updateField("brand_id", event.target.value)}>
            <option value="">Choose brand</option>
            {brands.map((brand) => (
              <option value={brand.id} key={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Model
          <select value={draft.model_id || ""} onChange={(event) => updateField("model_id", event.target.value)}>
            <option value="">Choose model</option>
            {brandModels.map((model) => (
              <option value={model.id} key={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Image URL
          <input value={draft.image || ""} onChange={(event) => updateField("image", event.target.value)} placeholder="https://..." />
        </label>
        <label>
          Reference link
          <input value={draft.link || ""} onChange={(event) => updateField("link", event.target.value)} placeholder="https://..." />
        </label>
      </div>

      <label>
        Description
        <textarea value={draft.description || ""} onChange={(event) => updateField("description", event.target.value)} />
      </label>

      <div className="day-modal-actions">
        <button type="button" className="primary-action" onClick={onSave} disabled={saving || !draft.name || !draft.brand_id || !draft.model_id}>
          {saving ? "Saving..." : "Save Equipment"}
        </button>
      </div>
    </section>
  );
}

function OwnedGearPanel({ equipment, purchases, saving, onAdd, onEdit, onDelete, draft, editingId, onDraftChange, onSave, onCancel }) {
  return (
    <section className="equipment-owned-layout">
      <div className="app-panel equipment-owned-list">
        <div className="exercise-list-header">
          <strong>{purchases.length} owned item(s)</strong>
          <button type="button" className="primary-action" onClick={onAdd}>
            Add Owned Gear
          </button>
        </div>
        <div className="exercise-list-scroll">
          {purchases.map((purchase) => (
            <article className="owned-equipment-row" key={purchase.id}>
              <EquipmentImage item={purchase} />
              <div>
                <strong>{purchase.display_name || purchase.equipment_name}</strong>
                <span>{purchase.purchase_date || "No date"}{purchase.purchase_price ? ` - ${purchase.purchase_price}` : ""}</span>
                {purchase.note ? <small>{purchase.note}</small> : null}
              </div>
              <div className="compact-actions">
                <button type="button" onClick={() => onEdit(purchase)}>
                  Edit
                </button>
                <button type="button" onClick={() => onDelete(purchase)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
          {!purchases.length ? <div className="empty-state compact">No owned gear yet.</div> : null}
        </div>
      </div>

      <section className="app-panel equipment-editor-panel">
        <header className="strength-editor-header">
          <div>
            <p className="eyebrow">My Gear</p>
            <h2>{editingId ? "Edit Owned Gear" : "Add Owned Gear"}</h2>
          </div>
          {editingId ? (
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </header>
        <div className="form-grid">
          <label>
            Equipment
            <select value={draft.equipment_id || ""} onChange={(event) => onDraftChange((current) => ({ ...current, equipment_id: event.target.value }))}>
              <option value="">Choose equipment</option>
              {equipment.map((item) => (
                <option key={item.id} value={item.id}>
                  {getEquipmentLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Purchase date
            <input type="date" value={draft.purchase_date || ""} onChange={(event) => onDraftChange((current) => ({ ...current, purchase_date: event.target.value }))} />
          </label>
          <label>
            Purchase price
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
          Notes
          <textarea value={draft.note || ""} onChange={(event) => onDraftChange((current) => ({ ...current, note: event.target.value }))} />
        </label>
        <button type="button" className="primary-action" onClick={onSave} disabled={saving || !draft.equipment_id || !draft.purchase_date}>
          {saving ? "Saving..." : "Save Owned Gear"}
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
  const brandModels = modelsForBrand(models, modelDraft.brand_id || brands[0]?.id);

  return (
    <section className="equipment-taxonomy-grid">
      <div className="app-panel equipment-editor-panel">
        <header className="strength-editor-header">
          <div>
            <p className="eyebrow">Brands</p>
            <h2>{editingBrandId ? "Edit Brand" : "Add Brand"}</h2>
          </div>
          {editingBrandId ? (
            <button type="button" onClick={onCancelBrand}>
              Cancel
            </button>
          ) : null}
        </header>
        <div className="form-grid">
          <label>
            Brand name
            <input value={brandDraft.name || ""} onChange={(event) => onBrandDraftChange((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            Country
            <select value={brandDraft.country_id || ""} onChange={(event) => onBrandDraftChange((current) => ({ ...current, country_id: event.target.value }))}>
              <option value="">No country</option>
              {countries.map((country) => (
                <option value={country.id} key={country.id}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Established
            <input
              type="number"
              min="1500"
              max={new Date().getFullYear()}
              value={brandDraft.year_established || ""}
              onChange={(event) => onBrandDraftChange((current) => ({ ...current, year_established: event.target.value }))}
            />
          </label>
          <label>
            Created at
            <input type="date" value={brandDraft.created_at || ""} onChange={(event) => onBrandDraftChange((current) => ({ ...current, created_at: event.target.value }))} />
          </label>
          <label>
            Website
            <input value={brandDraft.website_url || ""} onChange={(event) => onBrandDraftChange((current) => ({ ...current, website_url: event.target.value }))} placeholder="https://..." />
          </label>
          <label>
            Logo URL
            <input value={brandDraft.logo_url || ""} onChange={(event) => onBrandDraftChange((current) => ({ ...current, logo_url: event.target.value }))} placeholder="https://..." />
          </label>
        </div>
        <label>
          Description
          <textarea value={brandDraft.description || ""} onChange={(event) => onBrandDraftChange((current) => ({ ...current, description: event.target.value }))} />
        </label>
        <label>
          History
          <textarea value={brandDraft.history || ""} onChange={(event) => onBrandDraftChange((current) => ({ ...current, history: event.target.value }))} />
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={brandDraft.is_active !== false} onChange={(event) => onBrandDraftChange((current) => ({ ...current, is_active: event.target.checked }))} />
          Active
        </label>
        <button type="button" className="primary-action" onClick={onSaveBrand} disabled={saving || !brandDraft.name}>
          {saving ? "Saving..." : "Save Brand"}
        </button>
        <div className="taxonomy-list">
          {brands.map((brand) => (
            <article key={brand.id} className="taxonomy-row">
              <div>
                <strong>{brand.name}</strong>
                <small>{[brand.country_name, brand.year_established, brand.is_active === false ? "Inactive" : ""].filter(Boolean).join(" - ") || brand.created_at}</small>
              </div>
              <div className="compact-actions">
                <button type="button" onClick={() => onEditBrand(brand)}>
                  Edit
                </button>
                {canDelete ? (
                  <button type="button" onClick={() => onDeleteBrand(brand)}>
                    Delete
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="app-panel equipment-editor-panel">
        <header className="strength-editor-header">
          <div>
            <p className="eyebrow">Models</p>
            <h2>{editingModelId ? "Edit Model" : "Add Model"}</h2>
          </div>
          {editingModelId ? (
            <button type="button" onClick={onCancelModel}>
              Cancel
            </button>
          ) : null}
        </header>
        <div className="form-grid">
          <label>
            Brand
            <select value={modelDraft.brand_id || ""} onChange={(event) => onModelDraftChange((current) => ({ ...current, brand_id: event.target.value }))}>
              <option value="">Choose brand</option>
              {brands.map((brand) => (
                <option value={brand.id} key={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Model name
            <input value={modelDraft.name || ""} onChange={(event) => onModelDraftChange((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            Created at
            <input type="date" value={modelDraft.created_at || ""} onChange={(event) => onModelDraftChange((current) => ({ ...current, created_at: event.target.value }))} />
          </label>
        </div>
        <label>
          History
          <textarea value={modelDraft.history || ""} onChange={(event) => onModelDraftChange((current) => ({ ...current, history: event.target.value }))} />
        </label>
        <button type="button" className="primary-action" onClick={onSaveModel} disabled={saving || !modelDraft.brand_id || !modelDraft.name}>
          {saving ? "Saving..." : "Save Model"}
        </button>
        <div className="taxonomy-list">
          {brandModels.map((model) => (
            <article key={model.id} className="taxonomy-row">
              <div>
                <strong>{model.name}</strong>
                <small>{model.brand_name || model.created_at}</small>
              </div>
              <div className="compact-actions">
                <button type="button" onClick={() => onEditModel(model)}>
                  Edit
                </button>
                {canDelete ? (
                  <button type="button" onClick={() => onDeleteModel(model)}>
                    Delete
                  </button>
                ) : null}
              </div>
            </article>
          ))}
          {!brandModels.length ? <div className="empty-state compact">No model for the selected brand yet.</div> : null}
        </div>
      </div>
    </section>
  );
}

export default function EquipmentPage() {
  const { user } = useAuth();
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
    if (!window.confirm(`Delete "${getEquipmentLabel(item)}"?`)) return;
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
    if (!window.confirm(`Delete owned gear "${purchase.display_name || purchase.equipment_name}"?`)) return;
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
    if (!payload.name) return;
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
    } catch (saveError) {
      setError(saveError.message);
      setStatus("ready");
    }
  }

  async function saveModel() {
    const payload = normalizeModelDraft(modelDraft);
    if (!payload.brand_id || !payload.name) return;
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
    } catch (saveError) {
      setError(saveError.message);
      setStatus("ready");
    }
  }

  async function removeBrand(brand) {
    if (!window.confirm(`Delete brand "${brand.name}"?`)) return;
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
    if (!window.confirm(`Delete model "${model.name}"?`)) return;
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
          <p className="eyebrow">Gear</p>
          <h1>Equipment</h1>
        </div>
        <div className="day-modal-actions">
          <button type="button" className="primary-action" onClick={() => openEquipmentEditor()}>
            Add Equipment
          </button>
          <button type="button" className="secondary-action" onClick={() => openPurchaseEditor()}>
            Add Owned Gear
          </button>
        </div>
      </section>

      <section className="calendar-toolbar app-panel equipment-toolbar">
        <div className="view-switch">
          <button type="button" className={view === "catalog" ? "active" : ""} onClick={() => setView("catalog")}>
            Catalog
          </button>
          <button type="button" className={view === "owned" ? "active" : ""} onClick={() => setView("owned")}>
            My Gear
          </button>
          <button type="button" className={view === "taxonomy" ? "active" : ""} onClick={() => setView("taxonomy")}>
            Brands
          </button>
        </div>
        {view === "catalog" ? (
          <>
            <label>
              Search
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Brand, model, category..." />
            </label>
            <label>
              Brand
              <select value={brandId} onChange={(event) => setBrandId(event.target.value)}>
                <option value="">All brands</option>
                {brands.map((brand) => (
                  <option value={brand.id} key={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">All categories</option>
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
      {status === "loading" ? <div className="app-panel empty-state">Loading equipment...</div> : null}

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
                    <small>{item.category || "Uncategorized"} - {item.brand_name || "No brand"}</small>
                  </span>
                </button>
              ))}
              {!filteredEquipment.length && status !== "loading" ? <div className="empty-state compact">No equipment matches this filter.</div> : null}
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

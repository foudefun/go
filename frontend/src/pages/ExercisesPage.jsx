import { useEffect, useMemo, useRef, useState } from "react";
import {
  createExercise,
  deleteExercise,
  deleteExerciseImage,
  getExercises,
  mergeExerciseInto,
  setPrimaryExerciseImage,
  updateExercise,
  uploadExerciseImage,
} from "../api/exerciseApi.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import {
  TRACKING_MODES,
  WEIGHT_UNITS,
  blankExercise,
  filterExercises,
  getExerciseCategoryList,
  getExerciseCategories,
  getExerciseLabel,
  normalizeExerciseDraft,
  slugifyExerciseName,
} from "../domain/exerciseLibrary.js";
import { useTranslation } from "../i18n/translations.js";

function getExerciseImages(exercise) {
  const images = Array.isArray(exercise?.images) ? exercise.images : [];
  return images.length ? images : exercise?.image ? [exercise.image] : [];
}

function ExerciseImage({ exercise, language = "en", large = false, onViewImage, t = (key) => key }) {
  const image = getExerciseImages(exercise)[0];
  if (!image) {
    return <div className={large ? "exercise-image placeholder large" : "exercise-image placeholder"}>{t("No image")}</div>;
  }
  const label = getExerciseLabel(exercise, language);
  const imageElement = <img className={large ? "exercise-image large" : "exercise-image"} src={image} alt={label} />;
  if (!onViewImage) {
    return imageElement;
  }
  return (
    <button type="button" className={large ? "image-view-button large" : "image-view-button"} onClick={() => onViewImage(image, label)}>
      {imageElement}
    </button>
  );
}

function getExerciseFamilyKey(exercise = {}) {
  return String(exercise.movement_family || "").trim() || String(exercise.name || "").trim();
}

function getRelatedExercises(exercise, exercises = []) {
  const familyKey = getExerciseFamilyKey(exercise);
  if (!exercise?.name || !familyKey) return [];
  return exercises
    .filter((candidate) => candidate.name !== exercise.name && getExerciseFamilyKey(candidate) === familyKey)
    .sort((left, right) => getExerciseLabel(left).localeCompare(getExerciseLabel(right)));
}

function getExerciseOptionLabel(exercise, language) {
  const variant = String(exercise.variant_label || "").trim();
  const label = getExerciseLabel(exercise, language);
  return variant ? `${label} - ${variant}` : label;
}

function ImageLightbox({ image, title, onClose, t }) {
  if (!image) return null;
  const fallbackTitle = t("Exercise image");
  return (
    <div className="modal-backdrop image-lightbox-backdrop" role="presentation" onClick={onClose}>
      <section className="image-lightbox" role="dialog" aria-modal="true" aria-label={title || fallbackTitle} onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>{title || fallbackTitle}</strong>
          <button type="button" onClick={onClose}>
            {t("Close")}
          </button>
        </header>
        <img src={image} alt={title || fallbackTitle} />
      </section>
    </div>
  );
}

function ExerciseDetail({ exercise, exercises, language, t, onEdit, onNew, onDelete, onViewImage, canDelete }) {
  const relatedExercises = getRelatedExercises(exercise, exercises);

  if (!exercise) {
    return (
      <section className="app-panel exercise-detail-panel">
        <div className="empty-state">{t("Choose an exercise to inspect it.")}</div>
      </section>
    );
  }

  return (
    <section className="app-panel exercise-detail-panel">
      <ExerciseImage exercise={exercise} language={language} t={t} large onViewImage={onViewImage} />
      <div className="exercise-detail-content">
        <div>
          <p className="eyebrow">{exercise.category || t("Exercise")}</p>
          <h2>{getExerciseLabel(exercise, language)}</h2>
          <span className="visually-muted">{exercise.name}</span>
        </div>
        <div className="exercise-badge-row">
          <span>{exercise.tracking_mode === "time_watts" ? t("Time / watts") : t("Reps / weight")}</span>
          <span>{exercise.weight_unit || "kg"}</span>
          {exercise.movement_family ? <span>{exercise.movement_family}</span> : null}
          {exercise.variant_label ? <span>{exercise.variant_label}</span> : null}
        </div>
        {exercise.description ? <p>{exercise.description}</p> : <p className="visually-muted">{t("No description yet.")}</p>}
        <div className="exercise-management-panel">
          <strong>{t("Close variants")}</strong>
          <p>{t("Linked through similar movement, without merging exercise records.")}</p>
          {relatedExercises.length ? (
            <div className="category-choice-list">
              {relatedExercises.map((relatedExercise) => (
                <button type="button" className="category-choice as-button" key={relatedExercise.name} onClick={() => onEdit(relatedExercise)}>
                  {getExerciseOptionLabel(relatedExercise, language)}
                </button>
              ))}
            </div>
          ) : (
            <span className="visually-muted">{t("No close variants linked yet.")}</span>
          )}
        </div>
        <div className="day-modal-actions">
          <button type="button" className="primary-action" onClick={() => onEdit(exercise)}>
            {t("Edit Details")}
          </button>
          <button type="button" className="secondary-action" onClick={onNew}>
            {t("New Exercise")}
          </button>
          {exercise.link ? (
            <a className="secondary-action" href={exercise.link} target="_blank" rel="noreferrer">
              {t("Open Link")}
            </a>
          ) : null}
          {canDelete ? (
            <button type="button" onClick={() => onDelete(exercise)}>
              {t("Delete")}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ExerciseEditor({
  draft,
  mode,
  saving,
  categories = [],
  exercises = [],
  language,
  canUploadImage,
  uploadingImage,
  imageUploadError,
  managingImage,
  canDelete,
  onChange,
  onSave,
  onCancel,
  onUploadImage,
  onSetPrimaryImage,
  onDeleteImage,
  onMerge,
  onDelete,
  onViewImage,
  t,
}) {
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [mergeTargetName, setMergeTargetName] = useState("");
  const fileInputRef = useRef(null);

  function updateField(field, value) {
    onChange((current) => {
      const next = { ...current, [field]: value };
      if (field === "display_name" && mode === "create" && !current.name) {
        next.name = slugifyExerciseName(value);
      }
      return next;
    });
  }

  function handleImageFiles(files) {
    const file = Array.from(files || []).find((candidate) => candidate.type.startsWith("image/"));
    if (file && canUploadImage) {
      onUploadImage(file);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDraggingImage(false);
    handleImageFiles(event.dataTransfer.files);
  }

  const imageUploadDisabled = !canUploadImage || uploadingImage;
  const images = getExerciseImages(draft);
  const selectedCategories = getExerciseCategoryList(draft);
  const sortedExerciseOptions = useMemo(
    () =>
      exercises
        .filter((exercise) => exercise.name !== draft.name)
        .sort((left, right) => getExerciseOptionLabel(left, language).localeCompare(getExerciseOptionLabel(right, language))),
    [draft.name, exercises, language],
  );
  const relatedExercises = useMemo(() => getRelatedExercises(draft, exercises), [draft, exercises]);
  const hasCurrentMovementFamily =
    draft.movement_family && !sortedExerciseOptions.some((exercise) => exercise.name === draft.movement_family);

  useEffect(() => {
    setMergeTargetName("");
  }, [draft.name]);

  function toggleCategory(categoryName) {
    const nextCategories = selectedCategories.includes(categoryName)
      ? selectedCategories.filter((value) => value !== categoryName)
      : [...selectedCategories, categoryName];
    updateField("category", nextCategories.join(", "));
  }

  return (
    <section className="app-panel exercise-editor-panel">
      <header className="strength-editor-header">
        <div>
          <p className="eyebrow">{mode === "create" ? t("New") : t("Editing")}</p>
          <h2>{mode === "create" ? t("Add Exercise") : t("Edit Exercise")}</h2>
        </div>
        <button type="button" onClick={onCancel}>
          {t("Close")}
        </button>
      </header>

      <div className="form-grid">
        <label>
          {t("Display name")}
          <input
            value={draft.display_name || ""}
            onChange={(event) => updateField("display_name", event.target.value)}
            placeholder="Back squat"
          />
        </label>
        <label>
          {t("Technical name")}
          <input
            value={draft.name || ""}
            onChange={(event) => updateField("name", slugifyExerciseName(event.target.value))}
            placeholder="back_squat"
          />
        </label>
        <label>
          {t("French name")}
          <input value={draft.display_name_fr || ""} onChange={(event) => updateField("display_name_fr", event.target.value)} />
        </label>
        <label>
          {t("English name")}
          <input value={draft.display_name_en || ""} onChange={(event) => updateField("display_name_en", event.target.value)} />
        </label>
        <label>
          {t("Movement family")}
          <select value={draft.movement_family || ""} onChange={(event) => updateField("movement_family", event.target.value)}>
            <option value="">{t("Standalone exercise")}</option>
            {hasCurrentMovementFamily ? <option value={draft.movement_family}>{draft.movement_family}</option> : null}
            {sortedExerciseOptions.map((exercise) => (
              <option key={exercise.name} value={exercise.name}>
                {getExerciseOptionLabel(exercise, language)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Variant")}
          <input value={draft.variant_label || ""} onChange={(event) => updateField("variant_label", event.target.value)} />
        </label>
        <label>
          {t("Tracking mode")}
          <select value={draft.tracking_mode || "reps_weight"} onChange={(event) => updateField("tracking_mode", event.target.value)}>
            {TRACKING_MODES.map((modeOption) => (
              <option key={modeOption.value} value={modeOption.value}>
                {t(modeOption.label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Weight unit")}
          <select value={draft.weight_unit || "kg"} onChange={(event) => updateField("weight_unit", event.target.value)}>
            {WEIGHT_UNITS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Primary image URL")}
          <input value={draft.image || ""} onChange={(event) => updateField("image", event.target.value)} placeholder="/api/uploads/exercises/..." />
        </label>
      </div>

      <div className="category-choice-panel">
        <p className="field-label">{t("Category")}</p>
        <div className="category-choice-list">
          {categories.map((categoryName) => (
            <label key={categoryName} className="category-choice">
              <input
                type="checkbox"
                checked={selectedCategories.includes(categoryName)}
                onChange={() => toggleCategory(categoryName)}
              />
              <span>{categoryName}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="exercise-image-upload-grid">
        <div>
          <p className="field-label">{t("Exercise image")}</p>
          <button
            type="button"
            className={
              isDraggingImage && !imageUploadDisabled
                ? "image-dropzone active"
                : imageUploadDisabled
                  ? "image-dropzone disabled"
                  : "image-dropzone"
            }
            disabled={imageUploadDisabled}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!imageUploadDisabled) setIsDraggingImage(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (!imageUploadDisabled) setIsDraggingImage(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDraggingImage(false);
            }}
            onDrop={handleDrop}
          >
            <span>{uploadingImage ? t("Uploading image...") : t("Drop image here or choose a file")}</span>
            <small>{canUploadImage ? t("PNG, JPEG, WebP or GIF") : t("Save the exercise before uploading images.")}</small>
          </button>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => {
              handleImageFiles(event.target.files);
              event.target.value = "";
            }}
          />
          {imageUploadError ? <p className="form-error-text">{imageUploadError}</p> : null}
        </div>
        {images.length ? (
          <div className="exercise-image-preview-list" aria-label={t("Current images")}>
            {images.map((image) => (
              <div key={image} className="exercise-image-preview-item">
                <button type="button" className="image-preview-button" onClick={() => onViewImage(image, getExerciseLabel(draft, language))}>
                  <img src={image} alt="" />
                </button>
                <div className="image-preview-actions">
                  <button type="button" disabled={image === images[0] || managingImage} onClick={() => onSetPrimaryImage(image)}>
                    {image === images[0] ? t("Main image") : t("Set as main")}
                  </button>
                  <button type="button" className="danger-action compact" disabled={managingImage} onClick={() => onDeleteImage(image)}>
                    {t("Delete")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <label>
        {t("Description")}
        <textarea value={draft.description || ""} onChange={(event) => updateField("description", event.target.value)} />
      </label>
      <label>
        {t("Reference link")}
        <input value={draft.link || ""} onChange={(event) => updateField("link", event.target.value)} placeholder="https://..." />
      </label>
      <label>
        {t("Document link")}
        <input value={draft.document || ""} onChange={(event) => updateField("document", event.target.value)} />
      </label>

      {mode === "edit" ? (
        <div className="exercise-management-panel">
          <div>
            <strong>{t("Exercise management")}</strong>
            <p>{t("Use similar movement to group variants. Use merge only when two records are truly the same exercise.")}</p>
          </div>
          <div>
            <p className="field-label">{t("Close variants")}</p>
            {relatedExercises.length ? (
              <div className="category-choice-list">
                {relatedExercises.map((exercise) => (
                  <span key={exercise.name} className="category-choice">
                    {getExerciseOptionLabel(exercise, language)}
                  </span>
                ))}
              </div>
            ) : (
              <span className="visually-muted">{t("No close variants linked yet.")}</span>
            )}
          </div>
          <div className="merge-control-row">
            <label>
              {t("Merge this exercise into")}
              <select value={mergeTargetName} onChange={(event) => setMergeTargetName(event.target.value)}>
                <option value="">{t("Choose target exercise")}</option>
                {sortedExerciseOptions.map((exercise) => (
                  <option key={exercise.name} value={exercise.name}>
                    {getExerciseOptionLabel(exercise, language)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="secondary-action" disabled={!mergeTargetName || saving} onClick={() => onMerge(draft, mergeTargetName)}>
              {t("Merge")}
            </button>
          </div>
          {canDelete ? (
            <button type="button" className="danger-action" disabled={saving} onClick={() => onDelete(draft)}>
              {t("Delete exercise")}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="day-modal-actions">
        <button type="button" className="primary-action" onClick={onSave} disabled={saving || !draft.name}>
          {saving ? t("Saving...") : t("Save Exercise")}
        </button>
      </div>
    </section>
  );
}

export default function ExercisesPage() {
  const { user } = useAuth();
  const { language, t } = useTranslation();
  const [exercises, setExercises] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [trackingMode, setTrackingMode] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [editorMode, setEditorMode] = useState("");
  const [editorOriginalName, setEditorOriginalName] = useState("");
  const [draft, setDraft] = useState(blankExercise);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [managingImage, setManagingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");
  const [imageViewer, setImageViewer] = useState({ image: "", title: "" });

  function loadExercises(nextSelectedName = selectedName) {
    setStatus("loading");
    setError("");
    return getExercises()
      .then((payload) => {
        const rows = Array.isArray(payload) ? payload : [];
        setExercises(rows);
        setSelectedName(nextSelectedName || rows[0]?.name || "");
        setStatus("ready");
      })
      .catch((loadError) => {
        setError(loadError.message);
        setStatus("error");
      });
  }

  useEffect(() => {
    loadExercises("");
  }, []);

  const categories = useMemo(() => getExerciseCategories(exercises), [exercises]);
  const filteredExercises = useMemo(
    () => filterExercises(exercises, { query, category, trackingMode, language }),
    [exercises, query, category, trackingMode, language],
  );
  const selectedExercise = useMemo(
    () =>
      filteredExercises.find((exercise) => exercise.name === selectedName) ||
      filteredExercises[0] ||
      exercises.find((exercise) => exercise.name === selectedName) ||
      exercises[0],
    [exercises, filteredExercises, selectedName],
  );

  function openCreateEditor() {
    setEditorMode("create");
    setEditorOriginalName("");
    setDraft(blankExercise());
    setImageUploadError("");
  }

  function openEditEditor(exercise) {
    setEditorMode("edit");
    setEditorOriginalName(exercise.name);
    setDraft(normalizeExerciseDraft(exercise));
    setImageUploadError("");
  }

  async function handleSave() {
    const payload = normalizeExerciseDraft(draft);
    if (!payload.name) return;
    setStatus("saving");
    setError("");
    try {
      const result =
        editorMode === "edit" && editorOriginalName
          ? await updateExercise(editorOriginalName, payload)
          : await createExercise(payload);
      const nextName = result.exercise?.name || payload.name;
      setEditorMode("");
      setEditorOriginalName("");
      await loadExercises(nextName);
    } catch (saveError) {
      setError(saveError.message);
      setStatus("ready");
    }
  }

  async function handleDelete(exercise) {
    if (!window.confirm(t('Delete "{name}"?', { name: getExerciseLabel(exercise, language) }))) return;
    setStatus("saving");
    setError("");
    try {
      await deleteExercise(exercise.name);
      setEditorMode("");
      setEditorOriginalName("");
      setDraft(blankExercise());
      setSelectedName("");
      await loadExercises("");
    } catch (deleteError) {
      setError(deleteError.message);
      setStatus("ready");
    }
  }

  async function handleUploadExerciseImage(file) {
    if (editorMode !== "edit" || !editorOriginalName) return;
    setUploadingImage(true);
    setImageUploadError("");
    try {
      const result = await uploadExerciseImage(editorOriginalName, file);
      const nextDraft = normalizeExerciseDraft(result.exercise || { ...draft, image: result.image_url });
      setDraft(nextDraft);
      setSelectedName(nextDraft.name || editorOriginalName);
      await loadExercises(nextDraft.name || editorOriginalName);
    } catch (uploadError) {
      setImageUploadError(uploadError.message);
    } finally {
      setUploadingImage(false);
    }
  }

  async function refreshExerciseFromImageResult(result, fallbackName = editorOriginalName) {
    const nextDraft = normalizeExerciseDraft(result.exercise || draft);
    setDraft(nextDraft);
    setSelectedName(nextDraft.name || fallbackName);
    await loadExercises(nextDraft.name || fallbackName);
  }

  async function handleSetPrimaryImage(imageUrl) {
    if (editorMode !== "edit" || !editorOriginalName || !imageUrl) return;
    setManagingImage(true);
    setImageUploadError("");
    try {
      const result = await setPrimaryExerciseImage(editorOriginalName, imageUrl);
      await refreshExerciseFromImageResult(result);
    } catch (imageError) {
      setImageUploadError(imageError.message);
    } finally {
      setManagingImage(false);
    }
  }

  async function handleDeleteImage(imageUrl) {
    if (editorMode !== "edit" || !editorOriginalName || !imageUrl) return;
    if (!window.confirm(t("Delete this exercise image?"))) return;
    setManagingImage(true);
    setImageUploadError("");
    try {
      const result = await deleteExerciseImage(editorOriginalName, imageUrl);
      await refreshExerciseFromImageResult(result);
    } catch (imageError) {
      setImageUploadError(imageError.message);
    } finally {
      setManagingImage(false);
    }
  }

  async function handleMergeExercise(sourceExercise, targetName) {
    const sourceName = sourceExercise?.name || editorOriginalName;
    const targetExercise = exercises.find((exercise) => exercise.name === targetName);
    if (!sourceName || !targetName || sourceName === targetName) return;
    const sourceLabel = getExerciseLabel(sourceExercise, language);
    const targetLabel = getExerciseLabel(targetExercise, language);
    if (!window.confirm(t('Merge "{source}" into "{target}"? Existing calendar references will move to the target exercise.', { source: sourceLabel, target: targetLabel }))) return;
    setStatus("saving");
    setError("");
    try {
      const result = await mergeExerciseInto(sourceName, targetName);
      const nextName = result.exercise?.name || targetName;
      setEditorMode("");
      setEditorOriginalName("");
      setDraft(blankExercise());
      await loadExercises(nextName);
    } catch (mergeError) {
      setError(mergeError.message);
      setStatus("ready");
    }
  }

  function openImageViewer(image, title) {
    setImageViewer({ image, title });
  }

  return (
    <main className="page-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">{t("Library")}</p>
          <h1>{t("Exercises")}</h1>
        </div>
        <button type="button" className="primary-action" onClick={openCreateEditor}>
          {t("Add Exercise")}
        </button>
      </section>

      <section className="calendar-toolbar app-panel exercise-toolbar">
        <label>
          {t("Search")}
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Name, category, description...")} />
        </label>
        <label>
          {t("Category")}
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">{t("All categories")}</option>
            {categories.map((categoryName) => (
              <option key={categoryName} value={categoryName}>
                {categoryName}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Tracking")}
          <select value={trackingMode} onChange={(event) => setTrackingMode(event.target.value)}>
            <option value="">{t("All modes")}</option>
            {TRACKING_MODES.map((modeOption) => (
              <option key={modeOption.value} value={modeOption.value}>
                {t(modeOption.label)}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}
      {status === "loading" ? <div className="app-panel empty-state">{t("Loading exercises...")}</div> : null}

      <section className="exercise-library-layout">
        <div className="exercise-list-panel app-panel">
          <div className="exercise-list-header">
            <strong>{t("Exercise count", { count: filteredExercises.length })}</strong>
            <span>{t("With image count", { count: exercises.filter((exercise) => getExerciseImages(exercise).length).length })}</span>
          </div>
          <div className="exercise-list-scroll">
            {filteredExercises.map((exercise) => (
              <button
                type="button"
                className={exercise.name === selectedExercise?.name ? "exercise-list-row active" : "exercise-list-row"}
                key={exercise.name}
                onClick={() => setSelectedName(exercise.name)}
              >
                <ExerciseImage exercise={exercise} language={language} t={t} />
                <span>
                  <strong>{getExerciseLabel(exercise, language)}</strong>
                  <small>{exercise.category || t("Uncategorized")} - {exercise.tracking_mode === "time_watts" ? t("time / watts") : t("reps / weight")}</small>
                </span>
              </button>
            ))}
            {!filteredExercises.length && status !== "loading" ? <div className="empty-state compact">{t("No exercise matches this filter.")}</div> : null}
          </div>
        </div>

        <div className="exercise-main-column">
          {editorMode ? (
            <ExerciseEditor
              draft={draft}
              mode={editorMode}
              saving={status === "saving"}
              categories={categories}
              exercises={exercises}
              language={language}
              canUploadImage={editorMode === "edit" && Boolean(editorOriginalName)}
              uploadingImage={uploadingImage}
              imageUploadError={imageUploadError}
              managingImage={managingImage}
              canDelete={Boolean(user?.isAdmin && editorMode === "edit" && editorOriginalName)}
              onChange={setDraft}
              onSave={handleSave}
              onCancel={() => setEditorMode("")}
              onUploadImage={handleUploadExerciseImage}
              onSetPrimaryImage={handleSetPrimaryImage}
              onDeleteImage={handleDeleteImage}
              onMerge={handleMergeExercise}
              onDelete={handleDelete}
              onViewImage={openImageViewer}
              t={t}
            />
          ) : (
            <ExerciseDetail
              exercise={selectedExercise}
              exercises={exercises}
              language={language}
              t={t}
              onEdit={openEditEditor}
              onNew={openCreateEditor}
              onDelete={handleDelete}
              onViewImage={openImageViewer}
              canDelete={Boolean(user?.isAdmin && selectedExercise?.name)}
            />
          )}
        </div>
      </section>
      <ImageLightbox image={imageViewer.image} title={imageViewer.title} t={t} onClose={() => setImageViewer({ image: "", title: "" })} />
    </main>
  );
}

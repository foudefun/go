import { useEffect, useMemo, useState } from "react";
import { createExercise, deleteExercise, getExercises, updateExercise } from "../api/exerciseApi.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import {
  TRACKING_MODES,
  WEIGHT_UNITS,
  blankExercise,
  filterExercises,
  getExerciseCategories,
  getExerciseLabel,
  normalizeExerciseDraft,
  slugifyExerciseName,
} from "../domain/exerciseLibrary.js";

function getExerciseImages(exercise) {
  const images = Array.isArray(exercise?.images) ? exercise.images : [];
  return images.length ? images : exercise?.image ? [exercise.image] : [];
}

function ExerciseImage({ exercise, large = false }) {
  const image = getExerciseImages(exercise)[0];
  if (!image) {
    return <div className={large ? "exercise-image placeholder large" : "exercise-image placeholder"}>No image</div>;
  }
  return <img className={large ? "exercise-image large" : "exercise-image"} src={image} alt={getExerciseLabel(exercise)} />;
}

function ExerciseDetail({ exercise, onEdit, onNew, onDelete, canDelete }) {
  if (!exercise) {
    return (
      <section className="app-panel exercise-detail-panel">
        <div className="empty-state">Choose an exercise to inspect it.</div>
      </section>
    );
  }

  return (
    <section className="app-panel exercise-detail-panel">
      <ExerciseImage exercise={exercise} large />
      <div className="exercise-detail-content">
        <div>
          <p className="eyebrow">{exercise.category || "Exercise"}</p>
          <h2>{getExerciseLabel(exercise)}</h2>
          <span className="visually-muted">{exercise.name}</span>
        </div>
        <div className="exercise-badge-row">
          <span>{exercise.tracking_mode === "time_watts" ? "Time / watts" : "Reps / weight"}</span>
          <span>{exercise.weight_unit || "kg"}</span>
          {exercise.movement_family ? <span>{exercise.movement_family}</span> : null}
          {exercise.variant_label ? <span>{exercise.variant_label}</span> : null}
        </div>
        {exercise.description ? <p>{exercise.description}</p> : <p className="visually-muted">No description yet.</p>}
        <div className="day-modal-actions">
          <button type="button" className="primary-action" onClick={() => onEdit(exercise)}>
            Edit Details
          </button>
          <button type="button" className="secondary-action" onClick={onNew}>
            New Exercise
          </button>
          {exercise.link ? (
            <a className="secondary-action" href={exercise.link} target="_blank" rel="noreferrer">
              Open Link
            </a>
          ) : null}
          {canDelete ? (
            <button type="button" onClick={() => onDelete(exercise)}>
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ExerciseEditor({ draft, mode, saving, onChange, onSave, onCancel }) {
  function updateField(field, value) {
    onChange((current) => {
      const next = { ...current, [field]: value };
      if (field === "display_name" && mode === "create" && !current.name) {
        next.name = slugifyExerciseName(value);
      }
      return next;
    });
  }

  return (
    <section className="app-panel exercise-editor-panel">
      <header className="strength-editor-header">
        <div>
          <p className="eyebrow">{mode === "create" ? "New" : "Editing"}</p>
          <h2>{mode === "create" ? "Add Exercise" : "Edit Exercise"}</h2>
        </div>
        <button type="button" onClick={onCancel}>
          Close
        </button>
      </header>

      <div className="form-grid">
        <label>
          Display name
          <input
            value={draft.display_name || ""}
            onChange={(event) => updateField("display_name", event.target.value)}
            placeholder="Back squat"
          />
        </label>
        <label>
          Technical name
          <input
            value={draft.name || ""}
            onChange={(event) => updateField("name", slugifyExerciseName(event.target.value))}
            placeholder="back_squat"
          />
        </label>
        <label>
          French name
          <input value={draft.display_name_fr || ""} onChange={(event) => updateField("display_name_fr", event.target.value)} />
        </label>
        <label>
          English name
          <input value={draft.display_name_en || ""} onChange={(event) => updateField("display_name_en", event.target.value)} />
        </label>
        <label>
          Category
          <input value={draft.category || ""} onChange={(event) => updateField("category", event.target.value)} placeholder="legs, pull, conditioning..." />
        </label>
        <label>
          Movement family
          <input value={draft.movement_family || ""} onChange={(event) => updateField("movement_family", event.target.value)} />
        </label>
        <label>
          Variant
          <input value={draft.variant_label || ""} onChange={(event) => updateField("variant_label", event.target.value)} />
        </label>
        <label>
          Tracking mode
          <select value={draft.tracking_mode || "reps_weight"} onChange={(event) => updateField("tracking_mode", event.target.value)}>
            {TRACKING_MODES.map((modeOption) => (
              <option key={modeOption.value} value={modeOption.value}>
                {modeOption.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Weight unit
          <select value={draft.weight_unit || "kg"} onChange={(event) => updateField("weight_unit", event.target.value)}>
            {WEIGHT_UNITS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Primary image URL
          <input value={draft.image || ""} onChange={(event) => updateField("image", event.target.value)} placeholder="/api/uploads/exercises/..." />
        </label>
      </div>

      <label>
        Description
        <textarea value={draft.description || ""} onChange={(event) => updateField("description", event.target.value)} />
      </label>
      <label>
        Reference link
        <input value={draft.link || ""} onChange={(event) => updateField("link", event.target.value)} placeholder="https://..." />
      </label>
      <label>
        Document link
        <input value={draft.document || ""} onChange={(event) => updateField("document", event.target.value)} />
      </label>

      <div className="day-modal-actions">
        <button type="button" className="primary-action" onClick={onSave} disabled={saving || !draft.name}>
          {saving ? "Saving..." : "Save Exercise"}
        </button>
        <a className="secondary-action" href="/legacy.html">
          Advanced Exercise Tools
        </a>
      </div>
    </section>
  );
}

export default function ExercisesPage() {
  const { user } = useAuth();
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
    () => filterExercises(exercises, { query, category, trackingMode }),
    [exercises, query, category, trackingMode],
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
  }

  function openEditEditor(exercise) {
    setEditorMode("edit");
    setEditorOriginalName(exercise.name);
    setDraft(normalizeExerciseDraft(exercise));
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
    if (!window.confirm(`Delete "${getExerciseLabel(exercise)}"?`)) return;
    setStatus("saving");
    setError("");
    try {
      await deleteExercise(exercise.name);
      setSelectedName("");
      await loadExercises("");
    } catch (deleteError) {
      setError(deleteError.message);
      setStatus("ready");
    }
  }

  return (
    <main className="page-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">Library</p>
          <h1>Exercises</h1>
        </div>
        <button type="button" className="primary-action" onClick={openCreateEditor}>
          Add Exercise
        </button>
      </section>

      <section className="calendar-toolbar app-panel exercise-toolbar">
        <label>
          Search
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, category, description..." />
        </label>
        <label>
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((categoryName) => (
              <option key={categoryName} value={categoryName}>
                {categoryName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tracking
          <select value={trackingMode} onChange={(event) => setTrackingMode(event.target.value)}>
            <option value="">All modes</option>
            {TRACKING_MODES.map((modeOption) => (
              <option key={modeOption.value} value={modeOption.value}>
                {modeOption.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}
      {status === "loading" ? <div className="app-panel empty-state">Loading exercises...</div> : null}

      <section className="exercise-library-layout">
        <div className="exercise-list-panel app-panel">
          <div className="exercise-list-header">
            <strong>{filteredExercises.length} exercise(s)</strong>
            <span>{exercises.filter((exercise) => getExerciseImages(exercise).length).length} with image</span>
          </div>
          <div className="exercise-list-scroll">
            {filteredExercises.map((exercise) => (
              <button
                type="button"
                className={exercise.name === selectedExercise?.name ? "exercise-list-row active" : "exercise-list-row"}
                key={exercise.name}
                onClick={() => setSelectedName(exercise.name)}
              >
                <ExerciseImage exercise={exercise} />
                <span>
                  <strong>{getExerciseLabel(exercise)}</strong>
                  <small>{exercise.category || "Uncategorized"} - {exercise.tracking_mode === "time_watts" ? "time / watts" : "reps / weight"}</small>
                </span>
              </button>
            ))}
            {!filteredExercises.length && status !== "loading" ? <div className="empty-state compact">No exercise matches this filter.</div> : null}
          </div>
        </div>

        <div className="exercise-main-column">
          {editorMode ? (
            <ExerciseEditor
              draft={draft}
              mode={editorMode}
              saving={status === "saving"}
              onChange={setDraft}
              onSave={handleSave}
              onCancel={() => setEditorMode("")}
            />
          ) : (
            <ExerciseDetail
              exercise={selectedExercise}
              onEdit={openEditEditor}
              onNew={openCreateEditor}
              onDelete={handleDelete}
              canDelete={Boolean(user?.isAdmin && selectedExercise?.name)}
            />
          )}
        </div>
      </section>
    </main>
  );
}

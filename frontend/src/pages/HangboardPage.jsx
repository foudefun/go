import { useEffect, useMemo, useState } from "react";
import {
  completeHangboardSession,
  createHangboardSession,
  generateHangboardWorkout,
  getHangboardBoards,
  getHangboardHistory,
  saveHangboardTemplate,
} from "../api/hangboardApi.js";
import {
  HANGBOARD_FOCUSES,
  HANGBOARD_LENGTHS,
  HANGBOARD_LEVELS,
  HANGBOARD_LOAD_MODES,
  buildCompletionLog,
  formatDuration,
  formatFocus,
  getHangSteps,
} from "../domain/hangboard.js";
import HangboardDiagram from "../hangboard/components/HangboardDiagram.jsx";
import { getExerciseCardUrl } from "../hangboard/exerciseCards.js";
import { useTranslation } from "../i18n/translations.js";

function getLocalTodayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function defaultOptions() {
  return {
    board: "beastmaker-1000",
    level: "6A",
    focus: "strength_endurance",
    sessionLength: "normal",
    loadMode: "bodyweight",
    calibration: {
      bodyweight: "",
      previousPainScore: 0,
      recentFailureRate: 0,
      holdsToAvoid: [],
    },
  };
}

function WorkoutPreview({ workout, t }) {
  if (!workout) return <div className="app-panel empty-state">{t("Generate a workout to preview it.")}</div>;
  const summary = workout.summary || {};
  return (
    <section className="app-panel hangboard-preview">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">{workout.boardName}</p>
          <h2>{workout.level} - {formatFocus(workout.focus)}</h2>
          <span>{workout.difficultyNote}</span>
        </div>
        <strong>{formatDuration(summary.estimatedDurationSec)}</strong>
      </div>
      <div className="stats-summary-grid compact">
        <span><strong>{summary.blocks}</strong>{t("Blocks")}</span>
        <span><strong>{summary.repsPerBlock}</strong>{t("Reps / block")}</span>
        <span><strong>{summary.hangSec}s</strong>{t("Hang")}</span>
        <span><strong>{formatDuration(summary.totalHangSec)}</strong>{t("Total hang")}</span>
      </div>
      {workout.warnings?.length ? (
        <div className="notice-panel">{workout.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>
      ) : null}
      <div className="hangboard-block-list">
        {(workout.exercises || []).map((exercise) => (
          <article className="hangboard-block-card" key={`${exercise.order}-${exercise.exerciseName}`}>
            <div>
              <strong>{exercise.exerciseName}</strong>
              <span>
                {exercise.sets} x {exercise.reps} | {exercise.hangSeconds}s {t("Hang")} / {exercise.restSeconds}s {t("Rest")} | RPE {exercise.targetRpe}
              </span>
              <small>{exercise.holdNames?.join(", ")} | {exercise.gripType?.replaceAll("_", " ")} | {exercise.loadInstruction}</small>
              {exercise.coachingCue ? <small>{exercise.coachingCue}</small> : null}
              {exercise.notes ? <small>{exercise.notes}</small> : null}
            </div>
            <ExerciseCardImage exercise={exercise} focus={workout.focus} boardSlug={workout.boardSlug} />
          </article>
        ))}
      </div>
    </section>
  );
}

function ExerciseCardImage({ exercise, focus = "", boardSlug = "beastmaker_1000", mode = "compact" }) {
  const url = exercise.cardImageUrl || getExerciseCardUrl(exercise, focus);
  if (url) {
    return (
      <figure className={`hangboard-card-image ${mode}`}>
        <img src={url} alt={exercise.exerciseName || "Beastmaker 1000 exercise card"} loading="lazy" />
      </figure>
    );
  }
  return (
    <HangboardDiagram
      boardSlug={boardSlug}
      highlightedHoldSlugs={exercise.holdSlugs}
      mode={mode}
      title={exercise.exerciseName}
    />
  );
}

function SessionTimer({ session, onComplete, t }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [remaining, setRemaining] = useState(session?.workout?.steps?.[0]?.durationSec || 0);
  const [running, setRunning] = useState(false);
  const [repStatus, setRepStatus] = useState({});
  const [averageRpe, setAverageRpe] = useState(7);
  const [painScore, setPainScore] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const steps = session?.workout?.steps || [];
  const currentStep = steps[stepIndex] || null;
  const hangSteps = getHangSteps(session?.workout);
  const currentHangIndex = currentStep?.type === "hang"
    ? steps.slice(0, stepIndex + 1).filter((step) => step.type === "hang").length - 1
    : -1;

  useEffect(() => {
    setStepIndex(0);
    setRemaining(session?.workout?.steps?.[0]?.durationSec || 0);
    setRunning(false);
    setRepStatus({});
  }, [session?.id]);

  useEffect(() => {
    if (!running || !currentStep) return undefined;
    const intervalId = window.setInterval(() => {
      setRemaining((value) => {
        if (value > 1) return value - 1;
        setStepIndex((index) => {
          const nextIndex = Math.min(index + 1, steps.length - 1);
          setRemaining(steps[nextIndex]?.durationSec || 0);
          if (nextIndex === index) setRunning(false);
          return nextIndex;
        });
        return 0;
      });
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [currentStep, running, steps]);

  function skipRest() {
    if (currentStep?.type !== "rest") return;
    const nextIndex = Math.min(stepIndex + 1, steps.length - 1);
    setStepIndex(nextIndex);
    setRemaining(steps[nextIndex]?.durationSec || 0);
  }

  async function finishSession() {
    setSaving(true);
    setError("");
    try {
      const log = buildCompletionLog(session.workout, repStatus, averageRpe, painScore, notes);
      const result = await completeHangboardSession(session.id, log);
      setRunning(false);
      onComplete(result);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  if (!session) return null;

  return (
    <section className="app-panel hangboard-timer">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">{t("Session timer")}</p>
          <h2>{currentStep?.type === "hang" ? t("Hang") : t("Rest")}</h2>
          <span>{currentStep?.exerciseName || formatFocus(session.workout.focus)}</span>
        </div>
        <strong className="timer-readout">{formatDuration(remaining)}</strong>
      </div>
      {currentStep?.type === "hang" ? (
        <ExerciseCardImage
          exercise={{
            ...currentStep,
            holdGroupKey: currentStep.holdGroupKey,
            cardImageUrl: currentStep.cardImageUrl,
          }}
          focus={session.workout.focus}
          boardSlug={session.workout.boardSlug}
          mode="exercise"
        />
      ) : (
        <HangboardDiagram
          boardSlug={session.workout.boardSlug}
          highlightedHoldSlugs={[]}
          mode="exercise"
          title={session.workout.boardName}
        />
      )}
      {currentStep?.type === "hang" ? (
        <div className="notice-panel">
          <span>{currentStep.holdNames?.join(", ")}</span>
          <span>{currentStep.gripType?.replaceAll("_", " ")}</span>
          <span>{currentStep.loadInstruction}</span>
          {currentStep.coachingCue ? <span>{currentStep.coachingCue}</span> : null}
        </div>
      ) : null}
      <div className="compact-actions">
        <button className="primary-action" type="button" onClick={() => setRunning((value) => !value)}>
          {running ? t("Pause") : t("Start / resume")}
        </button>
        <button type="button" disabled={currentStep?.type !== "rest"} onClick={skipRest}>{t("Skip rest")}</button>
        <button
          type="button"
          disabled={currentHangIndex < 0}
          onClick={() => setRepStatus((current) => ({ ...current, [currentHangIndex]: "failed" }))}
        >
          {t("Mark failed")}
        </button>
      </div>
      <div className="hangboard-rep-grid">
        {hangSteps.map((step, index) => (
          <span className={repStatus[index] === "failed" ? "failed" : index === currentHangIndex ? "active" : ""} key={`${step.holdSlugs?.join("-")}-${index}`}>
            {index + 1}
          </span>
        ))}
      </div>
      <div className="form-grid">
        <label>
          {t("Average RPE")}
          <input type="number" min="0" max="10" value={averageRpe} onChange={(event) => setAverageRpe(event.target.value)} />
        </label>
        <label>
          {t("Pain score")}
          <input type="number" min="0" max="10" value={painScore} onChange={(event) => setPainScore(event.target.value)} />
        </label>
      </div>
      <label>
        {t("Notes")}
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      {error ? <div className="error-banner">{error}</div> : null}
      <button className="primary-action" type="button" onClick={finishSession} disabled={saving}>
        {saving ? t("Saving...") : t("End session")}
      </button>
    </section>
  );
}

export default function HangboardPage() {
  const { t } = useTranslation();
  const [boards, setBoards] = useState([]);
  const [options, setOptions] = useState(defaultOptions);
  const [workout, setWorkout] = useState(null);
  const [session, setSession] = useState(null);
  const [history, setHistory] = useState({ sessions: [], stats: {} });
  const [date, setDate] = useState(getLocalTodayIso());
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const availableHolds = useMemo(() => boards.find((board) => board.slug === options.board)?.holds || [], [boards, options.board]);

  function patchOptions(patch) {
    setOptions((current) => ({ ...current, ...patch }));
  }

  function patchCalibration(patch) {
    setOptions((current) => ({ ...current, calibration: { ...current.calibration, ...patch } }));
  }

  function reloadHistory() {
    getHangboardHistory(12)
      .then(setHistory)
      .catch(() => setHistory({ sessions: [], stats: {} }));
  }

  useEffect(() => {
    getHangboardBoards().then(setBoards).catch(() => setBoards([]));
    reloadHistory();
  }, []);

  async function handleGenerate() {
    setStatus("loading");
    setError("");
    try {
      const result = await generateHangboardWorkout(options);
      setWorkout(result.workout);
      setSession(null);
      setSummary(null);
      setStatus("ready");
    } catch (generateError) {
      setError(generateError.message);
      setStatus("idle");
    }
  }

  async function handleSaveTemplate() {
    setStatus("saving");
    setError("");
    try {
      await saveHangboardTemplate(`${options.level} ${formatFocus(options.focus)}`, options);
      setStatus("ready");
    } catch (saveError) {
      setError(saveError.message);
      setStatus("ready");
    }
  }

  async function handleStartSession() {
    setStatus("saving");
    setError("");
    try {
      const result = await createHangboardSession({ date, options });
      setWorkout(result.session.workout);
      setSession(result.session);
      setSummary(null);
      setStatus("ready");
    } catch (sessionError) {
      setError(sessionError.message);
      setStatus("ready");
    }
  }

  function handleComplete(result) {
    setSummary(result);
    setSession(null);
    reloadHistory();
  }

  return (
    <main className="page-shell hangboard-page">
      <section className="module-header">
        <div>
          <p className="eyebrow">{t("Training")}</p>
          <h1>{t("Hangboard")}</h1>
          <p className="lede">{t("Build Beastmaker-style sessions without treating the selected level as a climbing grade claim.")}</p>
        </div>
      </section>

      <section className="hangboard-layout">
        <section className="app-panel hangboard-builder">
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">{t("Builder")}</p>
              <h2>{t("Workout setup")}</h2>
            </div>
          </div>
          <div className="form-grid">
            <label>{t("Board")}<select value={options.board} onChange={(event) => patchOptions({ board: event.target.value })}>{boards.map((board) => <option key={board.slug} value={board.slug}>{board.name}</option>)}</select></label>
            <label>{t("Difficulty")}<select value={options.level} onChange={(event) => patchOptions({ level: event.target.value })}>{HANGBOARD_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
            <label>{t("Focus")}<select value={options.focus} onChange={(event) => patchOptions({ focus: event.target.value })}>{HANGBOARD_FOCUSES.map((focus) => <option key={focus.value} value={focus.value}>{t(focus.label)}</option>)}</select></label>
            <label>{t("Length")}<select value={options.sessionLength} onChange={(event) => patchOptions({ sessionLength: event.target.value })}>{HANGBOARD_LENGTHS.map((length) => <option key={length.value} value={length.value}>{t(length.label)}</option>)}</select></label>
            <label>{t("Load mode")}<select value={options.loadMode} onChange={(event) => patchOptions({ loadMode: event.target.value })}>{HANGBOARD_LOAD_MODES.map((mode) => <option key={mode.value} value={mode.value}>{t(mode.label)}</option>)}</select></label>
            <label>{t("Date")}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <label>{t("Bodyweight")}<input type="number" value={options.calibration.bodyweight} onChange={(event) => patchCalibration({ bodyweight: event.target.value })} /></label>
            <label>{t("Previous pain score")}<input type="number" min="0" max="10" value={options.calibration.previousPainScore} onChange={(event) => patchCalibration({ previousPainScore: event.target.value })} /></label>
            <label>{t("Recent failure rate")}<input type="number" min="0" max="1" step="0.05" value={options.calibration.recentFailureRate} onChange={(event) => patchCalibration({ recentFailureRate: event.target.value })} /></label>
          </div>
          <label>
            {t("Holds to avoid")}
            <select
              multiple
              value={options.calibration.holdsToAvoid}
              onChange={(event) => patchCalibration({ holdsToAvoid: Array.from(event.target.selectedOptions).map((item) => item.value) })}
            >
              {availableHolds.map((hold) => <option key={hold.slug} value={hold.slug}>{hold.label}</option>)}
            </select>
          </label>
          <div className="compact-actions">
            <button className="primary-action" type="button" onClick={handleGenerate} disabled={status === "loading"}>{t("Generate")}</button>
            <button type="button" onClick={handleSaveTemplate} disabled={!workout || status === "saving"}>{t("Save template")}</button>
            <button type="button" onClick={handleStartSession} disabled={status === "saving"}>{t("Start session")}</button>
          </div>
          {error ? <div className="error-banner">{error}</div> : null}
        </section>

        <WorkoutPreview workout={workout} t={t} />
      </section>

      <SessionTimer session={session} onComplete={handleComplete} t={t} />

      {summary ? (
        <section className="app-panel hangboard-summary">
          <p className="eyebrow">{t("End summary")}</p>
          <h2>{t("Progression recommendation")}</h2>
          <strong>{summary.recommendation.direction}</strong>
          <p>{summary.recommendation.action}</p>
          <span>{summary.recommendation.reason}</span>
        </section>
      ) : null}

      <section className="stats-summary-grid hangboard-stats">
        <article className="app-panel stats-summary-card"><span>{t("Hangboard sessions")}</span><strong>{history.stats?.totalSessions || 0}</strong></article>
        <article className="app-panel stats-summary-card"><span>{t("Completed reps")}</span><strong>{history.stats?.totalCompletedReps || 0}</strong></article>
        <article className="app-panel stats-summary-card"><span>{t("Pain-free sessions")}</span><strong>{history.stats?.painFreeSessions || 0}</strong></article>
      </section>

      <section className="activity-list-panel">
        {history.sessions?.map((item) => (
          <article className="app-panel activity-list-row" key={item.id}>
            <span className="activity-list-main">
              <span>{item.date}</span>
              <strong>{item.workout?.level} - {formatFocus(item.workout?.focus)}</strong>
              <small>{item.status}{item.recommendation?.action ? ` | ${item.recommendation.action}` : ""}</small>
            </span>
          </article>
        ))}
      </section>
    </main>
  );
}

export const DEFAULT_CONFIG = {
  start_date: "2026-04-07",
  start_load: 10,
  increment: 5,
  weight: 75,
  shoe_size: 42,
  increment_every_days: 2,
  sport_after_days: 30,
};

export function normalizePositiveInt(value, fallback = 1) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(1, Math.trunc(numberValue));
}

export function normalizePositiveFloat(value, fallback = 1) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(1, Math.round(numberValue * 10) / 10);
}

export function normalizeConfigDraft(config = {}) {
  return {
    start_date: String(config.start_date || DEFAULT_CONFIG.start_date),
    start_load: normalizePositiveInt(config.start_load, DEFAULT_CONFIG.start_load),
    increment: normalizePositiveInt(config.increment, DEFAULT_CONFIG.increment),
    weight: normalizePositiveInt(config.weight, DEFAULT_CONFIG.weight),
    shoe_size: normalizePositiveFloat(config.shoe_size, DEFAULT_CONFIG.shoe_size),
    increment_every_days: normalizePositiveInt(config.increment_every_days, DEFAULT_CONFIG.increment_every_days),
    sport_after_days: normalizePositiveInt(config.sport_after_days, DEFAULT_CONFIG.sport_after_days),
  };
}

export function formatDateIso(dateValue) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(dateIso, days) {
  const dateValue = new Date(`${dateIso}T00:00:00`);
  dateValue.setDate(dateValue.getDate() + days);
  return formatDateIso(dateValue);
}

export function getTargetForDate(config, dateIso) {
  const safeConfig = normalizeConfigDraft(config);
  const start = new Date(`${safeConfig.start_date}T00:00:00`);
  const current = new Date(`${dateIso}T00:00:00`);
  const rehabDay = Math.max(1, Math.floor((current - start) / 86400000) + 1);
  const targetLoad =
    safeConfig.start_load +
    Math.floor((rehabDay - 1) / safeConfig.increment_every_days) * safeConfig.increment;
  return {
    date: dateIso,
    rehab_day: rehabDay,
    target_load: targetLoad,
    target_pct_bw: Math.round((targetLoad / safeConfig.weight) * 100),
    sport_allowed: rehabDay > safeConfig.sport_after_days,
  };
}

export function buildTargetPreview(config, anchorDateIso) {
  const safeConfig = normalizeConfigDraft(config);
  const anchor = anchorDateIso || formatDateIso(new Date());
  const dates = [
    anchor,
    addDays(anchor, 7),
    addDays(anchor, 14),
    addDays(safeConfig.start_date, safeConfig.sport_after_days),
  ];
  const uniqueDates = Array.from(new Set(dates)).sort();
  return uniqueDates.map((dateIso) => getTargetForDate(safeConfig, dateIso));
}

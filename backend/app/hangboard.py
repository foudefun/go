from __future__ import annotations

from copy import deepcopy

from app.hangboard_prescriptions import BEASTMAKER_1000_EXERCISE_PRESCRIPTIONS


LEVELS = ["5C", "6A", "6B", "6C", "7A", "7B", "7C"]
FOCUSES = ["max_strength", "strength_endurance", "endurance", "power_endurance", "maintenance"]
SESSION_LENGTHS = ["short", "normal", "hard"]
LOAD_MODES = ["bodyweight", "assisted", "added_weight"]

BEASTMAKER_1000_VIEWBOX = {"width": 1000, "height": 360}

BEASTMAKER_1000_HOLDS = [
    {"slug": "jug_left", "label": "Left jug", "type": "jug", "side": "left", "supportsBothHands": False, "difficulty": 1},
    {"slug": "jug_right", "label": "Right jug", "type": "jug", "side": "right", "supportsBothHands": False, "difficulty": 1},
    {"slug": "sloper_35_left", "label": "Left 35 degree sloper", "type": "sloper", "side": "left", "angleDeg": 35, "difficulty": 7},
    {"slug": "sloper_35_right", "label": "Right 35 degree sloper", "type": "sloper", "side": "right", "angleDeg": 35, "difficulty": 7},
    {"slug": "sloper_20_left", "label": "Left 20 degree sloper", "type": "sloper", "side": "left", "angleDeg": 20, "difficulty": 6},
    {"slug": "sloper_20_right", "label": "Right 20 degree sloper", "type": "sloper", "side": "right", "angleDeg": 20, "difficulty": 6},
    {"slug": "very_deep_4_finger_center", "label": "Very deep 4-finger pocket", "type": "pocket", "side": "center", "fingerCount": 4, "depthCategory": "very_deep", "supportsBothHands": True, "difficulty": 2},
    {"slug": "deep_4_finger_left", "label": "Left deep 4-finger pocket", "type": "pocket", "side": "left", "fingerCount": 4, "depthCategory": "deep", "difficulty": 3},
    {"slug": "deep_4_finger_right", "label": "Right deep 4-finger pocket", "type": "pocket", "side": "right", "fingerCount": 4, "depthCategory": "deep", "difficulty": 3},
    {"slug": "deep_3_finger_left", "label": "Left deep 3-finger pocket", "type": "pocket", "side": "left", "fingerCount": 3, "depthCategory": "deep", "difficulty": 4},
    {"slug": "deep_3_finger_right", "label": "Right deep 3-finger pocket", "type": "pocket", "side": "right", "fingerCount": 3, "depthCategory": "deep", "difficulty": 4},
    {"slug": "deep_2_finger_left", "label": "Left deep 2-finger pocket", "type": "pocket", "side": "left", "fingerCount": 2, "depthCategory": "deep", "difficulty": 5},
    {"slug": "deep_2_finger_right", "label": "Right deep 2-finger pocket", "type": "pocket", "side": "right", "fingerCount": 2, "depthCategory": "deep", "difficulty": 5},
    {"slug": "medium_4_finger_left", "label": "Left medium 4-finger pocket", "type": "pocket", "side": "left", "fingerCount": 4, "depthCategory": "medium", "difficulty": 4},
    {"slug": "medium_4_finger_right", "label": "Right medium 4-finger pocket", "type": "pocket", "side": "right", "fingerCount": 4, "depthCategory": "medium", "difficulty": 4},
    {"slug": "small_4_finger_10mm_left", "label": "Left small 4-finger 10mm edge", "type": "edge", "side": "left", "fingerCount": 4, "depthCategory": "small", "mm": 10, "difficulty": 7},
    {"slug": "small_4_finger_10mm_right", "label": "Right small 4-finger 10mm edge", "type": "edge", "side": "right", "fingerCount": 4, "depthCategory": "small", "mm": 10, "difficulty": 7},
    {"slug": "medium_2_finger_left", "label": "Left medium 2-finger pocket", "type": "pocket", "side": "left", "fingerCount": 2, "depthCategory": "medium", "difficulty": 6},
    {"slug": "medium_2_finger_right", "label": "Right medium 2-finger pocket", "type": "pocket", "side": "right", "fingerCount": 2, "depthCategory": "medium", "difficulty": 6},
    {"slug": "medium_3_finger_left", "label": "Left medium 3-finger pocket", "type": "pocket", "side": "left", "fingerCount": 3, "depthCategory": "medium", "difficulty": 5},
    {"slug": "medium_3_finger_right", "label": "Right medium 3-finger pocket", "type": "pocket", "side": "right", "fingerCount": 3, "depthCategory": "medium", "difficulty": 5},
]

BEASTMAKER_1000_HOLD_GROUPS = {
    "jugs": {"name": "Jugs", "exerciseName": "Jug Hang", "holdSlugs": ["jug_left", "jug_right"], "gripType": "open_hand"},
    "very_deep_4_finger": {
        "name": "Very deep 4-finger",
        "exerciseName": "Very Deep 4-Finger Hang",
        "holdSlugs": ["very_deep_4_finger_center"],
        "gripType": "open_hand",
        "notes": "Use both hands on the central very deep 4-finger pocket if comfortable.",
    },
    "deep_4_finger": {"name": "Deep 4-finger", "exerciseName": "Deep 4-Finger Hang", "holdSlugs": ["deep_4_finger_left", "deep_4_finger_right"], "gripType": "open_hand"},
    "medium_4_finger": {"name": "Medium 4-finger", "exerciseName": "Medium 4-Finger Hang", "holdSlugs": ["medium_4_finger_left", "medium_4_finger_right"], "gripType": "open_hand"},
    "small_4_finger_10mm": {"name": "Small 4-finger 10mm", "exerciseName": "Small 4-Finger 10mm Hang", "holdSlugs": ["small_4_finger_10mm_left", "small_4_finger_10mm_right"], "gripType": "half_crimp"},
    "deep_3_finger": {"name": "Deep 3-finger", "exerciseName": "Deep 3-Finger Hang", "holdSlugs": ["deep_3_finger_left", "deep_3_finger_right"], "gripType": "open_hand"},
    "medium_3_finger": {"name": "Medium 3-finger", "exerciseName": "Medium 3-Finger Hang", "holdSlugs": ["medium_3_finger_left", "medium_3_finger_right"], "gripType": "open_hand"},
    "deep_2_finger": {"name": "Deep 2-finger", "exerciseName": "Deep 2-Finger Hang", "holdSlugs": ["deep_2_finger_left", "deep_2_finger_right"], "gripType": "open_hand"},
    "medium_2_finger": {"name": "Medium 2-finger", "exerciseName": "Medium 2-Finger Hang", "holdSlugs": ["medium_2_finger_left", "medium_2_finger_right"], "gripType": "open_hand"},
    "sloper_20": {"name": "20 degree slopers", "exerciseName": "20 Degree Sloper Hang", "holdSlugs": ["sloper_20_left", "sloper_20_right"], "gripType": "open_hand"},
    "sloper_35": {"name": "35 degree slopers", "exerciseName": "35 Degree Sloper Hang", "holdSlugs": ["sloper_35_left", "sloper_35_right"], "gripType": "open_hand"},
}

FOCUS_PRESCRIPTION_TAGS = {
    "max_strength": {"max_strength", "strength", "advanced_strength", "advanced_open_hand_strength", "advanced_pocket_strength"},
    "strength_endurance": {"strength_endurance", "base_strength", "beginner_strength", "pocket_strength", "open_hand_strength"},
    "endurance": {"endurance", "warmup", "prehab"},
    "power_endurance": {"power_endurance", "strength_endurance"},
    "maintenance": {"maintenance", "warmup", "prehab", "beginner_strength"},
}

BEASTMAKER_1000 = {
    "slug": "beastmaker-1000",
    "name": "Beastmaker 1000",
    "viewBox": BEASTMAKER_1000_VIEWBOX,
    "holds": BEASTMAKER_1000_HOLDS,
    "holdGroups": BEASTMAKER_1000_HOLD_GROUPS,
}

LEVEL_HOLD_GROUPS = {
    "5C": ["jugs", "deep_4_finger", "very_deep_4_finger"],
    "6A": ["deep_4_finger", "medium_4_finger", "deep_3_finger"],
    "6B": ["medium_4_finger", "deep_3_finger", "deep_2_finger", "sloper_20"],
    "6C": ["medium_4_finger", "medium_3_finger", "medium_2_finger", "sloper_20"],
    "7A": ["small_4_finger_10mm", "medium_3_finger", "medium_2_finger", "sloper_20", "sloper_35"],
    "7B": ["small_4_finger_10mm", "medium_2_finger", "sloper_35"],
    "7C": ["small_4_finger_10mm", "medium_2_finger", "sloper_35"],
}

FOCUS_PRESETS = {
    "max_strength": {"hang": 8, "rest": 180, "reps": 1, "blocks": 7, "block_rest": 180, "targetRpe": 9},
    "strength_endurance": {"hang": 7, "rest": 3, "reps": 6, "blocks": 4, "block_rest": 150, "targetRpe": 8},
    "endurance": {"hang": 10, "rest": 5, "reps": 8, "blocks": 3, "block_rest": 90, "targetRpe": 6},
    "power_endurance": {"hang": 7, "rest": 3, "reps": 6, "blocks": 5, "block_rest": 120, "targetRpe": 8},
    "maintenance": {"hang": 7, "rest": 90, "reps": 1, "blocks": 5, "block_rest": 120, "targetRpe": 6},
}

LENGTH_ADJUSTMENTS = {
    "short": {"blocks": -1, "max_strength_blocks": -1},
    "normal": {"blocks": 0, "max_strength_blocks": 0},
    "hard": {"blocks": 1, "max_strength_blocks": 1},
}


def normalize_choice(value: str, valid: list[str], default: str) -> str:
    value = str(value or "").strip()
    return value if value in valid else default


def normalize_board_slug(value: str) -> str:
    normalized = str(value or "").strip().lower().replace("_", "-")
    return normalized if normalized == "beastmaker-1000" else "beastmaker-1000"


def normalize_generator_input(payload: dict | None) -> dict:
    payload = payload if isinstance(payload, dict) else {}
    calibration = payload.get("calibration") if isinstance(payload.get("calibration"), dict) else {}
    holds_to_avoid = calibration.get("holdsToAvoid", calibration.get("holds_to_avoid", []))
    if not isinstance(holds_to_avoid, list):
        holds_to_avoid = []
    valid_slugs = {hold["slug"] for hold in BEASTMAKER_1000_HOLDS}
    return {
        "board": normalize_board_slug(payload.get("board") or "beastmaker-1000"),
        "level": normalize_choice(str(payload.get("level") or "").upper(), LEVELS, "6A"),
        "focus": normalize_choice(payload.get("focus"), FOCUSES, "strength_endurance"),
        "sessionLength": normalize_choice(payload.get("sessionLength") or payload.get("session_length"), SESSION_LENGTHS, "normal"),
        "loadMode": normalize_choice(payload.get("loadMode") or payload.get("load_mode"), LOAD_MODES, "bodyweight"),
        "calibration": {
            "bodyweight": optional_float(calibration.get("bodyweight")),
            "previousPainScore": clamp_int(calibration.get("previousPainScore", calibration.get("previous_pain_score")), 0, 10, 0),
            "recentFailureRate": clamp_float(calibration.get("recentFailureRate", calibration.get("recent_failure_rate")), 0, 1, 0),
            "holdsToAvoid": [str(item).strip() for item in holds_to_avoid if str(item).strip() in valid_slugs],
        },
    }


def optional_float(value):
    if value in (None, ""):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def clamp_int(value, minimum: int, maximum: int, default: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, number))


def clamp_float(value, minimum: float, maximum: float, default: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, number))


def shift_level(level: str, offset: int) -> str:
    index = LEVELS.index(level)
    return LEVELS[max(0, min(len(LEVELS) - 1, index + offset))]


def group_is_available(group: dict, holds_to_avoid: set[str]) -> bool:
    return not holds_to_avoid.intersection(group["holdSlugs"])


def select_hold_groups(level: str, holds_to_avoid: list[str], recovery: bool, failure_rate: float) -> list[dict]:
    effective_level = shift_level(level, -1 if recovery or failure_rate >= 0.35 else 0)
    avoid = set(holds_to_avoid)
    groups = []
    for group_key in LEVEL_HOLD_GROUPS[effective_level]:
        if group_is_available(BEASTMAKER_1000_HOLD_GROUPS[group_key], avoid):
            group = deepcopy(BEASTMAKER_1000_HOLD_GROUPS[group_key])
            group["key"] = group_key
            groups.append(group)
    if not groups:
        fallback_level = shift_level(effective_level, -1)
        for group_key in LEVEL_HOLD_GROUPS[fallback_level]:
            if group_is_available(BEASTMAKER_1000_HOLD_GROUPS[group_key], avoid):
                group = deepcopy(BEASTMAKER_1000_HOLD_GROUPS[group_key])
                group["key"] = group_key
                groups.append(group)
    if groups:
        return groups[:3]
    fallback = deepcopy(BEASTMAKER_1000_HOLD_GROUPS["jugs"])
    fallback["key"] = "jugs"
    return [fallback]


def get_load_instruction(load_mode: str) -> str:
    if load_mode == "assisted":
        return "Use enough assistance to complete every rep cleanly."
    if load_mode == "added_weight":
        return "Use small added weight only if form stays clean."
    return "Bodyweight."


def prescription_matches_group(prescription: dict, group: dict) -> bool:
    return set(prescription.get("holdSlugs", [])) == set(group.get("holdSlugs", []))


def prescription_score(prescription: dict, focus: str, load_mode: str) -> tuple[int, int, int]:
    tags = set(prescription.get("focus", []))
    focus_tags = FOCUS_PRESCRIPTION_TAGS.get(focus, {focus})
    focus_score = 3 if focus in tags else 2 if tags.intersection(focus_tags) else 0
    protocol = prescription.get("protocol", {}) if isinstance(prescription.get("protocol"), dict) else {}
    load_text = str(protocol.get("defaultLoadMode", ""))
    prescription_id = str(prescription.get("id", ""))
    if load_mode == "assisted":
        load_score = 3 if "assisted_only" in load_text or "assisted" in prescription_id else 1 if "assisted" in load_text else 0
    elif load_mode == "added_weight":
        load_score = 3 if "added_weight" in load_text else 0
    elif load_mode == "bodyweight":
        load_score = 1 if "bodyweight" in load_text and "assisted_only" not in load_text else 0
    else:
        load_score = 0
    difficulty_rank = int(prescription.get("difficultyRank", 99) or 99)
    return (load_score, focus_score, -difficulty_rank)


def select_prescription(group: dict, focus: str, load_mode: str) -> dict:
    candidates = [
        prescription
        for prescription in BEASTMAKER_1000_EXERCISE_PRESCRIPTIONS
        if prescription_matches_group(prescription, group)
    ]
    if not candidates:
        return {}
    return deepcopy(max(candidates, key=lambda item: prescription_score(item, focus, load_mode)))


def adjusted_target_rpe(preset: dict, prescription: dict) -> int:
    protocol = prescription.get("protocol", {}) if isinstance(prescription.get("protocol"), dict) else {}
    protocol_rpe = protocol.get("targetRpeMax")
    try:
        return min(int(preset["targetRpe"]), int(protocol_rpe))
    except (TypeError, ValueError):
        return int(preset["targetRpe"])


def build_exercise_block(order: int, group_key: str, group: dict, preset: dict, focus: str, load_mode: str) -> dict:
    prescription = select_prescription(group, focus, load_mode)
    card_image = str(prescription.get("cardImage", "") or "")
    return {
        "order": order,
        "holdGroupKey": group_key,
        "prescriptionId": prescription.get("id", ""),
        "exerciseName": prescription.get("title") or group["exerciseName"],
        "subtitle": prescription.get("subtitle", ""),
        "holdSlugs": prescription.get("holdSlugs") or group["holdSlugs"],
        "holdNames": [hold["label"] for hold in BEASTMAKER_1000_HOLDS if hold["slug"] in (prescription.get("holdSlugs") or group["holdSlugs"])],
        "gripType": prescription.get("gripType") or group["gripType"],
        "fingerTeam": prescription.get("fingerTeam", ""),
        "sets": 1,
        "reps": preset["reps"],
        "hangSeconds": preset["hang"],
        "restSeconds": preset["rest"],
        "afterBlockRestSeconds": preset["block_rest"],
        "targetRpe": adjusted_target_rpe(preset, prescription),
        "loadMode": load_mode,
        "loadInstruction": get_load_instruction(load_mode),
        "cardImage": card_image,
        "cardImageUrl": f"/assets/hangboard/beastmaker1000/cards/{card_image}" if card_image else "",
        "protocol": prescription.get("protocol", {}),
        "coachingCue": prescription.get("coachingCue", ""),
        "progression": prescription.get("progression", ""),
        "regression": prescription.get("regression", ""),
        "safetyNote": prescription.get("safetyNote", ""),
        "globalSafety": prescription.get("globalSafety", []),
        "notes": group.get("notes", "") or prescription.get("sessionUse", ""),
    }


def generate_workout(payload: dict | None) -> dict:
    options = normalize_generator_input(payload)
    calibration = options["calibration"]
    pain = calibration["previousPainScore"]
    failure_rate = calibration["recentFailureRate"]
    recovery = pain >= 3
    focus = "maintenance" if recovery else options["focus"]
    preset = deepcopy(FOCUS_PRESETS[focus])
    length = options["sessionLength"]
    preset["blocks"] += LENGTH_ADJUSTMENTS[length]["max_strength_blocks" if focus == "max_strength" else "blocks"]
    if focus == "max_strength":
        preset["blocks"] = max(6, min(8, preset["blocks"]))
    else:
        preset["blocks"] = max(2, preset["blocks"])
    if pain > 0:
        preset["blocks"] = max(2, preset["blocks"] - 1)
        preset["rest"] = int(preset["rest"] * 1.2)
        preset["block_rest"] = int(preset["block_rest"] * 1.2)
        preset["targetRpe"] = max(5, preset["targetRpe"] - 1)
    if failure_rate >= 0.35:
        preset["blocks"] = max(2, preset["blocks"] - 1)
        preset["reps"] = max(1, preset["reps"] - 1)

    selected_groups = select_hold_groups(options["level"], calibration["holdsToAvoid"], recovery, failure_rate)
    exercises = [
        build_exercise_block(
            block_index + 1,
            selected_groups[block_index % len(selected_groups)]["key"],
            selected_groups[block_index % len(selected_groups)],
            preset,
            focus,
            options["loadMode"],
        )
        for block_index in range(preset["blocks"])
    ]
    steps = []
    total_work = 0
    total_rest = 0
    for block_index, exercise in enumerate(exercises):
        for rep_index in range(exercise["reps"]):
            steps.append({
                "type": "hang",
                "block": block_index + 1,
                "rep": rep_index + 1,
                "durationSec": exercise["hangSeconds"],
                "holdSlugs": exercise["holdSlugs"],
                "holdNames": exercise["holdNames"],
                "holdGroupKey": exercise["holdGroupKey"],
                "exerciseName": exercise["exerciseName"],
                "gripType": exercise["gripType"],
                "loadMode": exercise["loadMode"],
                "loadInstruction": exercise["loadInstruction"],
                "cardImage": exercise.get("cardImage", ""),
                "cardImageUrl": exercise.get("cardImageUrl", ""),
                "prescriptionId": exercise.get("prescriptionId", ""),
                "coachingCue": exercise.get("coachingCue", ""),
                "safetyNote": exercise.get("safetyNote", ""),
                "targetRpe": exercise["targetRpe"],
            })
            total_work += exercise["hangSeconds"]
            is_last_rep = block_index == len(exercises) - 1 and rep_index == exercise["reps"] - 1
            if not is_last_rep:
                rest_duration = exercise["restSeconds"] if rep_index < exercise["reps"] - 1 else exercise["afterBlockRestSeconds"]
                steps.append({"type": "rest", "block": block_index + 1, "rep": rep_index + 1, "durationSec": rest_duration})
                total_rest += rest_duration

    warnings = []
    if pain > 0:
        warnings.append("Previous pain reported: intensity and volume were reduced.")
    if recovery:
        warnings.append("Pain score is 3 or higher: generated a recovery maintenance session.")
    if failure_rate >= 0.35:
        warnings.append("Recent failure rate is high: volume and hold intensity were reduced.")
    if options["level"] in {"7B", "7C"}:
        warnings.append("V1 does not include true one-arm hangs; use added weight or harder holds only.")

    return {
        "board": options["board"],
        "boardSlug": "beastmaker_1000",
        "boardName": BEASTMAKER_1000["name"],
        "level": options["level"],
        "difficultyNote": "Selected level controls workout difficulty only; it is not a climbing grade claim.",
        "focus": focus,
        "requestedFocus": options["focus"],
        "sessionLength": length,
        "loadMode": options["loadMode"],
        "calibration": calibration,
        "summary": {
            "blocks": preset["blocks"],
            "repsPerBlock": preset["reps"],
            "hangSec": preset["hang"],
            "restSec": preset["rest"],
            "blockRestSec": preset["block_rest"],
            "totalHangSec": total_work,
            "estimatedDurationSec": total_work + total_rest,
            "holdNames": sorted({hold_name for exercise in exercises for hold_name in exercise["holdNames"]}),
        },
        "holds": BEASTMAKER_1000_HOLDS,
        "exercises": exercises,
        "steps": steps,
        "warnings": warnings,
    }


def recommend_progression(workout: dict, log: dict, comparable_clean_count: int = 0) -> dict:
    completed = int(log.get("completedReps", log.get("completed_reps", 0)) or 0)
    failed = int(log.get("failedReps", log.get("failed_reps", 0)) or 0)
    avg_rpe = float(log.get("averageRpe", log.get("average_rpe", 0)) or 0)
    pain = int(log.get("painScore", log.get("pain_score", 0)) or 0)
    total_hangs = len([step for step in workout.get("steps", []) if step.get("type") == "hang"])

    if pain >= 3:
        return {"direction": "regress", "action": "Switch to maintenance, use easier holds, and increase rest.", "reason": "Pain score is 3 or higher."}
    if pain > 0:
        return {"direction": "hold", "action": "Repeat with reduced intensity and stop if pain returns.", "reason": "Pain was reported."}
    if failed > 0 or (total_hangs and completed < total_hangs):
        return {"direction": "regress", "action": "Use easier holds, more assistance, fewer blocks, or longer rests.", "reason": "The session had failed or missed reps."}
    if avg_rpe > 8:
        return {"direction": "hold", "action": "Repeat the same session before progressing.", "reason": "Average RPE was above 8."}
    if comparable_clean_count >= 1:
        load_mode = workout.get("loadMode")
        session_length = workout.get("sessionLength")
        if load_mode == "assisted":
            action = "Reduce assistance by one small step."
        elif load_mode == "added_weight":
            action = "Add 1 to 2 kg."
        elif session_length == "short":
            action = "Move from short to normal."
        else:
            action = "Use slightly smaller holds or add one block, but not both."
        return {"direction": "advance", "action": action, "reason": "Two clean comparable sessions are available."}
    return {"direction": "hold", "action": "Repeat once more before advancing.", "reason": "Advance only after two clean comparable sessions."}

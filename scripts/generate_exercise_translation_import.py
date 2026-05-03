import json
import sqlite3
import sys
from pathlib import Path


FRENCH_NAMES = {
    "angled_leg_press": "Presse à cuisses inclinée",
    "arm_bike_warmup": "Échauffement arm bike",
    "back_lat_pulldowns": "Tirage vertical dos",
    "back_press": "Développé nuque",
    "barbell_curls": "Curl barre",
    "barbell_front_raises": "Élévations frontales à la barre",
    "barbell_pullovers": "Pull-over barre",
    "barbell_shrugs": "Haussements d'épaules à la barre",
    "bench_press": "Développé couché",
    "bent_over_lateral_raises": "Élévations latérales buste penché",
    "bent_rows": "Rowing buste penché",
    "bike": "Vélo",
    "broomstick_twists": "Rotations au bâton",
    "cable_adductions": "Adductions à la poulie",
    "cable_crossover_fly": "Écartés à la poulie vis-à-vis",
    "cable_hip_abductions": "Abductions de hanche à la poulie",
    "cable_kick_backs": "Extensions de hanche à la poulie",
    "calf_gentle_stretch": "Étirement doux du mollet",
    "calves_over_bench_sit_ups": "Relevés de buste mollets sur banc",
    "chest_dumbbell_press": "Développé haltères poitrine",
    "chin_ups": "Tractions supination",
    "close_grip_bench_press": "Développé couché prise serrée",
    "close_grip_lat_pulldowns": "Tirage vertical prise serrée",
    "concentration_curls": "Curl concentration",
    "crunch": "Crunchs",
    "curls": "Curls",
    "dead_bug": "Dead Bug",
    "deadlifts": "Soulevé de terre",
    "decline_press": "Développé décliné",
    "donkey_calf_raises": "Mollets donkey",
    "dumbbell_flys": "Écartés haltères",
    "dumbbell_press": "Développé haltères épaules",
    "dumbbell_pullovers": "Pull-over haltère",
    "dumbbell_shrugs": "Haussements d'épaules haltères",
    "dumbbell_side_bends": "Flexions latérales haltère",
    "dumbbell_squats": "Squats haltères",
    "dumbbell_triceps_extensions": "Extensions triceps haltères",
    "face_pull": "Face pull",
    "floor_hip_abductions": "Abductions de hanche au sol",
    "floor_hip_extensions_kick_backs": "Extensions de hanche au sol",
    "front_press": "Développé devant",
    "front_raises": "Élévations frontales",
    "front_squats": "Squat avant",
    "glute_bridge": "Pont fessier",
    "good_mornings": "Good morning",
    "gym_ladder_sit_ups": "Relevés de buste à l'espalier",
    "hack_squats": "Hack squat",
    "hammer_curl": "Curl marteau",
    "hamstring_stretch": "Étirement ischio-jambiers",
    "hangboard": "Poutre d'escalade",
    "hanging_leg_raises": "Relevés de jambes suspendu",
    "high_pulley_crunches": "Crunch à la poulie haute",
    "high_pulley_curls": "Curl à la poulie haute",
    "hip_mobility": "Mobilité des hanches",
    "hockey": "Hockey",
    "incline_bench_sit_ups": "Relevés de buste banc incliné",
    "incline_dumbbell_flys": "Écartés inclinés haltères",
    "incline_dumbbell_press": "Développé incliné haltères",
    "incline_leg_raises": "Relevés de jambes inclinés",
    "incline_press": "Développé incliné",
    "lat_pulldown": "Tirage vertical",
    "lateral_raises": "Élévations latérales",
    "leg_extension": "Extensions des jambes",
    "leg_raises": "Relevés de jambes",
    "low_pulley_bent_over_lateral_raises": "Élévations latérales buste penché à la poulie basse",
    "low_pulley_curls": "Curl à la poulie basse",
    "low_pulley_front_raise": "Élévations frontales à la poulie basse",
    "low_pulley_lateral_raises": "Élévations latérales à la poulie basse",
    "lunges": "Fentes",
    "lying_leg_curls": "Leg curl allongé",
    "machine_adductions": "Adductions machine",
    "machine_crunches": "Crunch machine",
    "machine_curls": "Curl machine",
    "machine_hip_extensions_kick_backs": "Extensions de hanche machine",
    "machine_shrugs": "Haussements d'épaules machine",
    "machine_trunk_rotations": "Rotations du tronc machine",
    "mobility": "Mobilité",
    "nautilus_lateral_raises": "Élévations latérales Nautilus",
    "one_arm_dumbbell_press": "Développé un bras haltère",
    "one_arm_dumbbell_rows": "Rowing un bras haltère",
    "one_arm_dumbbell_triceps_extensions": "Extension triceps un bras haltère",
    "one_arm_reverse_pushdowns": "Pushdown inversé un bras",
    "one_dumbbell_front_raises": "Élévation frontale avec un haltère",
    "one_leg_toe_raises": "Mollets une jambe",
    "parallel_bar_dips": "Dips aux barres parallèles",
    "pec_deck": "Écartés pec deck",
    "pec_deck_rear_delt_laterals": "Oiseau pec deck",
    "plank": "Planche",
    "power_squats": "Power squat",
    "preacher_curls": "Curl pupitre",
    "push_ups": "Pompes",
    "reverse_chin_ups": "Tractions inversées supination",
    "reverse_curls": "Curl inversé",
    "reverse_pushdown": "Pushdown inversé",
    "reverse_wrist_curls": "Curl poignets inversé",
    "roman_chair_side_bends": "Flexions latérales banc romain",
    "russian_twist": "Russian twist",
    "seated_barbell_calf_raises": "Mollets assis à la barre",
    "seated_biceps_curl": "Curl biceps assis",
    "seated_calf_raises": "Mollets assis",
    "seated_chest_press": "Chest press assise",
    "seated_dumbbell_triceps_extensions": "Extension triceps assis haltères",
    "seated_ez_bar_triceps_extensions": "Extension triceps assis barre EZ",
    "seated_leg_curl": "Leg curl assis",
    "seated_machine_hip_abductions": "Abductions de hanche machine assise",
    "seated_row": "Rowing assis",
    "seated_shoulder_press": "Développé épaules assis",
    "side_lying_lateral_raises": "Élévations latérales couché côté",
    "side_plank": "Planche latérale",
    "sit_ups": "Sit-ups",
    "specific_bench_sit_ups": "Relevés de buste banc spécifique",
    "squats": "Squats",
    "standing_calf_raises": "Mollets debout",
    "standing_leg_curls": "Leg curl debout",
    "standing_machine_hip_abductions": "Abductions de hanche machine debout",
    "stiff_legged_deadlifts": "Soulevé de terre jambes tendues",
    "straight_arm_lat_pulldown": "Tirage bras tendus",
    "sumo_deadlifts": "Soulevé de terre sumo",
    "t_bar_rows": "Rowing T-bar",
    "triceps_dips": "Dips triceps",
    "triceps_extensions": "Extensions triceps",
    "triceps_kickbacks": "Kickbacks triceps",
    "triceps_pushdown": "Pushdown triceps",
    "upper body": "Haut du corps",
    "upright_row": "Tirage menton",
    "wrist_curls": "Curl poignets",
}

ENGLISH_NAMES = {
    "bike": "Bike",
    "hangboard": "Hangboard",
    "hockey": "Hockey",
    "mobility": "Mobility",
    "upper body": "Upper Body",
    "arm_bike_warmup": "Arm Bike Warm-Up",
    "triceps_pushdown": "Triceps Pushdown",
    "cable_crossover_fly": "Cable Crossover Fly",
}


def fallback_title(name: str) -> str:
    return name.replace("_", " ").title()


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: python scripts/generate_exercise_translation_import.py <db_path> <output_json>")
        return 1

    db_path = Path(sys.argv[1]).expanduser().resolve()
    output_path = Path(sys.argv[2]).expanduser().resolve()

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT name, display_name, display_name_fr, display_name_en, category, description, link, image, document
        FROM exercises
        ORDER BY name
        """
    ).fetchall()
    conn.close()

    payload = {"exercises": []}
    translated_count = 0
    for row in rows:
        name = str(row["name"])
        legacy_display = str(row["display_name"] or "").strip()
        display_name_en = ENGLISH_NAMES.get(name) or str(row["display_name_en"] or "").strip() or legacy_display or fallback_title(name)
        display_name_fr = FRENCH_NAMES.get(name) or str(row["display_name_fr"] or "").strip() or legacy_display or fallback_title(name)
        if name in FRENCH_NAMES:
            translated_count += 1
        payload["exercises"].append(
            {
                "name": name,
                "display_name": display_name_fr,
                "display_name_fr": display_name_fr,
                "display_name_en": display_name_en,
                "category": str(row["category"] or ""),
                "description": str(row["description"] or ""),
                "link": str(row["link"] or ""),
                "image": str(row["image"] or ""),
                "document": str(row["document"] or ""),
            }
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output_path), "exercises": len(payload["exercises"]), "translated_fr": translated_count}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

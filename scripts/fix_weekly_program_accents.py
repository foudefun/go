import sqlite3
import sys
from pathlib import Path


CORRECTIONS = {
    "barbell_back_squat": ("Squat avec barre", "Squat avec barre", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "romanian_deadlift": ("Soulev\u00e9 de terre roumain", "Soulev\u00e9 de terre roumain", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "walking_lunges": ("Fentes march\u00e9es", "Fentes march\u00e9es", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "barbell_hip_thrust": ("Hip thrust barre", "Hip thrust barre", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "weighted_plank": ("Planche lest\u00e9e", "Planche lest\u00e9e", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "bench_press": ("D\u00e9velopp\u00e9 couch\u00e9", "D\u00e9velopp\u00e9 couch\u00e9", "Exercice mis \u00e0 jour depuis le visuel du programme hebdomadaire."),
    "weighted_pull_ups": ("Tractions lest\u00e9es", "Tractions lest\u00e9es", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "barbell_row": ("Rowing barre", "Rowing barre", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "overhead_press": ("D\u00e9velopp\u00e9 militaire", "D\u00e9velopp\u00e9 militaire", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "rower_or_ski_erg_intervals": ("Intervalles rameur ou ski erg", "Intervalles rameur ou ski erg", "Bloc cardio/conditioning import\u00e9 depuis le visuel du programme hebdomadaire."),
    "box_jumps": ("Box jumps", "Box jumps", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "squat_jump_light": ("Squat jump l\u00e9ger", "Squat jump l\u00e9ger", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "kettlebell_swings": ("Kettlebell swings", "Kettlebell swings", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "push_press": ("Push press", "Push press", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "medicine_ball_rotational_throws": ("Lancers med ball rotation", "Lancers med ball rotation", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "sprints_20m": ("Sprints 20 m", "Sprints 20 m", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "front_squats": ("Front squat", "Front squat", "Exercice mis \u00e0 jour depuis le visuel du programme hebdomadaire."),
    "angled_leg_press": ("Presse \u00e0 cuisses", "Presse \u00e0 cuisses", "Exercice mis \u00e0 jour depuis le visuel du programme hebdomadaire."),
    "bulgarian_split_squat": ("Bulgarian split squat", "Bulgarian split squat", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "leg_curl": ("Leg curl", "Leg curl", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "standing_calf_raises": ("Mollets debout", "Mollets debout", "Exercice mis \u00e0 jour depuis le visuel du programme hebdomadaire."),
    "zone_2_run": ("Course zone 2", "Course zone 2", "Bloc cardio import\u00e9 depuis le visuel du programme hebdomadaire."),
    "incline_dumbbell_press": ("D\u00e9velopp\u00e9 inclin\u00e9 halt\u00e8res", "D\u00e9velopp\u00e9 inclin\u00e9 halt\u00e8res", "Exercice mis \u00e0 jour depuis le visuel du programme hebdomadaire."),
    "seated_row": ("Tirage horizontal", "Tirage horizontal", "Exercice mis \u00e0 jour depuis le visuel du programme hebdomadaire."),
    "lateral_raises": ("\u00c9l\u00e9vations lat\u00e9rales", "\u00c9l\u00e9vations lat\u00e9rales", "Exercice mis \u00e0 jour depuis le visuel du programme hebdomadaire."),
    "parallel_bar_dips": ("Dips", "Dips", "Exercice mis \u00e0 jour depuis le visuel du programme hebdomadaire."),
    "bicep_curl": ("Curl biceps", "Curl biceps", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "triceps_extension": ("Extension triceps", "Extension triceps", "Exercice import\u00e9 depuis le visuel du programme hebdomadaire."),
    "rower_conditioning": ("Conditioning rameur", "Conditioning rameur", "Bloc cardio/conditioning import\u00e9 depuis le visuel du programme hebdomadaire."),
    "hamstring_stretch": ("\u00c9tirement ischio-jambiers", "\u00c9tirement ischio-jambiers", "Mobilit\u00e9 import\u00e9e depuis le visuel du programme hebdomadaire."),
    "hip_mobility": ("Mobilit\u00e9 des hanches", "Mobilit\u00e9 des hanches", "Mobilit\u00e9 import\u00e9e depuis le visuel du programme hebdomadaire."),
    "adductor_mobility": ("Mobilit\u00e9 adducteurs", "Mobilit\u00e9 adducteurs", "Mobilit\u00e9 import\u00e9e depuis le visuel du programme hebdomadaire."),
    "ankle_mobility": ("Mobilit\u00e9 chevilles", "Mobilit\u00e9 chevilles", "Mobilit\u00e9 import\u00e9e depuis le visuel du programme hebdomadaire."),
}


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python scripts/fix_weekly_program_accents.py <db_path>")
        return 1

    db_path = Path(sys.argv[1]).expanduser().resolve()
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    for name, (display_name, display_name_fr, description) in CORRECTIONS.items():
        cur.execute(
            "UPDATE exercises SET display_name = ?, display_name_fr = ?, description = ? WHERE name = ?",
            (display_name, display_name_fr, description, name),
        )
    conn.commit()

    for sample in ("bench_press", "romanian_deadlift", "weighted_pull_ups", "lateral_raises", "hamstring_stretch"):
        row = cur.execute(
            "SELECT name, hex(display_name_fr), hex(description) FROM exercises WHERE name = ?",
            (sample,),
        ).fetchone()
        if row:
            print(row)

    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

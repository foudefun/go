import json
import re
from collections import Counter
from pathlib import Path

import fitz


PDF_PATH = Path(r"C:\Users\JeromeStrecker\OneDrive - Gama\Desktop\frederic-delavier-strength-training-anatomy-first-edition.pdf")
ASSET_DIR = Path(r"C:\Users\JeromeStrecker\OneDrive - Gama\Documents\IT\rehab\frontend\assets\exercises\delavier\book")
IMPORT_PATH = Path(r"C:\Users\JeromeStrecker\OneDrive - Gama\Documents\IT\rehab\imports\delavier_full_exercises.json")
BOOK_TO_PDF_OFFSET = 6

SECTIONS = [
    (
        "arms",
        1,
        [
            "Curls",
            "Concentration Curls",
            "Hammer Curls",
            "Low Pulley Curls",
            "High Pulley Curls",
            "Barbell Curls",
            "Machine Curls",
            "Preacher Curls",
            "Reverse Curls",
            "Reverse Wrist Curls",
            "Wrist Curls",
            "Pushdowns",
            "Reverse Pushdowns",
            "One-Arm Reverse Pushdowns",
            "Triceps Extensions",
            "Dumbbell Triceps Extensions",
            "One-Arm Dumbbell Triceps Extensions",
            "Seated Dumbbell Triceps Extensions",
            "Seated EZ-Bar Triceps Extensions",
            "Triceps Kickbacks",
            "Triceps Dips",
        ],
    ),
    (
        "shoulders",
        23,
        [
            "Back Press",
            "Front Press",
            "Dumbbell Press",
            "One-Arm Dumbbell Press",
            "Lateral Raises",
            "Bent-Over Lateral Raises",
            "Front Raises",
            "Side-Lying Lateral Raises",
            "Low Pulley Lateral Raises",
            "Low Pulley Front Raises",
            "Low Pulley Bent-Over Lateral Raises",
            "One-Dumbbell Front Raises",
            "Barbell Front Raises",
            "Upright Rows",
            "Nautilus Lateral Raises",
            "Pec Deck Rear Delt Laterals",
        ],
    ),
    (
        "chest",
        41,
        [
            "Bench Press",
            "Close-Grip Bench Press",
            "Incline Press",
            "Decline Press",
            "Push-Ups",
            "Parallel Bar Dips",
            "Dumbbell Press",
            "Dumbbell Flys",
            "Incline Dumbbell Press",
            "Incline Dumbbell Flys",
            "Pec Deck Flys",
            "Cable Crossover Flys",
            "Dumbbell Pullovers",
            "Barbell Pullovers",
        ],
    ),
    (
        "back",
        59,
        [
            "Chin-Ups",
            "Reverse Chin-Ups",
            "Lat Pulldowns",
            "Back Lat Pulldowns",
            "Close-Grip Lat Pulldowns",
            "Straight-Arm Lat Pulldowns",
            "Seated Rows",
            "One-Arm Dumbbell Rows",
            "Bent Rows",
            "T-Bar Rows",
            "Stiff-Legged Deadlifts",
            "Deadlifts",
            "Sumo Deadlifts",
            "Back Extension",
            "Upright Rows",
            "Barbell Shrugs",
            "Dumbbell Shrugs",
            "Machine Shrugs",
        ],
    ),
    (
        "legs",
        79,
        [
            "Dumbbell Squats",
            "Squats",
            "Front Squats",
            "Power Squats",
            "Angled Leg Press",
            "Hack Squats",
            "Leg Extensions",
            "Lying Leg Curls",
            "Standing Leg Curls",
            "Seated Leg Curls",
            "Good Mornings",
            "Cable Adductions",
            "Machine Adductions",
            "Standing Calf Raises",
            "One-Leg Toe Raises",
            "Donkey Calf Raises",
            "Seated Calf Raises",
            "Seated Barbell Calf Raises",
        ],
    ),
    (
        "buttocks",
        98,
        [
            "Lunges",
            "Cable Kick Backs",
            "Machine Hip Extensions (Kick Backs)",
            "Floor Hip Extensions (Kick Backs)",
            "Bridging",
            "Cable Hip Abductions",
            "Standing Machine Hip Abductions",
            "Floor Hip Abductions",
            "Seated Machine Hip Abductions",
        ],
    ),
    (
        "abdomen",
        108,
        [
            "Crunches",
            "Sit-Ups",
            "Gym Ladder Sit-Ups",
            "Calves Over Bench Sit-Ups",
            "Incline Bench Sit-Ups",
            "Specific Bench Sit-Ups",
            "High Pulley Crunches",
            "Machine Crunches",
            "Incline Leg Raises",
            "Leg Raises",
            "Hanging Leg Raises",
            "Broomstick Twists",
            "Dumbbell Side Bends",
            "Roman Chair Side Bends",
            "Machine Trunk Rotations",
        ],
    ),
]

NAME_OVERRIDES = {
    ("arms", "Hammer Curls"): "hammer_curl",
    ("arms", "Pushdowns"): "triceps_pushdown",
    ("arms", "Reverse Pushdowns"): "reverse_pushdown",
    ("shoulders", "Back Press"): "back_press",
    ("shoulders", "Low Pulley Front Raises"): "low_pulley_front_raise",
    ("shoulders", "Upright Rows"): "shoulders_upright_row",
    ("chest", "Close-Grip Bench Press"): "close_grip_bench_press",
    ("chest", "Pec Deck Flys"): "pec_deck",
    ("chest", "Cable Crossover Flys"): "cable_crossover_fly",
    ("back", "Lat Pulldowns"): "lat_pulldown",
    ("back", "Straight-Arm Lat Pulldowns"): "straight_arm_lat_pulldown",
    ("back", "Seated Rows"): "seated_row",
    ("back", "Upright Rows"): "back_upright_row",
    ("legs", "Angled Leg Press"): "angled_leg_press",
    ("legs", "Leg Extensions"): "leg_extension",
    ("legs", "Seated Leg Curls"): "seated_leg_curl",
    ("abdomen", "Crunches"): "crunch",
}


def slugify(text: str) -> str:
    value = text.lower()
    value = value.replace("&", " and ")
    value = re.sub(r"[()'’\-]+", " ", value)
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return re.sub(r"_+", "_", value).strip("_")


def display_name(section: str, title: str, duplicate_titles: Counter[str]) -> str:
    if duplicate_titles[title] > 1 and title == "Dumbbell Press":
        return f"{title} ({section.title()})"
    if duplicate_titles[title] > 1 and title == "Upright Rows":
        return f"{title} ({section.title()})"
    return title


def description(section: str, title: str) -> str:
    return f"Imported from Strength Training Anatomy, {section.title()} section."


def build_records() -> list[dict]:
    titles = Counter(title for _, _, items in SECTIONS for title in items)
    records = []
    used_names: set[str] = set()

    for section, start_book_page, items in SECTIONS:
        for index, title in enumerate(items, start=1):
            book_page = start_book_page + index
            pdf_page = book_page + BOOK_TO_PDF_OFFSET
            key = (section, title)
            name = NAME_OVERRIDES.get(key, slugify(title))
            if name in used_names:
                name = f"{section}_{name}"
            used_names.add(name)
            image = f"/assets/exercises/delavier/book/{name}.png"
            records.append(
                {
                    "name": name,
                    "display_name": display_name(section, title, titles),
                    "category": section,
                    "description": description(section, title),
                    "image": image,
                    "source_book_page": book_page,
                    "source_pdf_page": pdf_page,
                }
            )

    return records


def export_images(records: list[dict]) -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(PDF_PATH)
    for record in records:
        page = doc[record["source_pdf_page"] - 1]
        rect = page.rect
        clip = fitz.Rect(rect.width * 0.02, rect.height * 0.03, rect.width * 0.96, rect.height * 0.76)
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=clip, alpha=False)
        pix.save(ASSET_DIR / f"{record['name']}.png")


def export_import_file(records: list[dict]) -> None:
    payload = {"exercises": records, "planned_sessions": []}
    IMPORT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    records = build_records()
    export_images(records)
    export_import_file(records)
    print(json.dumps({"exercise_count": len(records), "import_file": str(IMPORT_PATH)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

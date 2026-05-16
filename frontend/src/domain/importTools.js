export const IMPORT_FORMATS = [
  { value: "json", label: "Program JSON" },
  { value: "schedule_csv", label: "Schedule CSV" },
  { value: "exercises_csv", label: "Exercises CSV" },
];

export const PROGRAM_IMPORT_SAMPLES = {
  json: JSON.stringify(
    {
      start_date: "2026-05-20",
      exercises: [
        {
          name: "tempo_squat",
          display_name_en: "Tempo Squat",
          display_name_fr: "Squat tempo",
          category: "legs",
          tracking_mode: "reps_weight",
          weight_unit: "kg",
          description: "Controlled squat work with a deliberate eccentric.",
        },
      ],
      planned_sessions: [
        {
          date: "2026-05-20",
          title: "Strength base",
          duration_target_min: 60,
          location: "Gym",
          notes: "Keep effort easy.",
          physio_time: "18:30",
          items: [
            {
              exercise_name: "tempo_squat",
              block: "legs",
              sets: 4,
              reps: 8,
              notes: "3 seconds down",
            },
          ],
        },
      ],
    },
    null,
    2,
  ),
  schedule_csv:
    "date,title,duration_target_min,location,plan_notes,physio_time,exercise_name,block,sets,reps,duration_min,duration_sec,item_notes\n" +
    "2026-05-20,Strength base,60,Gym,Keep effort easy,18:30,tempo_squat,legs,4,8,,,3 seconds down\n",
  exercises_csv:
    "name,display_name,category,movement_family,variant_label,tracking_mode,weight_unit,description,link,image,document\n" +
    "tempo_squat,Tempo Squat,legs,squat,tempo,reps_weight,kg,Controlled squat work,,,\n",
};

export function buildImportAiPrompt() {
  return [
    "Convert the following training program into valid JSON for my Rehab Tracker importer.",
    "",
    "Return raw JSON only. No markdown. No explanation.",
    "",
    "Use exactly this top-level structure:",
    "{",
    '  "start_date": "YYYY-MM-DD",',
    '  "exercises": [',
    "    {",
    '      "name": "snake_case_name",',
    '      "display_name_fr": "French name",',
    '      "display_name_en": "English name",',
    '      "category": "back, arms",',
    '      "tracking_mode": "reps_weight" or "time_watts",',
    '      "weight_unit": "kg" or "lb",',
    '      "description": "Short description",',
    '      "link": "https://...",',
    '      "image": "https://...",',
    '      "images": ["https://..."],',
    '      "document": "https://..."',
    "    }",
    "  ],",
    '  "planned_sessions": [',
    "    {",
    '      "date": "YYYY-MM-DD",',
    '      "title": "Session title",',
    '      "duration_target_min": 80,',
    '      "location": "Gym",',
    '      "notes": "Session notes",',
    '      "physio_time": "HH:MM",',
    '      "items": [',
    "        {",
    '          "exercise_name": "snake_case_name",',
    '          "block": "back",',
    '          "sets": 4,',
    '          "reps": 10,',
    '          "duration_min": 10,',
    '          "duration_sec": 45,',
    '          "notes": "optional note"',
    "        }",
    "      ]",
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- Use snake_case for exercise names.",
    "- Keep dates in YYYY-MM-DD format.",
    "- Keep physio_time in HH:MM 24h format or omit it.",
    "- Put new or updated exercises in the exercises array.",
    "- Use tracking_mode='reps_weight' for classic strength work.",
    "- Use tracking_mode='time_watts' for bike, erg, or machines that track time and watts.",
    "- If an exercise is time-based, prefer duration_min or duration_sec.",
    "- If it is rep-based, use sets and reps.",
    "",
    "Now convert this program:",
    "[PASTE THE TRAINING PROGRAM HERE]",
  ].join("\n");
}

export function detectProgramImportFormat(text = "", fileName = "") {
  const trimmed = String(text || "").trim();
  const lowerFileName = String(fileName || "").toLowerCase();
  if (lowerFileName.endsWith(".json")) return "json";
  if (lowerFileName.endsWith(".csv")) {
    return trimmed.includes("exercise_name") ? "schedule_csv" : "exercises_csv";
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  if (trimmed.includes("exercise_name")) return "schedule_csv";
  return "exercises_csv";
}

export function detectActivityFileFormat(fileName = "") {
  const suffix = String(fileName || "").split(".").pop().toLowerCase();
  return ["fit", "tcx", "gpx"].includes(suffix) ? suffix : "auto";
}

export function summarizeProgramImport(result = {}) {
  return {
    imported_sessions: Number(result.imported_sessions || 0),
    created_exercises: Number(result.created_exercises || 0),
    updated_exercises: Number(result.updated_exercises || 0),
  };
}

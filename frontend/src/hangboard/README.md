# Hangboard Visual System

The hangboard UI uses user-provided Beastmaker 1000 exercise card images from `frontend/assets/hangboard/beastmaker1000/cards`.

The app still includes an original SVG schematic fallback for unsupported card combinations. Do not add scraped product imagery or generated product photos unless the project has permission to use them.

## Beastmaker 1000 Layout

The layout lives in `boardLayouts/beastmaker1000.js`.

Hold slugs are stable identifiers. They name the board, side, hold depth, finger count, and size where useful:

- `jug_left`, `jug_right`
- `sloper_35_left`, `sloper_35_right`
- `sloper_20_left`, `sloper_20_right`
- `very_deep_4_finger_center`
- `deep_4_finger_left`, `deep_4_finger_right`
- `deep_3_finger_left`, `deep_3_finger_right`
- `deep_2_finger_left`, `deep_2_finger_right`
- `medium_4_finger_left`, `medium_4_finger_right`
- `small_4_finger_10mm_left`, `small_4_finger_10mm_right`
- `medium_2_finger_left`, `medium_2_finger_right`
- `medium_3_finger_left`, `medium_3_finger_right`

The very deep 4-finger pocket is intentionally modeled as one center hold that can support both hands. It is not a left/right pair.

## Coordinates

Hold coordinates are stored with the card assets in `hold_coordinates_normalized.json`. They are calibrated to the provided front-facing Beastmaker 1000 reference image dimensions and can be used for responsive overlays.

The current UI prefers pre-rendered exercise cards. If the card set is replaced, keep the same hold slugs and update the normalized coordinates together.

## Adding Another Board

Add a new board layout file with:

- a viewBox
- a hold list with unique slugs
- hold groups used by the generator
- a board SVG component or a generic renderer for that board

The backend generator must return `holdSlugs` that exist in the frontend board layout.

## Difficulty Labels

Hangboard levels such as `6A` or `7A` describe workout difficulty only. They are not a claim that the user climbs that grade.

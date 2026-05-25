# ChatGPT Prompt: Outdoor Route Location Inventory

Use this prompt when asking ChatGPT to research or structure locations for the outdoor route planner. Replace the bracketed placeholders before sending.

```text
I am preparing structured location data for an outdoor route planning app.

Area / objective:
[NAME OF AREA, MASSIF, VALLEY, SUMMIT, OR ROUTE OBJECTIVE]

Activities to consider:
- ski_touring
- hiking
- alpinism
- outdoor_climbing

Please identify relevant locations only. Do not design database tables.

Location entity types allowed:
- summit
- trailhead
- parking
- hut
- station
- pass
- waypoint
- other_location
- crag
- sector

Important rules:
- Coordinates are optional.
- If coordinates are uncertain, set coordinate_status to "approximate" or "area_only".
- If coordinates are unknown, leave latitude/longitude/elevation_meters null and set coordinate_status to "unknown".
- Do not invent exact coordinates.
- Prefer official or widely used names.
- Include alternate names in aliases.
- Keep crags/sectors only when they are relevant to outdoor climbing topo context.
- Keep output factual and mark uncertain items clearly in notes.

Return JSON only, using this shape:

{
  "locations": [
    {
      "location_entity_type": "summit | trailhead | parking | hut | station | pass | waypoint | other_location | crag | sector",
      "name": "",
      "aliases": [],
      "latitude": null,
      "longitude": null,
      "elevation_meters": null,
      "coordinate_status": "exact | approximate | area_only | unknown",
      "description": "",
      "access_notes": "",
      "source_references": [
        {
          "source_type": "guidebook | website | map | official_agency | hut | club | personal_knowledge | other",
          "title": "",
          "url": "",
          "publisher": "",
          "notes": ""
        }
      ],
      "open_questions": []
    }
  ],
  "route_location_roles_suggestions": [
    {
      "route_or_objective_name": "",
      "location_name": "",
      "location_entity_type": "",
      "role": "main_objective | start | end | passes_through | approach_start | descent_end | bailout | nearby | water | crux | transition | ski_depot | belay | anchor | rappel",
      "order_index": null,
      "notes": ""
    }
  ],
  "missing_information": []
}

After the JSON, do not add explanatory prose.
```

Before importing the result into the app, review every coordinate, source, and role manually.

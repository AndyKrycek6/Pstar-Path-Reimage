# Pilgrim Star Path — v0.40

A local-first navigation console with 2D/3D maps, saved waypoints and a journey archive. Includes backup/restore, automatic 3D orbit and a compact mobile interface.

## v0.40 updates

- Pahefu's support link text is 20% larger.
- Removed the signal-booster prompt box and integrated route telemetry into Destination profile.
- Refreshed the built-in capital destinations; see [coordinate sources](CAPITALS.md). Existing selections and removed built-in destinations follow the updated addresses. Custom waypoints and journey history retain their saved coordinates.

## v0.39 updates

### Automatic 3D orbit

Switch the map to **3D**, choose **Free view**, **Player lock** or **Destination lock**, then select **Start orbit**. A full revolution takes two minutes. Player and destination locks keep that point centred; free view rotates around your current view centre. Locks become available once the corresponding coordinates are set.

Use **Pause orbit** to stop. Dragging also pauses the orbit; Shift-drag switches to free view and pans. Zoom and tilt remain adjustable. Switching away from the map, hiding the browser tab or returning to 2D pauses animation. **Reset map view** stops the orbit and restores the initial view. Orbit starts only when requested, including when reduced motion is enabled.

- Removed the examples below the origin entry.
- No destination shows a pulsing **NO LOCK** advisory (respecting reduced-motion settings).
- Empty input shows **Awaiting hex input**; invalid input shows **Invalid hex input** in red with a red orb.
- Enlarged saved checkpoint names, addresses, notes and status text.
- Click a saved note or its Edit button to open a larger editor. Save, cancel and clear work for individual checkpoints, including archived notes.

## Earlier improvements

### Recorded history and saved data

- Completing a journey keeps actual checkpoints; it never adds an unvisited destination. Starting another journey closes the previous record at its last recorded stop.
- The example origin address and custom waypoints at Pilgrim Star's address survive reloads.
- Different system addresses in one region are separate checkpoints; repeating the same address does not add a duplicate.
- Resuming an active journey restores its latest checkpoint. Replay/resume falls back to 2D if 3D is unavailable.
- Reset Session requests confirmation with unfinished journey/checkpoint counts. Completed journeys are retained and deleted waypoints restored.

### Coordinates and guidance

- New input accepts whole-number signal-booster coordinates: X/Z from 0–4095, Y from 0–255. Negative, fractional or out-of-range values receive an inline explanation instead of being silently changed. Existing finite legacy coordinates remain in archives.
- Distance estimates use **400 LY per region**, matching the original [Pilgrim Star Path calculation source](https://github.com/pahefu/pilgrimstarpath/blob/master/js/gdl.js): region distance is multiplied by 100, and displayed distance by another four. A 3–4–5 region displacement estimates 2,000 LY.
- These are region estimates, not precise distances between stars. Jump counts assume full use of the configured range and do not find intermediate star systems. No live in-game calibration was performed.
- Matching addresses show **Arrived — 0 jumps**. Different addresses in the same region show **Same region**, with no arbitrary horizontal compass direction. The fourth block identifies the system; region coordinates alone cannot prove arrival there.
- The reference ring is illustrative; it does not predict black-hole exits.
- Built-in community destinations remain Euclid references. Changing the galaxy label does not relocate those communities.

### Interface

- Streamlined map with Add destination and a dedicated Guide tab for field instructions and map controls.
- Expandable checkpoint notes, destination details and vertical telemetry.
- At widths up to 920px, detailed guidance moves below the map; origin and destination controls stay above it.
- Larger essential text, controls and focus indicators, with reduced-motion support.
- Traveller notes and backup controls replace development-facing panels.

### Backups

**Config → Export backup** downloads the current tab's journeys, notes, custom/deleted waypoints, origin, destination and settings—even if a browser save failed.

**Import backup** validates the file and previews its contents. Nothing changes until **Replace with backup** is selected. Cancel preserves current data. Restore replaces rather than merges records; export first to keep both sets. Import limit: 20 MB.

Failed storage writes show a persistent warning. **Save again** retries the entire current state. If a multi-key write fails, the app attempts to restore previous values. If storage cannot be recovered, keep the backup and export the current tab before closing.

## Files

- `index.html` — interface
- `styles.css`, `improvements.css` — base styling, v0.40 layout and accessibility
- `calculations.js` — coordinate validation and route estimates
- `map3d.js` — existing Canvas renderer
- `backup.js` — backup validation and storage transactions
- `app.js` — state and interactions
- `tests/regression.test.cjs` — regression checks

Original project: [Pahefu's Pilgrim Star Path](https://pahefu.github.io/pilgrimstarpath/).



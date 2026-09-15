# Pilgrim Star Path Reimagined

A static, local-first redesign prototype for Pilgrim Star Path.

## Run it

The app has no build step and no external dependencies. Open `index.html` directly in a browser, or serve the folder locally:

```bash
cd pilgrim-star-path-reimagined
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## What is included

- Dark deep-space navigation-console UI
- SVG star map with a generated starfield and grid shared by galaxy and local views
- Full 0–4096 galactic frame with the galactic centre fixed at the map centre
- Local Mode target-centred radar with an N×N region scale from Settings
- Manual Local Mode switching from the map footer button
- Full-range mouse/touch drag to pan and wheel/buttons to zoom around the cursor
- Preserved 2D map aspect ratio with cursor-correct zooming
- One-click collapse for the complete top summary group
- Drag handles for persistent top-panel ordering
- Destination Profile now occupies the former Route Telemetry slot; Route Telemetry sits in the map-side stack
- Dependency-free Canvas 3D orbit map with 2D-consistent grab orbiting, Shift-drag pan and depth zoom
- Zoom-out limits on both map modes stop at the default 100% view
- Smooth, fine-grained zooming on both map modes with cursor-aware 2D focus
- Snap-to-user control recentres either map on the saved origin
- Persistent map nametag toggle shared by the 2D and 3D views
- More strongly outlined starship compass pointer with Galactic Centre bearing
- Initial 3D top view uses the negative-Y side of the screen frame (+X right, +Z down, navigation Y up), with full above/below-plane orbiting
- Named journey archive with local checkpoint recording and completion state
- Checkpoint names can be edited after they are saved, and local notes can be attached to any checkpoint
- Active journeys resume from their saved checkpoints after returning to the app; completed journeys can be restored to replay their route in 3D
- Reset Session clears in-progress journey checkpoints while keeping completed journey archives available for restore
- 2D SVG and 3D Canvas journey replay trails for saved routes
- Saved checkpoint waypoints are listed beneath the origin status
- Last valid origin coordinates are cached separately and restored at startup
- Fresh or reset sessions start with no origin and no selected destination; the old demonstration coordinates are never injected
- Existing custom waypoints and journey checkpoints remain compatible with later builds and are retained in localStorage
- Origin shows a slowly pulsing orange Awaiting Entry state, while Flight Guidance shows orange pulsing Waiting until a destination is selected
- A selected destination shows a static blue Destination Lock; clearing the selection also clears the destination profile and route values
- 2D-first startup with an in-session 2D / 3D map switch and manual local-map switching
- 360° radial compass with Galactic Centre North as zero and true North highlighted
- Approach telemetry graph showing the signed target angle from the galactic plane, with the plane at 0° and above/below target direction
- User coordinate input in hexadecimal address or decimal `x, y, z` form
- Separated calculation engine in `calculations.js`
- Three default community waypoints: Galactic Hub Project, Amino Hub and Alliance of Galactic Travellers
- Pilgrim Star is a highlighted fixed reference in the destination profile and remains rendered on both 2D and 3D views without being a selectable stored waypoint
- Stored waypoints, including custom additions, can be removed from the waypoint list or directory; removals are saved in localStorage
- Deleted waypoints can be restored from the Stored Waypoints panel, and Reset Session restores the built-in and deleted custom waypoint set
- When a selected destination shares Pilgrim Star's coordinates, its marker remains at the true position but fades behind the selected destination marker
- Homepage support link points to Pahefu's original Pilgrim Star Path and invites donations to the original creator
- Smaller outline-only ship pointer for the 360° route compass
- Collapsible orientation guide using the original centre-facing instruction
- Add waypoint form for custom names and coordinates
- Add Waypoint entry point directly below the homepage origin controls
- Black-hole ring visualisation
- Local settings saved with `localStorage`
- Destination directory, help view and activity log
- Journeys view with New journey, Resume journey, Replay route and Complete journey controls
- No external APIs or network calls

## Project structure

```text
index.html       interface and accessible markup
styles.css       visual system and responsive layout
calculations.js  isolated coordinate and route calculations
map3d.js         isolated perspective Canvas renderer and orbit controls
app.js           UI state, SVG/Canvas rendering and browser interactions
```

The built-in community waypoint addresses are static Euclid references sourced from public community/portal listings; they do not require an external API. The calculation scale is intentionally labelled as a mock build. The centre-angle follows the original “look at centre, turn toward destination” convention, while the distance scale remains mock. Replace the constants and formulas in `calculations.js` once verified Pilgrim Star Path examples are available.

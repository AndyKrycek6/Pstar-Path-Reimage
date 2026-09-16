(function () {
  "use strict";

  const math = window.PilgrimMath;
  if (!math) throw new Error("Calculation engine failed to load.");

  const STORAGE_KEY = "pilgrim-star-path-reimagined-settings";
  const SESSION_KEY = "pilgrim-star-path-reimagined-session";
  const ORIGIN_CACHE_KEY = "pilgrim-star-path-reimagined-origin";
  const JOURNEY_KEY = "pilgrim-star-path-reimagined-journeys";
  const WAYPOINT_KEY = "pilgrim-star-path-reimagined-waypoints";
  const MAP_VIEW = Object.freeze({ width: 1000, height: 560, fullMax: 4096, pad: 78 });
  const MAP_ZOOM_MIN = 1;
  const MAP_ZOOM_MAX = 12;
  const DEFAULT_3D_DISTANCE = 3.55;
  const TOP_PANEL_KEYS = Object.freeze(["location", "target", "advisory"]);
  const DEFAULT_SETTINGS = {
    hyperdrive: 1600,
    galaxy: "Euclid",
    gridSize: 16,
    mapHeight: 560,
    localMode: false,
    mapView: "2d",
    showNametags: true,
    topPanelsCollapsed: false,
    topPanelOrder: ["location", "advisory", "target"],
  };
  const GALAXY_CENTRE = math.GALAXY_CENTRE || { x: 2047, y: 127, z: 2047 };
  const DEFAULT_LOCATION = {
    address: "0432:0076:0D66:0172",
    coords: { x: 1074, y: 118, z: 3430 },
    planet: "0172",
  };
  const PILGRIM_STAR = Object.freeze({
    name: "Pilgrim Star",
    address: "064A:0082:01B9:009A",
    coords: Object.freeze({ x: 1610, y: 130, z: 441 }),
    planet: "009A",
    community: "Original Pilgrim Star Path",
  });
  const COMMUNITY_DESTINATIONS = [
    { name: "Galactic Hub Project · HUB16-205 Bixiann", address: "041C:004F:0D89:0205", coords: { x: 1052, y: 79, z: 3465 }, accent: "violet", permanent: true, community: "Galactic Hub Project" },
    { name: "Amino Hub · Amino Prime AH", address: "064A:0082:01B9:0051", coords: { x: 1610, y: 130, z: 441 }, accent: "amber", permanent: true, community: "Amino Hub" },
    { name: "AGT · Apygen K50 / Rigusu", address: "0971:0081:0EDD:0118", coords: { x: 2417, y: 129, z: 3805 }, accent: "blue", permanent: true, community: "Alliance of Galactic Travellers" },
  ];
  const initialJourneyStore = readJourneyStore();
  const initialWaypointStore = readWaypointStore();
  const initialDestinations = [
    ...COMMUNITY_DESTINATIONS
      .filter((destination) => !initialWaypointStore.removedAddresses.includes(destination.address))
      .map(cloneDestination),
    ...initialWaypointStore.custom,
  ];
  const initialSession = readSession(initialDestinations);

  let state = {
    settings: readSettings(),
    journeys: initialJourneyStore.journeys,
    activeJourneyId: initialJourneyStore.activeJourneyId,
    viewingJourneyId: initialJourneyStore.viewingJourneyId,
    location: initialSession.location,
    destinations: initialDestinations,
    selectedDestinationIndex: initialSession.selectedDestinationIndex,
    deletedWaypoints: initialWaypointStore.deletedCustom,
    ringVisible: false,
    viewport: { scale: 1, panX: 0, panY: 0 },
    activities: [],
  };
  let map3d = null;
  let mapZoomFrame = 0;
  let noteTarget = null;
  let renameTarget = null;
  let pendingBackup = null;
  let storageError = false;
  let modalNoteTarget = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    bindBackupActions();
    bindNoteDialog();
    arrangeMobilePanels();
    window.matchMedia("(max-width: 920px)").addEventListener("change", arrangeMobilePanels);
    applyTopPanelOrder();
    map3d = window.Pilgrim3D ? window.Pilgrim3D.create(els.starMap3d, { onZoom: handle3DZoom, onOrbitChange: syncOrbitControls }) : null;
    if (!map3d?.supported) {
      state.settings.mapView = "2d";
      els.mapViewToggle.disabled = true;
      els.mapViewToggle.title = "3D canvas is unavailable in this browser";
    }
    bindNavigation();
    bindActions();
    seedActivities();
    renderStars();
    syncSettingsForm();
    renderAll();
    startClock();
  }

  function cacheElements() {
    const selectors = [
      "locationInput", "locationParseStatus", "updateLocationButton", "drawRingButton", "copyLocationButton", "homeAddWaypointButton",
      "summaryGrid", "toggleTopPanelsButton", "toggleTopPanelsLabel",
      "galaxySummary", "hyperdriveSummary", "posValue", "destValue", "centerDistanceValue", "destinationDistanceValue", "locationState",
      "jumpsValue", "jumpRangeValue", "degreesValue", "directionValue", "warningText", "warningStrip", "advisoryState", "routeState",
      "angleTelemetry", "angleTelemetryState", "angleAttackValue", "angleAttackDirection", "angleTelemetryGraph", "angleVector", "angleArc", "angleTargetPoint", "angleTargetLabel", "angleGraphAngle", "angleReferenceText", "angleVerticalDelta",
      "compassBearing", "compassDial", "compassTicks", "shipPointer", "trueNorthMarker", "compassCardinal", "compassTargetName",
      "destinationSelect", "targetIndex", "targetAddress", "targetCoordinateVector", "targetLinearDistance", "targetHeightDiff", "pilgrimAddress", "pilgrimCoordinateVector",
      "guidanceText", "orientationInstructionText", "destinationList", "activityLog", "originJourneyPoints", "checkpointNoteBox", "checkpointNoteInput", "checkpointNoteStatus", "saveCheckpointNoteButton", "starMap", "starMap3d", "map3dHud", "mapGestureReadout", "mapViewToggle", "mapCanvasWrap", "mapStage", "starLayer", "galaxyGridLayer", "localGridLayer", "routeLayer",
      "ringLayer", "markerLayer", "zoomReadout", "mapCoordinateReadout", "mapStatusReadout", "mapFrameLabel", "mapProjectionLabel", "mapModeLabel", "mapFrameReadout", "localModeButton", "localModeLabel",
      "recenterButton", "resetSessionButton", "zoomInButton", "zoomOutButton", "resetMapButton", "snapUserButton", "nametagToggleButton", "nametagToggleLabel", "addMockButton", "restoreWaypointsButton", "directoryAddButton",
      "destinationDirectory", "directoryCount", "journeySaveStatus", "activeJourneyName", "activeJourneyStatus", "activeJourneyPointCount", "activeJourneyStart", "activeJourneyDestination", "journeyFocusLabel", "journeyTrailHint", "activeJourneyPoints", "journeyCount", "journeyList", "newJourneyButton", "journeyNewButton", "restoreJourneyButton", "completeJourneyButton",
      "hyperdriveInput", "galaxyInput", "gridSizeInput", "mapHeightInput", "saveSettingsButton",
      "clearSettingsButton", "settingsSaveState", "toast", "utcClock", "waypointDialog", "waypointForm", "waypointNameInput",
      "waypointCoordinateInput", "waypointError", "closeWaypointButton", "cancelWaypointButton", "journeyDialog", "journeyForm", "journeyNameInput", "journeyError", "closeJourneyButton", "cancelJourneyButton", "checkpointRenameDialog", "checkpointRenameForm", "checkpointNameInput", "checkpointRenameError", "closeCheckpointRenameButton", "cancelCheckpointRenameButton"
    ];
    selectors.forEach((id) => { els[id] = document.getElementById(id); });
  }

  function bindNavigation() {
    $$("[data-view]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.view));
    });
  }

  function switchView(viewName) {
    map3d?.setActive?.(viewName === "map" && is3DMap());
    $$("[data-view]").forEach((button) => {
      const active = button.dataset.view === viewName;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
    $$("[data-view-panel]").forEach((panel) => {
      const active = panel.dataset.viewPanel === viewName;
      panel.classList.toggle("is-visible", active);
      panel.hidden = !active;
    });
    if (viewName === "map" && is3DMap()) window.setTimeout(() => map3d.resize(), 0);
  }

  function bindActions() {
    els.updateLocationButton.addEventListener("click", updateLocation);
    els.locationInput.addEventListener("keydown", (event) => { if (event.key === "Enter") updateLocation(); });
    els.locationInput.addEventListener("input", () => {
      els.locationParseStatus.textContent = "EDITING";
      document.getElementById("locationError").textContent = "";
      syncHexInputStatus();
    });
    els.copyLocationButton.addEventListener("click", copyLocation);
    els.drawRingButton.addEventListener("click", toggleRing);
    els.homeAddWaypointButton.addEventListener("click", openWaypointDialog);
    els.toggleTopPanelsButton.addEventListener("click", toggleTopPanels);
    els.destinationSelect.addEventListener("change", () => {
      if (els.destinationSelect.value === "") clearDestination();
      else selectDestination(Number(els.destinationSelect.value));
    });
    els.recenterButton.addEventListener("click", recenterMap);
    els.resetSessionButton.addEventListener("click", resetSession);
    els.zoomInButton.addEventListener("click", () => {
      if (is3DMap()) map3d.zoom(-.18); else setZoom(state.viewport.scale + .08);
    });
    els.zoomOutButton.addEventListener("click", () => {
      if (is3DMap()) map3d.zoom(.18); else setZoom(state.viewport.scale - .08);
    });
    els.resetMapButton.addEventListener("click", resetMap);
    els.snapUserButton.addEventListener("click", snapToUser);
    els.nametagToggleButton.addEventListener("click", toggleNametags);
    els.mapViewToggle.addEventListener("click", toggleMapView);
    document.getElementById("orbitFocusSelect").addEventListener("change", (event) => {
      map3d?.setOrbitFocus(event.target.value);
    });
    document.getElementById("orbitToggleButton").addEventListener("click", () => {
      if (!is3DMap()) return;
      if (map3d.getOrbitState().running) map3d.pauseOrbit();
      else map3d.startOrbit();
    });
    els.localModeButton.addEventListener("click", toggleLocalMode);
    els.addMockButton.addEventListener("click", openWaypointDialog);
    els.restoreWaypointsButton.addEventListener("click", restoreWaypoints);
    els.directoryAddButton.addEventListener("click", openWaypointDialog);
    els.waypointForm.addEventListener("submit", (event) => { event.preventDefault(); saveWaypointFromForm(); });
    els.closeWaypointButton.addEventListener("click", closeWaypointDialog);
    els.cancelWaypointButton.addEventListener("click", closeWaypointDialog);
    els.waypointCoordinateInput.addEventListener("input", () => { els.waypointError.textContent = ""; });
    els.waypointDialog.addEventListener("click", (event) => { if (event.target === els.waypointDialog) closeWaypointDialog(); });
    els.newJourneyButton.addEventListener("click", openJourneyDialog);
    els.journeyNewButton.addEventListener("click", openJourneyDialog);
    els.restoreJourneyButton.addEventListener("click", () => restoreJourney());
    els.completeJourneyButton.addEventListener("click", completeJourney);
    els.journeyForm.addEventListener("submit", (event) => { event.preventDefault(); saveJourneyFromForm(); });
    els.saveCheckpointNoteButton.addEventListener("click", saveCheckpointNote);
    els.closeJourneyButton.addEventListener("click", closeJourneyDialog);
    els.cancelJourneyButton.addEventListener("click", closeJourneyDialog);
    els.journeyNameInput.addEventListener("input", () => { els.journeyError.textContent = ""; });
    els.journeyDialog.addEventListener("click", (event) => { if (event.target === els.journeyDialog) closeJourneyDialog(); });
    els.checkpointRenameForm.addEventListener("submit", (event) => { event.preventDefault(); saveCheckpointRename(); });
    els.closeCheckpointRenameButton.addEventListener("click", closeCheckpointRenameDialog);
    els.cancelCheckpointRenameButton.addEventListener("click", closeCheckpointRenameDialog);
    els.checkpointNameInput.addEventListener("input", () => { els.checkpointRenameError.textContent = ""; });
    els.checkpointRenameDialog.addEventListener("click", (event) => { if (event.target === els.checkpointRenameDialog) closeCheckpointRenameDialog(); });
    els.saveSettingsButton.addEventListener("click", saveSettings);
    els.clearSettingsButton.addEventListener("click", clearSettings);
    bindTopPanelDrag();
    bindMapGestures();
  }

  function applyTopPanelOrder() {
    if (!els.summaryGrid) return;
    const panels = new Map($$("[data-top-panel]", els.summaryGrid).map((panel) => [panel.dataset.topPanel, panel]));
    const order = Array.isArray(state.settings.topPanelOrder) ? state.settings.topPanelOrder : [...DEFAULT_SETTINGS.topPanelOrder];
    order.forEach((key) => {
      const panel = panels.get(key);
      if (panel) els.summaryGrid.appendChild(panel);
    });
    $$("[data-top-panel]", els.summaryGrid).forEach((panel, index) => {
      const label = $(".panel-label", panel);
      const title = panel.dataset.topPanelLabel;
      if (label && title) label.textContent = String(index + 1).padStart(2, "0") + " / " + title;
    });
  }

  function arrangeMobilePanels() {
    const compact = window.matchMedia("(max-width: 920px)").matches;
    const guidance = document.getElementById("advisoryPanel");
    const mapGrid = document.querySelector(".main-grid");
    const belowMap = document.getElementById("belowMapDetails");
    if (compact) belowMap.appendChild(guidance);
    else {
      els.summaryGrid.appendChild(guidance);
      applyTopPanelOrder();
    }
    document.getElementById("mapView").classList.toggle("compact-layout", compact);
    if (mapGrid && is3DMap()) map3d.resize();
  }

  function bindTopPanelDrag() {
    if (!els.summaryGrid) return;
    let draggedPanel = null;
    const clearDragState = () => {
      $$("[data-top-panel]", els.summaryGrid).forEach((panel) => panel.classList.remove("is-dragging", "is-drag-over"));
      draggedPanel = null;
    };

    $$('[data-top-panel]', els.summaryGrid).forEach((panel) => {
      const handle = $(".panel-drag-handle", panel);
      if (!handle) return;
      handle.addEventListener("dragstart", (event) => {
        draggedPanel = panel;
        panel.classList.add("is-dragging");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", panel.dataset.topPanel);
        }
      });
      handle.addEventListener("dragend", clearDragState);
      panel.addEventListener("dragover", (event) => {
        if (!draggedPanel || draggedPanel === panel) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        panel.classList.add("is-drag-over");
      });
      panel.addEventListener("dragleave", (event) => {
        if (!panel.contains(event.relatedTarget)) panel.classList.remove("is-drag-over");
      });
      panel.addEventListener("drop", (event) => {
        if (!draggedPanel || draggedPanel === panel) return;
        event.preventDefault();
        const rect = panel.getBoundingClientRect();
        const insertBefore = event.clientX < rect.left + rect.width / 2;
        if (insertBefore) els.summaryGrid.insertBefore(draggedPanel, panel);
        else els.summaryGrid.insertBefore(draggedPanel, panel.nextElementSibling);
        state.settings.topPanelOrder = $$('[data-top-panel]', els.summaryGrid).map((item) => item.dataset.topPanel);
        applyTopPanelOrder();
        writeSettings();
        clearDragState();
        showToast("Top menus reordered and saved.");
      });
    });
  }

  function syncTopPanels() {
    if (!els.summaryGrid || !els.toggleTopPanelsButton) return;
    const collapsed = Boolean(state.settings.topPanelsCollapsed);
    els.summaryGrid.hidden = collapsed;
    els.toggleTopPanelsButton.setAttribute("aria-expanded", String(!collapsed));
    els.toggleTopPanelsButton.setAttribute("aria-label", collapsed ? "Expand top menus" : "Collapse top menus");
    if (els.toggleTopPanelsLabel) els.toggleTopPanelsLabel.textContent = collapsed ? "Show top menus" : "Collapse top menus";
  }

  function toggleTopPanels() {
    state.settings.topPanelsCollapsed = !Boolean(state.settings.topPanelsCollapsed);
    syncTopPanels();
    writeSettings();
    showToast(state.settings.topPanelsCollapsed ? "Top menus collapsed." : "Top menus restored.");
  }

  function bindMapGestures() {
    let dragging = false;
    let start = { x: 0, y: 0, panX: 0, panY: 0 };
    els.mapCanvasWrap.addEventListener("pointerdown", (event) => {
      if (is3DMap()) return;
      dragging = true;
      start = { x: event.clientX, y: event.clientY, panX: state.viewport.panX, panY: state.viewport.panY };
      els.mapCanvasWrap.classList.add("is-dragging");
      els.mapCanvasWrap.setPointerCapture(event.pointerId);
    });
    els.mapCanvasWrap.addEventListener("pointermove", (event) => {
      if (is3DMap()) return;
      if (!dragging) return;
      const rect = els.starMap.getBoundingClientRect();
      const renderScale = Math.min(rect.width / MAP_VIEW.width, rect.height / MAP_VIEW.height) || 1;
      state.viewport.panX = start.panX + (event.clientX - start.x) / renderScale;
      state.viewport.panY = start.panY + (event.clientY - start.y) / renderScale;
      updateMapTransform(false);
    });
    const stopDragging = (event) => {
      if (!dragging) return;
      dragging = false;
      els.mapCanvasWrap.classList.remove("is-dragging");
      try { els.mapCanvasWrap.releasePointerCapture(event.pointerId); } catch (_) { /* already released */ }
    };
    els.mapCanvasWrap.addEventListener("pointerup", stopDragging);
    els.mapCanvasWrap.addEventListener("pointercancel", stopDragging);
    els.mapCanvasWrap.addEventListener("wheel", (event) => {
      if (is3DMap()) return;
      event.preventDefault();
      const wheelStep = Math.min(.075, Math.max(.025, Math.abs(event.deltaY) * .00045));
      setZoom(state.viewport.scale + (event.deltaY < 0 ? wheelStep : -wheelStep), event);
    }, { passive: false });
  }

  function renderAll() {
    const selectedIndex = Number.isInteger(state.selectedDestinationIndex) && state.destinations[state.selectedDestinationIndex]
      ? state.selectedDestinationIndex
      : null;
    state.selectedDestinationIndex = selectedIndex;
    const target = selectedIndex === null ? null : state.destinations[selectedIndex];
    const route = state.location && target
      ? math.calculateRoute(state.location.coords, target.coords, state.settings, GALAXY_CENTRE)
      : null;
    const viewedJourney = getJourney(state.viewingJourneyId);
    const mapTarget = viewedJourney ? viewedJourney.destination : target;
    const mapRoute = state.location && mapTarget
      ? math.calculateRoute(state.location.coords, mapTarget.coords, state.settings, GALAXY_CENTRE)
      : null;
    state.currentRoute = route;
    renderQuickStart(route, target);
    applyMapHeight();
    syncNametagToggle();
    syncSnapUserButton();
    syncRingButton();
    renderSummary(route, target);
    renderDestinationControls(route, target);
    renderMap(mapRoute, mapTarget, viewedJourney);
    render3DMap(route, target);
    renderActivities();
    renderDirectory();
    renderJourneys();
    updateMapTransform(false);
  }

  function renderSummary(route, target) {
    const hasDestination = Boolean(target);
    const hasRoute = Boolean(route && state.location && target);
    els.galaxySummary.textContent = `${state.settings.galaxy.toUpperCase()} ${galaxyNumber(state.settings.galaxy)}`;
    els.hyperdriveSummary.textContent = `${math.formatNumber(state.settings.hyperdrive, 0)} LY`;
    els.destValue.textContent = target?.name || "—";
    els.posValue.textContent = hasRoute ? `x:${state.location.coords.x}   y:${state.location.coords.y}   z:${state.location.coords.z}` : "—";
    els.centerDistanceValue.textContent = hasRoute ? math.formatNumber(route.centreDistance, 3) : "—";
    els.destinationDistanceValue.textContent = hasRoute ? math.formatNumber(route.destinationDistance, 3) : "—";
    els.jumpsValue.textContent = hasRoute ? route.estimatedJumps : "—";
    els.jumpRangeValue.textContent = `${math.formatNumber(state.settings.hyperdrive, 0)} LY`;
    els.degreesValue.textContent = hasRoute && route.hasPlanarBearing ? route.angle.toFixed(2) : "—";
    els.directionValue.textContent = hasRoute && route.hasPlanarBearing ? route.direction.toUpperCase() : "—";
    els.warningText.textContent = !hasDestination
      ? "Select a destination to calculate route guidance."
      : !state.location
        ? "Enter origin coordinates to calculate route guidance."
        : route.sameRegion
          ? arrivalText(target)
        : route.regionHeight === 0
          ? "No vertical region offset detected on this route"
          : `You are ${route.regionHeight} region(s) ${route.heightDirection} ${target.name}`;
    els.warningStrip.classList.toggle("is-clear", hasRoute && route.regionHeight === 0);
    els.advisoryState.textContent = route?.sameRegion ? (atDestination(target) ? "ARRIVED" : "SAME REGION") : hasDestination ? "DESTINATION LOCK" : "NO LOCK";
    els.advisoryState.classList.toggle("state-warn", false);
    els.advisoryState.classList.toggle("state-lock", hasDestination);
    els.advisoryState.classList.toggle("state-waiting", !hasDestination);
    els.advisoryState.classList.toggle("state-live", false);
    els.routeState.textContent = route?.sameRegion ? "0 REGION JUMPS" : hasRoute ? "ESTIMATE" : "WAITING";
    els.routeState.classList.toggle("state-live", hasRoute);
    els.routeState.classList.toggle("state-waiting", !hasRoute);
    if (document.activeElement !== els.locationInput) els.locationInput.value = state.location?.address || "";
    syncHexInputStatus();
    els.locationParseStatus.textContent = state.location ? "INPUT SYNCED" : "NO ORIGIN SAVED";
    els.locationState.textContent = state.location ? "READY" : "AWAITING ENTRY";
    els.locationState.classList.toggle("state-live", Boolean(state.location));
    els.locationState.classList.toggle("state-awaiting", !state.location);
    els.pilgrimAddress.textContent = PILGRIM_STAR.address;
    els.pilgrimCoordinateVector.textContent = `x:${PILGRIM_STAR.coords.x} · y:${PILGRIM_STAR.coords.y} · z:${PILGRIM_STAR.coords.z}`;
    els.orientationInstructionText.textContent = !hasDestination
      ? "Select a destination to receive centre-facing guidance."
      : !state.location
        ? "Enter origin coordinates to receive centre-facing guidance."
        : orientationInstruction(route);
    renderCompass(route, target);
    renderAngleTelemetry(route, target);
  }

  function atDestination(target) {
    return Boolean(target && state.location && state.location.address.toUpperCase() === target.address.toUpperCase());
  }

  function syncHexInputStatus() {
    const value = els.locationInput.value.trim();
    const indicator = document.getElementById("hexInputIndicator");
    let status = "empty";
    let label = "Awaiting hex input";
    if (value) {
      try {
        const parsed = math.parseLocation(value);
        status = "valid";
        label = parsed.format === "hex" ? "Hex address accepted" : "Decimal coordinates accepted";
      } catch (_) {
        status = "invalid";
        label = "Invalid hex input";
      }
    }
    indicator.classList.toggle("is-empty", status === "empty");
    indicator.classList.toggle("is-valid", status === "valid");
    indicator.classList.toggle("is-invalid", status === "invalid");
    document.getElementById("hexInputStatus").textContent = label;
    if (status === "invalid") els.locationInput.setAttribute("aria-invalid", "true");
    else els.locationInput.removeAttribute("aria-invalid");
  }

  function arrivalText(target) {
    return atDestination(target)
      ? "Arrived — your address matches the destination. 0 jumps remaining."
      : "Same region — 0 region jumps. Check the destination system address in-game.";
  }

  function renderQuickStart(route, target) {
    const originStep = document.getElementById("originStep");
    const targetStep = document.getElementById("targetStep");
    originStep.textContent = state.location ? "1 · Origin ready" : "1 · Enter your location";
    targetStep.textContent = target ? "2 · Destination selected" : "2 · Choose destination";
    originStep.classList.toggle("is-complete", Boolean(state.location));
    targetStep.classList.toggle("is-complete", Boolean(target));
    document.getElementById("guidanceStep").textContent = route ? "3 · Follow guidance below" : "3 · Follow guidance";
    document.getElementById("compactRouteSummary").textContent = route?.sameRegion
      ? arrivalText(target)
      : route ? `≈ ${route.estimatedJumps} jumps · ${math.formatNumber(route.destinationDistance, 0)} LY · ${orientationInstruction(route)}`
      : state.location ? "Choose a destination to see your route." : "Enter your signal-booster address to begin.";
  }

  function backupSnapshot() {
    const selected = state.destinations[state.selectedDestinationIndex];
    const present = new Set(state.destinations.filter(d => !d.userCreated).map(d => d.address));
    return {
      settings: { ...state.settings },
      session: { location: state.location, selectedDestinationIndex: state.selectedDestinationIndex, selectedDestinationAddress: selected?.address || "" },
      waypoints: {
        custom: state.destinations.filter(d => d.userCreated).map(snapshotWaypoint),
        deletedCustom: state.deletedWaypoints.filter(d => !state.destinations.some(p => p.address === d.address)).map(snapshotWaypoint),
        removedCommunity: COMMUNITY_DESTINATIONS.filter(d => !present.has(d.address)).map(d => d.address),
      },
      journeys: { journeys: state.journeys, activeJourneyId: state.activeJourneyId, viewingJourneyId: state.viewingJourneyId },
    };
  }

  function backupEntries(data) {
    return [
      [STORAGE_KEY, JSON.stringify(data.settings)],
      [SESSION_KEY, JSON.stringify(data.session)],
      [WAYPOINT_KEY, JSON.stringify(data.waypoints)],
      [JOURNEY_KEY, JSON.stringify(data.journeys)],
      [ORIGIN_CACHE_KEY, data.session.location ? JSON.stringify(data.session.location) : null],
    ];
  }

  function persistData() {
    let result;
    try { result = window.PilgrimBackup.commit(localStorage, backupEntries(backupSnapshot())); }
    catch (error) { result = { ok: false, error }; }
    storageError = !result.ok;
    const banner = document.getElementById("storageWarning");
    banner.hidden = !storageError;
    if (storageError) banner.textContent = "Changes are only in this tab: browser storage is unavailable or full. Export a backup in Config before closing. Try saving again after freeing space.";
    if (els.settingsSaveState) els.settingsSaveState.textContent = storageError ? "NOT SAVED · EXPORT A BACKUP" : "SAVED LOCALLY";
    return result.ok;
  }

  function bindBackupActions() {
    const input = document.getElementById("backupFileInput");
    const dialog = document.getElementById("backupImportDialog");
    const status = document.getElementById("backupStatus");
    document.getElementById("originStep").addEventListener("click", () => {
      state.settings.topPanelsCollapsed = false; syncTopPanels(); els.locationInput.focus();
    });
    document.getElementById("targetStep").addEventListener("click", () => {
      state.settings.topPanelsCollapsed = false; syncTopPanels(); els.destinationSelect.focus();
    });
    document.getElementById("exportBackupButton").addEventListener("click", () => {
      try {
        const json = window.PilgrimBackup.encode(backupSnapshot());
        const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url; link.download = `pilgrim-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link); link.click(); link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = "Backup download started. Keep this file somewhere safe.";
      } catch (error) { status.textContent = error.message; }
    });
    document.getElementById("importBackupButton").addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const file = input.files[0];
      input.value = "";
      pendingBackup = null;
      if (!file) return;
      try {
        if (file.size > window.PilgrimBackup.MAX_BYTES) throw new Error("Choose a backup smaller than 20 MB.");
        pendingBackup = window.PilgrimBackup.parse(await file.text());
        const journeys = pendingBackup.journeys.journeys;
        const checkpoints = journeys.reduce((count, journey) => count + journey.points.length, 0);
        document.getElementById("backupPreview").textContent = `${journeys.length} journey(s) · ${checkpoints} checkpoint(s) · ${pendingBackup.waypoints.custom.length} custom waypoint(s). Origin ${pendingBackup.session.location ? "included" : "empty"}. Settings and deleted waypoints are included. This replaces ${state.journeys.length} current journey(s) and your current saved settings and waypoints.`;
        dialog.showModal();
      } catch (error) { status.textContent = error.message; pendingBackup = null; }
    });
    document.getElementById("cancelBackupButton").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => { pendingBackup = null; });
    document.getElementById("confirmBackupButton").addEventListener("click", () => {
      if (!pendingBackup) return;
      let result;
      try { result = window.PilgrimBackup.commit(localStorage, backupEntries(pendingBackup)); }
      catch (error) { result = { ok: false, error }; }
      if (!result.ok) {
        dialog.close();
        status.textContent = result.rollbackFailed
          ? "Restore failed and browser storage could not be fully recovered. Keep your backup file and export the current tab before closing."
          : "Restore could not be saved. Existing data was kept. Check browser storage space and try again.";
        return;
      }
      const waypoints = readWaypointStore();
      const journeys = readJourneyStore();
      state.destinations = [...COMMUNITY_DESTINATIONS.filter(d => !waypoints.removedAddresses.includes(d.address)).map(cloneDestination), ...waypoints.custom];
      state.deletedWaypoints = waypoints.deletedCustom;
      Object.assign(state, journeys, readSession(state.destinations));
      state.settings = readSettings();
      state.ringVisible = false;
      noteTarget = null; renameTarget = null;
      storageError = false;
      document.getElementById("storageWarning").hidden = true;
      resetViewport(); arrangeMobilePanels(); applyTopPanelOrder(); syncSettingsForm(); renderAll();
      els.settingsSaveState.textContent = "SAVED LOCALLY";
      dialog.close();
      status.textContent = "Backup restored. Your journeys, waypoints and settings are ready.";
    });
    document.getElementById("retrySaveButton").addEventListener("click", () => {
      status.textContent = persistData() ? "All current data has been saved in this browser." : "Still unable to save. Export a backup before closing.";
    });
  }

  function orientationInstruction(route) {
    if (route.sameRegion) return "You are in the destination region. Check the system address in-game; no region bearing is needed.";
    if (!route.hasPlanarBearing) return "The target is directly above or below your region. Use the vertical guidance; no horizontal turn is needed.";
    return route.angle === 0
      ? "Looking at the center; the destination is straight ahead."
      : `Looking at the center, turn ${route.angle.toFixed(2)} degrees to your ${route.direction}.`;
  }

  function renderCompass(route, target) {
    els.shipPointer.hidden = Boolean(route && !route.hasPlanarBearing);
    if (!route || !route.hasPlanarBearing) {
      els.compassBearing.textContent = "—";
      els.compassCardinal.textContent = "GC NORTH · N —";
      els.compassTargetName.textContent = route?.sameRegion ? "DESTINATION REGION" : route ? "VERTICAL ROUTE" : target ? `TO ${target.name.toUpperCase()}` : "NO DESTINATION LOCK";
      els.shipPointer.style.transform = "translate(-50%, -50%) rotate(0deg)";
      els.trueNorthMarker.style.transform = "rotate(0deg)";
      els.compassDial.setAttribute("aria-label", route ? "No horizontal route bearing is needed." : target
        ? `Route compass waiting for origin coordinates to point toward ${target.name}.`
        : "Route compass waiting for a destination selection.");
      if (!els.compassTicks.childElementCount) {
        els.compassTicks.innerHTML = Array.from({ length: 36 }, (_, index) => {
          const angle = index * 10;
          const major = index % 3 === 0 ? " is-major" : "";
          return `<span class="dial-tick${major}" style="--tick-angle:${angle}deg"></span>`;
        }).join("");
      }
      return;
    }
    const bearing = route.galacticBearing ?? route.routeBearing;
    const trueNorthOffset = route.trueNorthOffset ?? 0;
    els.compassBearing.textContent = `${String(Math.round(bearing) % 360).padStart(3, "0")}°`;
    els.compassCardinal.textContent = `GC ${cardinalFromBearing(bearing)} · N ${String(Math.round(trueNorthOffset) % 360).padStart(3, "0")}°`;
    els.compassTargetName.textContent = `TO ${target.name.toUpperCase()}`;
    els.shipPointer.style.transform = `translate(-50%, -50%) rotate(${bearing}deg)`;
    els.trueNorthMarker.style.transform = `rotate(${trueNorthOffset}deg)`;
    els.compassDial.setAttribute("aria-label", `Route bearing ${bearing.toFixed(2)} degrees from galactic centre north, pointing ${cardinalFromBearing(bearing)}, to ${target.name}. True north is at ${trueNorthOffset.toFixed(2)} degrees.`);
    if (!els.compassTicks.childElementCount) {
      els.compassTicks.innerHTML = Array.from({ length: 36 }, (_, index) => {
        const angle = index * 10;
        const major = index % 3 === 0 ? " is-major" : "";
        return `<span class="dial-tick${major}" style="--tick-angle:${angle}deg"></span>`;
      }).join("");
    }
  }

  function renderAngleTelemetry(route, target) {
    const hasRoute = Boolean(route && state.location && target);
    els.angleTelemetryState.textContent = hasRoute ? "LIVE" : "AWAITING ROUTE";
    els.angleTelemetryState.classList.toggle("state-live", hasRoute);
    els.angleTelemetryState.classList.toggle("state-awaiting", !hasRoute);
    els.angleTelemetryState.classList.toggle("state-warn", false);
    els.angleTelemetryState.classList.toggle("state-lock", false);

    const visualParts = [els.angleVector, els.angleArc, els.angleTargetPoint, els.angleTargetLabel, els.angleGraphAngle];
    if (!hasRoute) {
      els.angleAttackValue.textContent = "—";
      els.angleAttackDirection.textContent = target ? "ENTER ORIGIN" : "SELECT DESTINATION";
      els.angleReferenceText.textContent = "GALACTIC PLANE = 0° · ROUTE REQUIRED";
      els.angleVerticalDelta.textContent = "—";
      els.angleTelemetryGraph.setAttribute("aria-label", "Target approach angle graph awaiting a complete route.");
      visualParts.forEach((part) => { part.style.display = "none"; });
      return;
    }

    const rawAngle = Number(route.angleOfAttack) || 0;
    const graphAngle = math.clamp(rawAngle, -89.5, 89.5);
    const angleRadians = (graphAngle * Math.PI) / 180;
    const originX = 180;
    const planeY = 72;
    const vectorLength = 111;
    const targetX = originX + Math.cos(angleRadians) * vectorLength;
    const targetY = planeY - Math.sin(angleRadians) * vectorLength;
    const arcRadius = 31;
    const arcX = originX + Math.cos(angleRadians) * arcRadius;
    const arcY = planeY - Math.sin(angleRadians) * arcRadius;
    const arcSweep = graphAngle >= 0 ? 0 : 1;
    const labelX = targetX >= originX ? targetX + 8 : targetX - 8;
    const labelY = math.clamp(targetY - 7, 17, 108);
    const anglePrefix = rawAngle > 0 ? "+" : "";
    const direction = rawAngle > 0.01
      ? "TARGET ABOVE PLANE"
      : rawAngle < -0.01
        ? "TARGET BELOW PLANE"
        : "TARGET ON PLANE";

    els.angleAttackValue.textContent = `${anglePrefix}${rawAngle.toFixed(2)}°`;
    els.angleAttackDirection.textContent = direction;
    els.angleReferenceText.textContent = "GALACTIC PLANE = 0° · GC REFERENCE FRAME";
    const verticalDelta = route.regionHeight === 0
      ? "ORIGIN / TARGET COPLANAR"
      : `${route.heightDirection === "above" ? "ORIGIN ABOVE TARGET" : "ORIGIN BELOW TARGET"} · ${route.regionHeight} REGIONS`;
    els.angleVerticalDelta.textContent = verticalDelta;
    els.angleTelemetryGraph.setAttribute("aria-label", `Target approach angle ${rawAngle.toFixed(2)} degrees from the galactic plane, ${direction.toLowerCase()}, for ${target.name}.`);

    els.angleVector.setAttribute("x1", String(originX));
    els.angleVector.setAttribute("y1", String(planeY));
    els.angleVector.setAttribute("x2", targetX.toFixed(2));
    els.angleVector.setAttribute("y2", targetY.toFixed(2));
    els.angleVector.classList.toggle("is-above", rawAngle > 0.01);
    els.angleVector.classList.toggle("is-below", rawAngle < -0.01);
    els.angleArc.setAttribute("d", Math.abs(graphAngle) > 0.05
      ? `M ${originX + arcRadius} ${planeY} A ${arcRadius} ${arcRadius} 0 0 ${arcSweep} ${arcX.toFixed(2)} ${arcY.toFixed(2)}`
      : "");
    els.angleArc.classList.toggle("is-above", rawAngle > 0.01);
    els.angleArc.classList.toggle("is-below", rawAngle < -0.01);
    els.angleTargetPoint.setAttribute("cx", targetX.toFixed(2));
    els.angleTargetPoint.setAttribute("cy", targetY.toFixed(2));
    els.angleTargetPoint.classList.toggle("is-above", rawAngle > 0.01);
    els.angleTargetPoint.classList.toggle("is-below", rawAngle < -0.01);
    els.angleTargetLabel.textContent = target.name.toUpperCase().slice(0, 28);
    els.angleTargetLabel.setAttribute("x", labelX.toFixed(2));
    els.angleTargetLabel.setAttribute("y", labelY.toFixed(2));
    els.angleTargetLabel.setAttribute("text-anchor", targetX >= originX ? "start" : "end");
    els.angleGraphAngle.textContent = `${anglePrefix}${rawAngle.toFixed(2)}°`;
    els.angleGraphAngle.setAttribute("x", (originX + (targetX >= originX ? 14 : -14)).toFixed(2));
    els.angleGraphAngle.setAttribute("y", math.clamp((planeY + targetY) / 2 - 4, 19, 108).toFixed(2));
    visualParts.forEach((part) => { part.style.display = ""; });
  }

  function cardinalFromBearing(bearing) {
    const points = ["NORTH", "NORTH-EAST", "EAST", "SOUTH-EAST", "SOUTH", "SOUTH-WEST", "WEST", "NORTH-WEST"];
    return points[Math.round(bearing / 45) % points.length];
  }

  function renderDestinationControls(route, target) {
    const hasDestination = Boolean(target);
    const hasRoute = Boolean(route && state.location && target);
    els.destinationSelect.innerHTML = [
      `<option value="">No destination selected</option>`,
      ...state.destinations.map((destination, index) => `<option value="${index}">${escapeHtml(destination.name)}</option>`),
    ].join("");
    els.destinationSelect.value = hasDestination ? String(state.selectedDestinationIndex) : "";
    els.targetIndex.textContent = hasDestination ? String(state.selectedDestinationIndex + 1).padStart(2, "0") : "—";
    els.targetAddress.textContent = target?.address || "—";
    els.targetCoordinateVector.textContent = target ? `x:${target.coords.x} · y:${target.coords.y} · z:${target.coords.z}` : "—";
    els.targetLinearDistance.textContent = hasRoute ? `${math.formatNumber(route.destinationDistance, 3)} LY` : "—";
    els.targetHeightDiff.textContent = hasRoute ? `${route.heightDirection === "above" ? "+" : "−"}${route.regionHeight} REGIONS` : "—";
    els.guidanceText.textContent = !hasDestination
      ? "Select a destination to calculate guidance."
      : !state.location
        ? "Enter origin coordinates to calculate guidance."
      : route.sameRegion
        ? arrivalText(target)
      : !route.hasPlanarBearing
        ? "The destination is directly above or below you. Follow the vertical guidance."
      : route.angle === 0
        ? "The destination is aligned with your current centre bearing."
        : `Looking at the centre, turn ${route.angle.toFixed(2)}° to your ${route.direction}.`;
    els.destinationList.innerHTML = state.destinations.map((destination, index) => {
      const itemRoute = state.location ? math.calculateRoute(state.location.coords, destination.coords, state.settings, GALAXY_CENTRE) : null;
      const permanentClass = destination.permanent ? " is-permanent" : "";
      return `<div class="destination-item-row">
        <button class="destination-item ${index === state.selectedDestinationIndex ? "is-active" : ""}${permanentClass}" data-destination-index="${index}">
          <i></i><div><strong>${escapeHtml(destination.name)}</strong><small>${escapeHtml(formatDestinationMeta(destination))}</small></div><em>${itemRoute ? itemRoute.estimatedJumps : "—"} J</em>
        </button>
        ${renderDeleteButton(destination, index, "destination-delete")}
      </div>`;
    }).join("");
    $$("[data-destination-index]", els.destinationList).forEach((button) => button.addEventListener("click", () => selectDestination(Number(button.dataset.destinationIndex))));
    $$("[data-delete-waypoint]", els.destinationList).forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteWaypoint(Number(button.dataset.deleteWaypoint));
    }));
    syncRestoreWaypointsButton();
  }

  function renderMap(route, target, journey = null) {
    if (!state.location || !target || !route) {
      renderMapWithoutRoute(target, journey);
      return;
    }
    const localMode = Boolean(state.settings.localMode);
    const showNametags = state.settings.showNametags !== false;
    const positions = mapPositions(state.location.coords, target.coords);
    const centre = positions.centre;
    const user = localMode && !positions.userInFrame
      ? clampMapPoint(positions.user, 18, MAP_VIEW.width - 18, 18, MAP_VIEW.height - 18)
      : positions.user;
    const destination = positions.destination;
    const journeyPoints = getJourneyMapPoints(journey, target.coords);
    const journeyTrace = renderJourneyTrace(journeyPoints);
    const hasJourneyTrail = journeyPoints.length > 0;
    const userIsOffFrame = localMode && !positions.userInFrame;
    const pilgrim = getPilgrimDestination();
    const pilgrimAnchor = pilgrim ? mapPointForCoords(pilgrim.coords, target.coords) : null;
    const pilgrimSharesPosition = Boolean(pilgrimAnchor && sameCoords(pilgrim.coords, target.coords));
    // Keep the Pilgrim marker at its true coordinates. When a selected target
    // shares that position, the destination marker is rendered later and wins.
    const rawPilgrimPoint = pilgrimAnchor;
    const pilgrimInFrame = Boolean(rawPilgrimPoint && rawPilgrimPoint.x >= 0 && rawPilgrimPoint.x <= MAP_VIEW.width && rawPilgrimPoint.y >= 0 && rawPilgrimPoint.y <= MAP_VIEW.height);
    const pilgrimPoint = rawPilgrimPoint && localMode && !pilgrimInFrame
      ? clampMapPoint(rawPilgrimPoint, 26, MAP_VIEW.width - 26, 26, MAP_VIEW.height - 26)
      : rawPilgrimPoint;
    const pilgrimIsOffFrame = Boolean(localMode && !pilgrimInFrame);
    const pilgrimLabel = showNametags
      ? renderMapLabel(`marker-label pilgrim-label${pilgrimIsOffFrame ? " off-frame-label" : ""}`, pilgrimPoint.x + 12, pilgrimPoint.y - 10, `Pilgrim Star${pilgrimIsOffFrame ? " · outside frame" : ""}`)
      : "";
    const pilgrimMarker = pilgrimPoint ? `
      <g class="map-marker map-marker-pilgrim${pilgrimSharesPosition ? " is-overlapped" : ""}" data-map-marker="pilgrim">
        <circle class="marker-halo" cx="${pilgrimPoint.x}" cy="${pilgrimPoint.y}" r="13" stroke="#64e8ff" />
        <path class="marker-pilgrim-star" d="M${pilgrimPoint.x} ${pilgrimPoint.y - 9}L${pilgrimPoint.x + 2.6} ${pilgrimPoint.y - 2.8}L${pilgrimPoint.x + 9} ${pilgrimPoint.y - 2.1}L${pilgrimPoint.x + 4.2} ${pilgrimPoint.y + 2.2}L${pilgrimPoint.x + 5.7} ${pilgrimPoint.y + 8.8}L${pilgrimPoint.x} ${pilgrimPoint.y + 5.4}L${pilgrimPoint.x - 5.7} ${pilgrimPoint.y + 8.8}L${pilgrimPoint.x - 4.2} ${pilgrimPoint.y + 2.2}L${pilgrimPoint.x - 9} ${pilgrimPoint.y - 2.1}L${pilgrimPoint.x - 2.6} ${pilgrimPoint.y - 2.8}Z" />
        ${pilgrimLabel}
      </g>` : "";
    const centreRoute = localMode ? "" : `
      <line class="route-line center-route" x1="${user.x}" y1="${user.y}" x2="${centre.x}" y2="${centre.y}" />
      <path class="route-line center-route" d="M${destination.x} ${destination.y} Q ${(destination.x + centre.x) / 2} ${(destination.y + centre.y) / 2 - 85} ${centre.x} ${centre.y}" opacity=".27" />`;
    const centreMarker = localMode ? "" : `
      <g class="map-marker" data-map-marker="centre">
        <circle class="marker-halo" cx="${centre.x}" cy="${centre.y}" r="11" stroke="${getComputedStyle(document.documentElement).getPropertyValue("--violet")}" />
        <circle class="marker-center" cx="${centre.x}" cy="${centre.y}" r="4.8" />
        ${showNametags ? renderMapLabel("marker-label", centre.x + 10, centre.y + 4, "Galaxy Center") : ""}
      </g>`;
    const ring = math.calculateBlackHoleRing(state.location.coords, state.settings);
    const ringRadius = Math.max(22, Math.min(125, ring.radius / 2.9));
    const ringLabel = showNametags
      ? renderMapLabel("marker-label subtle", user.x + ringRadius + 12, user.y - ringRadius + 2, `B.HOLE RING · ${math.formatNumber(ring.suggestedJump, 0)} LY`)
      : "";
    const userLabel = showNametags
      ? renderMapLabel(`marker-label${userIsOffFrame ? " off-frame-label" : ""}`, user.x + 10, user.y - 8, userIsOffFrame ? "User · outside local frame" : "User location")
      : "";
    const destinationLabel = showNametags
      ? renderMapLabel("marker-label", destination.x + 10, destination.y + 17, escapeHtml(target.name))
      : "";
    els.mapCanvasWrap.classList.toggle("is-local-mode", localMode);
    els.galaxyGridLayer.classList.toggle("is-hidden", localMode);
    els.localGridLayer.innerHTML = localMode ? renderLocalGrid(positions) : "";
    els.routeLayer.innerHTML = `${journeyTrace}
      <line class="route-line glow${userIsOffFrame ? " off-frame-route" : ""}" x1="${user.x}" y1="${user.y}" x2="${destination.x}" y2="${destination.y}" />
      <line class="route-line${userIsOffFrame ? " off-frame-route" : ""}" x1="${user.x}" y1="${user.y}" x2="${destination.x}" y2="${destination.y}" />${centreRoute}`;
    els.ringLayer.innerHTML = state.ringVisible ? `
      <circle class="ring-glow" cx="${user.x}" cy="${user.y}" r="${ringRadius}" />
      <circle class="ring" cx="${user.x}" cy="${user.y}" r="${ringRadius}" />
      ${ringLabel}` : "";
    els.markerLayer.innerHTML = `
      ${centreMarker}
      ${pilgrimMarker}
      <g class="map-marker" data-map-marker="user">
        <circle class="marker-halo" cx="${user.x}" cy="${user.y}" r="10" stroke="#41dca6" />
        <circle class="marker-user" cx="${user.x}" cy="${user.y}" r="4.4" />
        ${userLabel}
      </g>
      <g class="map-marker" data-map-marker="destination">
        <circle class="marker-halo" cx="${destination.x}" cy="${destination.y}" r="10" stroke="${getComputedStyle(document.documentElement).getPropertyValue("--amber")}" />
        <circle class="marker-target" cx="${destination.x}" cy="${destination.y}" r="4.4" />
        ${destinationLabel}
      </g>`;
    els.mapFrameLabel.textContent = localMode ? "LOCAL NAVIGATION FRAME" : "GALACTIC REFERENCE FRAME";
    els.mapProjectionLabel.textContent = localMode ? "local radar" : "galactic projection";
    els.mapModeLabel.textContent = localMode ? "LOCAL MODE" : "STAR MAP";
    els.localModeLabel.textContent = localMode ? "Set star map" : "Set local mode";
    els.localModeButton.setAttribute("aria-pressed", String(localMode));
    els.mapFrameReadout.textContent = localMode
      ? `LOCAL FRAME · ${positions.localRange}×${positions.localRange} REGIONS`
      : "FULL GALACTIC FRAME · 0–4096";
    els.mapCoordinateReadout.textContent = localMode ? `TARGET ${target.address}` : `ORIGIN ${state.location.address}`;
    const mapStatus = localMode
      ? `LOCAL ${positions.localRange}×${positions.localRange} · ${userIsOffFrame ? "SHIP OUT OF RANGE" : "1 CELL / REGION"}${state.ringVisible ? " · RING ACTIVE" : ""}`
      : (state.ringVisible ? "RING ACTIVE" : "RING OFF");
    els.mapStatusReadout.textContent = hasJourneyTrail
      ? `${journey.status === "completed" ? "ROUTE RESTORED" : "JOURNEY RESUMED"} · ${mapStatus}`
      : mapStatus;
    els.mapGestureReadout.textContent = "DRAG TO PAN · SMOOTH SCROLL ZOOM";
  }

  function renderMapWithoutRoute(target, journey = null) {
    const hasOrigin = Boolean(state.location);
    const hasDestination = Boolean(target);
    const showNametags = state.settings.showNametags !== false;
    // Local mode needs a target anchor. Until both ends of the route exist,
    // keep the 2D view in the full galactic frame instead of inventing one.
    const localMode = Boolean(state.settings.localMode && hasDestination);
    const localRange = math.clamp(Number(state.settings.gridSize) || 16, 8, 64);
    const positions = hasOrigin && hasDestination
      ? mapPositions(state.location.coords, target.coords)
      : {
        localRange,
        pixelsPerRegionX: MAP_VIEW.width / localRange,
        pixelsPerRegionY: MAP_VIEW.height / localRange,
      };
    const centre = { x: MAP_VIEW.width / 2, y: MAP_VIEW.height / 2 };
    const rawUser = hasOrigin
      ? (positions.user || mapPointForCoords(state.location.coords, target?.coords))
      : null;
    const rawDestination = hasDestination
      ? (positions.destination || mapPointForCoords(target.coords, target.coords))
      : null;
    const userInFrame = Boolean(rawUser && (!localMode || (
      rawUser.x >= 0 && rawUser.x <= MAP_VIEW.width && rawUser.y >= 0 && rawUser.y <= MAP_VIEW.height
    )));
    const user = rawUser && localMode && !userInFrame
      ? clampMapPoint(rawUser, 18, MAP_VIEW.width - 18, 18, MAP_VIEW.height - 18)
      : rawUser;
    const userIsOffFrame = Boolean(localMode && rawUser && !userInFrame);
    const destination = rawDestination;
    const journeyPoints = getJourneyMapPoints(journey, target?.coords);
    const journeyTrace = renderJourneyTrace(journeyPoints);
    const hasJourneyTrail = journeyPoints.length > 0;
    const pilgrim = getPilgrimDestination();
    const rawPilgrimPoint = pilgrim ? mapPointForCoords(pilgrim.coords, target?.coords) : null;
    const pilgrimSharesPosition = Boolean(hasDestination && rawPilgrimPoint && sameCoords(pilgrim.coords, target.coords));
    const pilgrimInFrame = Boolean(rawPilgrimPoint && rawPilgrimPoint.x >= 0 && rawPilgrimPoint.x <= MAP_VIEW.width && rawPilgrimPoint.y >= 0 && rawPilgrimPoint.y <= MAP_VIEW.height);
    const pilgrimPoint = rawPilgrimPoint && localMode && !pilgrimInFrame
      ? clampMapPoint(rawPilgrimPoint, 26, MAP_VIEW.width - 26, 26, MAP_VIEW.height - 26)
      : rawPilgrimPoint;
    const pilgrimIsOffFrame = Boolean(localMode && !pilgrimInFrame);
    const pilgrimLabel = showNametags && pilgrimPoint
      ? renderMapLabel(`marker-label pilgrim-label${pilgrimIsOffFrame ? " off-frame-label" : ""}`, pilgrimPoint.x + 12, pilgrimPoint.y - 10, `Pilgrim Star${pilgrimIsOffFrame ? " · outside frame" : ""}`)
      : "";
    const pilgrimMarker = pilgrimPoint ? `
      <g class="map-marker map-marker-pilgrim${pilgrimSharesPosition ? " is-overlapped" : ""}" data-map-marker="pilgrim">
        <circle class="marker-halo" cx="${pilgrimPoint.x}" cy="${pilgrimPoint.y}" r="13" stroke="#64e8ff" />
        <path class="marker-pilgrim-star" d="M${pilgrimPoint.x} ${pilgrimPoint.y - 9}L${pilgrimPoint.x + 2.6} ${pilgrimPoint.y - 2.8}L${pilgrimPoint.x + 9} ${pilgrimPoint.y - 2.1}L${pilgrimPoint.x + 4.2} ${pilgrimPoint.y + 2.2}L${pilgrimPoint.x + 5.7} ${pilgrimPoint.y + 8.8}L${pilgrimPoint.x} ${pilgrimPoint.y + 5.4}L${pilgrimPoint.x - 5.7} ${pilgrimPoint.y + 8.8}L${pilgrimPoint.x - 4.2} ${pilgrimPoint.y + 2.2}L${pilgrimPoint.x - 9} ${pilgrimPoint.y - 2.1}L${pilgrimPoint.x - 2.6} ${pilgrimPoint.y - 2.8}Z" />
        ${pilgrimLabel}
      </g>` : "";
    const centreMarker = localMode ? "" : `
      <g class="map-marker" data-map-marker="centre">
        <circle class="marker-halo" cx="${centre.x}" cy="${centre.y}" r="11" stroke="${getComputedStyle(document.documentElement).getPropertyValue("--violet")}" />
        <circle class="marker-center" cx="${centre.x}" cy="${centre.y}" r="4.8" />
        ${showNametags ? renderMapLabel("marker-label", centre.x + 10, centre.y + 4, "Galaxy Center") : ""}
      </g>`;
    els.mapCanvasWrap.classList.toggle("is-local-mode", localMode);
    els.galaxyGridLayer.classList.toggle("is-hidden", localMode);
    els.localGridLayer.innerHTML = localMode ? renderLocalGrid(positions) : "";
    els.routeLayer.innerHTML = journeyTrace;
    const ring = hasOrigin ? math.calculateBlackHoleRing(state.location.coords, state.settings) : null;
    const ringRadius = ring ? Math.max(22, Math.min(125, ring.radius / 2.9)) : 0;
    const ringLabel = showNametags && user && ring
      ? renderMapLabel("marker-label subtle", user.x + ringRadius + 12, user.y - ringRadius + 2, `B.HOLE RING · ${math.formatNumber(ring.suggestedJump, 0)} LY`)
      : "";
    const userLabel = showNametags && user
      ? renderMapLabel(`marker-label${userIsOffFrame ? " off-frame-label" : ""}`, user.x + 10, user.y - 8, userIsOffFrame ? "User · outside local frame" : "User location")
      : "";
    const destinationLabel = showNametags && destination && target
      ? renderMapLabel("marker-label", destination.x + 10, destination.y + 17, escapeHtml(target.name))
      : "";
    els.ringLayer.innerHTML = state.ringVisible && user ? `
      <circle class="ring-glow" cx="${user.x}" cy="${user.y}" r="${ringRadius}" />
      <circle class="ring" cx="${user.x}" cy="${user.y}" r="${ringRadius}" />
      ${ringLabel}` : "";
    els.markerLayer.innerHTML = `
      ${centreMarker}
      ${pilgrimMarker}
      ${user ? `<g class="map-marker" data-map-marker="user">
        <circle class="marker-halo" cx="${user.x}" cy="${user.y}" r="10" stroke="#41dca6" />
        <circle class="marker-user" cx="${user.x}" cy="${user.y}" r="4.4" />
        ${userLabel}
      </g>` : ""}
      ${destination && target ? `<g class="map-marker" data-map-marker="destination">
        <circle class="marker-halo" cx="${destination.x}" cy="${destination.y}" r="10" stroke="${getComputedStyle(document.documentElement).getPropertyValue("--amber")}" />
        <circle class="marker-target" cx="${destination.x}" cy="${destination.y}" r="4.4" />
        ${destinationLabel}
      </g>` : ""}`;
    els.mapFrameLabel.textContent = localMode ? "LOCAL NAVIGATION FRAME" : "GALACTIC REFERENCE FRAME";
    els.mapProjectionLabel.textContent = localMode ? "local radar" : "galactic projection";
    els.mapModeLabel.textContent = localMode ? "LOCAL MODE" : "STAR MAP";
    els.localModeLabel.textContent = localMode ? "Set star map" : "Set local mode";
    els.localModeButton.setAttribute("aria-pressed", String(localMode));
    els.mapFrameReadout.textContent = localMode
      ? `LOCAL FRAME · ${localRange}×${localRange} REGIONS`
      : "FULL GALACTIC FRAME · 0–4096";
    els.mapCoordinateReadout.textContent = localMode
      ? `TARGET ${target.address}`
      : hasOrigin
        ? `ORIGIN ${state.location.address}`
        : hasDestination
          ? `TARGET ${target.address}`
          : "ORIGIN NOT SET";
    const mapStatus = hasDestination
      ? `ORIGIN REQUIRED${state.ringVisible && hasOrigin ? " · RING ACTIVE" : ""}`
      : "DESTINATION REQUIRED";
    els.mapStatusReadout.textContent = hasJourneyTrail
      ? `${journey.status === "completed" ? "ROUTE RESTORED" : "JOURNEY RESUMED"} · ${hasDestination ? mapStatus : "TRAIL LOADED · DESTINATION NOT SAVED"}`
      : mapStatus;
    els.mapGestureReadout.textContent = "DRAG TO PAN · SMOOTH SCROLL ZOOM";
  }

  function render3DMap(route, target) {
    const active = is3DMap();
    document.getElementById("orbitControls").hidden = !active;
    map3d?.setActive?.(active && !document.querySelector('[data-view-panel="map"]').hidden);
    els.mapCanvasWrap.classList.toggle("is-3d-mode", active);
    els.starMap.style.display = active ? "none" : "";
    els.starMap3d.style.display = active ? "block" : "none";
    els.map3dHud.hidden = !active;
    els.mapViewToggle.classList.toggle("is-active", active);
    els.mapViewToggle.textContent = active ? "3D" : "2D";
    els.mapViewToggle.setAttribute("aria-pressed", String(active));
    els.mapViewToggle.setAttribute("aria-label", active ? "3D map active; switch to 2D" : "2D map active; switch to 3D");
    els.mapViewToggle.title = active ? "3D map active · click for 2D" : "2D map active · click for 3D";
    if (!active) return;

    const viewedJourney = getJourney(state.viewingJourneyId);
    const journeyPoints = viewedJourney ? viewedJourney.points.map((point) => point.coords) : [];
    const journeyReplay = Boolean(viewedJourney && journeyPoints.length);
    const sceneDestination = viewedJourney ? viewedJourney.destination : target || null;
    const hasDestination = Boolean(sceneDestination);
    const localMode = Boolean(state.settings.localMode && hasDestination);
    const localRange = math.clamp(Number(state.settings.gridSize) || 16, 8, 64);
    const hasOrigin = Boolean(state.location);
    const ring = hasOrigin ? math.calculateBlackHoleRing(state.location.coords, state.settings) : { radius: 0 };
    const sceneTarget = sceneDestination?.coords || GALAXY_CENTRE;
    const sceneTargetName = sceneDestination?.name || (journeyReplay ? "ROUTE END" : "NO DESTINATION");
    const sceneTargetAddress = sceneDestination?.address || "";
    const pilgrimDestination = getPilgrimDestination();
    const pilgrimOverlaps = hasDestination && sameCoords(sceneTarget, pilgrimDestination.coords);
    const pilgrimScene = {
      coords: pilgrimDestination.coords,
      name: pilgrimDestination.name,
      opacity: pilgrimOverlaps ? 0.16 : 1,
    };
    const positions = hasOrigin
      ? (localMode
        ? localMapPositions(state.location.coords, sceneTarget)
        : galaxyMapPositions(state.location.coords, sceneTarget))
      : { userInFrame: false };
    els.mapFrameLabel.textContent = localMode ? "LOCAL 3D ORBIT MAP" : "3D ORBIT MAP";
    els.mapProjectionLabel.textContent = localMode ? "local orbit view" : "perspective orbit view";
    els.mapModeLabel.textContent = localMode ? "LOCAL 3D" : "3D MODE";
    els.mapFrameReadout.textContent = localMode
      ? `LOCAL ORBIT MAP · ${localRange}×${localRange} REGIONS`
      : "FULL GALACTIC FRAME · 0–4096";
    els.mapGestureReadout.textContent = "DRAG TO ORBIT · SHIFT+DRAG TO PAN · SMOOTH SCROLL ZOOM";
    els.mapCoordinateReadout.textContent = localMode
      ? `TARGET ${sceneTargetAddress}`
      : hasOrigin
        ? `ORIGIN ${state.location.address}`
        : hasDestination
          ? `TARGET ${sceneTargetAddress}`
          : "ORIGIN NOT SET";
    const routeStatus = !hasDestination
      ? (journeyReplay ? "TRAIL ONLY · DESTINATION NOT SAVED" : "3D DESTINATION REQUIRED")
      : !hasOrigin
        ? (localMode ? "3D LOCAL · ORIGIN REQUIRED" : "3D ORIGIN REQUIRED")
      : localMode
        ? `3D LOCAL · ${positions.userInFrame ? "SHIP IN RANGE" : "SHIP OUT OF RANGE"}${state.ringVisible ? " · RING ACTIVE" : ""}`
        : (state.ringVisible ? "RING ACTIVE" : "RING OFF");
    els.mapStatusReadout.textContent = journeyReplay
      ? `${viewedJourney.status === "completed" ? "ROUTE RESTORED" : "JOURNEY RESUMED"} · ${routeStatus}`
      : routeStatus;
    map3d.setScene({
      localMode,
      localRange,
      centre: GALAXY_CENTRE,
      originReady: hasOrigin,
      user: hasOrigin ? state.location.coords : null,
      target: sceneTarget,
      targetName: sceneTargetName,
      targetReady: hasDestination,
      showNametags: state.settings.showNametags !== false,
      userInFrame: hasOrigin && positions.userInFrame,
      ringVisible: hasOrigin && state.ringVisible,
      ringRadius: ring.radius,
      journeyName: viewedJourney?.name || "",
      journeyPoints,
      pilgrim: pilgrimScene,
    });
    // Redrawing the scene must not change the user's orbit, pan, or zoom.
    // Camera reset is reserved for the dedicated Reset Map control.
    map3d.resize();
    const camera = map3d.getCamera();
    els.zoomReadout.textContent = `ORBIT ${Math.round((DEFAULT_3D_DISTANCE / camera.distance) * 100)}%`;
  }

  function mapPositions(userCoords, targetCoords) {
    return state.settings.localMode
      ? localMapPositions(userCoords, targetCoords)
      : galaxyMapPositions(userCoords, targetCoords);
  }

  function getPilgrimDestination() {
    return PILGRIM_STAR;
  }

  function getJourneyMapPoints(journey, targetCoords) {
    if (!journey?.points?.length) return [];
    return journey.points
      .map((point) => mapPointForCoords(point.coords, targetCoords))
      .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y));
  }

  function renderJourneyTrace(points) {
    if (!points.length) return "";
    const pointString = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
    const traceLines = points.length > 1 ? `
      <polyline class="journey-trace-glow" points="${pointString}" />
      <polyline class="journey-trace" points="${pointString}" />` : "";
    const checkpointDots = points.map((point, index) => `
      <circle class="journey-checkpoint${index === 0 ? " is-start" : ""}${index === points.length - 1 ? " is-end" : ""}" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${index === 0 ? "5.2" : "3.4"}" />`).join("");
    return `<g class="journey-trace-layer" aria-hidden="true">${traceLines}${checkpointDots}</g>`;
  }

  function mapPointForCoords(coords, targetCoords) {
    const localMode = Boolean(state.settings.localMode && targetCoords);
    if (localMode) {
      const localRange = math.clamp(Number(state.settings.gridSize) || 16, 8, 64);
      return {
        x: MAP_VIEW.width / 2 + (coords.x - targetCoords.x) * (MAP_VIEW.width / localRange),
        y: MAP_VIEW.height / 2 + (coords.z - targetCoords.z) * (MAP_VIEW.height / localRange),
      };
    }
    const mapX = (value) => MAP_VIEW.pad + (math.clamp(value, 0, MAP_VIEW.fullMax) / MAP_VIEW.fullMax) * (MAP_VIEW.width - MAP_VIEW.pad * 2);
    const mapY = (value) => MAP_VIEW.pad + (math.clamp(value, 0, MAP_VIEW.fullMax) / MAP_VIEW.fullMax) * (MAP_VIEW.height - MAP_VIEW.pad * 2);
    return { x: mapX(coords.x), y: mapY(coords.z) };
  }

  function galaxyMapPositions(userCoords, targetCoords) {
    // Keep a fixed 0–4096 galactic frame so the centre never drifts to an edge.
    const mapX = (value) => MAP_VIEW.pad + (math.clamp(value, 0, MAP_VIEW.fullMax) / MAP_VIEW.fullMax) * (MAP_VIEW.width - MAP_VIEW.pad * 2);
    // +Z runs down the reference frame, matching the axis indicator.
    const mapY = (value) => MAP_VIEW.pad + (math.clamp(value, 0, MAP_VIEW.fullMax) / MAP_VIEW.fullMax) * (MAP_VIEW.height - MAP_VIEW.pad * 2);
    return {
      mode: "galaxy",
      centre: { x: MAP_VIEW.width / 2, y: MAP_VIEW.height / 2 },
      user: { x: mapX(userCoords.x), y: mapY(userCoords.z) },
      destination: { x: mapX(targetCoords.x), y: mapY(targetCoords.z) },
      userInFrame: true,
    };
  }

  function localMapPositions(userCoords, targetCoords) {
    const localRange = math.clamp(Number(state.settings.gridSize) || 16, 8, 64);
    const pixelsPerRegionX = MAP_VIEW.width / localRange;
    const pixelsPerRegionY = MAP_VIEW.height / localRange;
    const mapX = (value) => MAP_VIEW.width / 2 + (value - targetCoords.x) * pixelsPerRegionX;
    const mapY = (value) => MAP_VIEW.height / 2 + (value - targetCoords.z) * pixelsPerRegionY;
    const user = { x: mapX(userCoords.x), y: mapY(userCoords.z) };
    return {
      mode: "local",
      localRange,
      pixelsPerRegionX,
      pixelsPerRegionY,
      centre: { x: MAP_VIEW.width / 2, y: MAP_VIEW.height / 2 },
      user,
      destination: { x: MAP_VIEW.width / 2, y: MAP_VIEW.height / 2 },
      userInFrame: user.x >= 0 && user.x <= MAP_VIEW.width && user.y >= 0 && user.y <= MAP_VIEW.height,
    };
  }

  function renderLocalGrid(positions) {
    const halfRange = positions.localRange / 2;
    const vertical = [];
    const horizontal = [];
    for (let offset = Math.ceil(-halfRange); offset <= Math.floor(halfRange); offset += 1) {
      const x = MAP_VIEW.width / 2 + offset * positions.pixelsPerRegionX;
      const y = MAP_VIEW.height / 2 + offset * positions.pixelsPerRegionY;
      const major = offset === 0 || offset % 4 === 0 ? " local-grid-major" : "";
      if (x >= 0 && x <= MAP_VIEW.width) vertical.push(`<line class="local-grid-line${major}" x1="${x}" y1="0" x2="${x}" y2="${MAP_VIEW.height}" />`);
      if (y >= 0 && y <= MAP_VIEW.height) horizontal.push(`<line class="local-grid-line${major}" x1="0" y1="${y}" x2="${MAP_VIEW.width}" y2="${y}" />`);
    }
    return `<rect class="local-grid-frame" x="1" y="1" width="${MAP_VIEW.width - 2}" height="${MAP_VIEW.height - 2}" />
      ${vertical.join("")}${horizontal.join("")}
      <text class="local-grid-caption" x="18" y="${MAP_VIEW.height - 18}">1 CELL = 1 REGION · TARGET CENTRED</text>`;
  }

  function clampMapPoint(point, minX, maxX, minY, maxY) {
    return { x: math.clamp(point.x, minX, maxX), y: math.clamp(point.y, minY, maxY) };
  }

  function renderStars() {
    let seed = 76103;
    const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const stars = [];
    for (let i = 0; i < 125; i += 1) {
      const x = Math.round(random() * 980 + 10);
      const y = Math.round(random() * 540 + 10);
      const radius = (random() * 1.45 + .35).toFixed(2);
      const opacity = (random() * .58 + .2).toFixed(2);
      const tone = random() > .84 ? "violet" : (random() > .93 ? "warm" : "");
      stars.push(`<circle class="star ${tone}" cx="${x}" cy="${y}" r="${radius}" opacity="${opacity}" />`);
      if (i % 19 === 0) stars.push(`<path d="M${x - 5} ${y}h10M${x} ${y - 5}v10" stroke="#9fd8ff" stroke-opacity=".25" stroke-width=".6" />`);
    }
    els.starLayer.innerHTML = stars.join("");
  }

  function updateLocation() {
    try {
      const parsed = math.parseLocation(els.locationInput.value);
      document.getElementById("locationError").textContent = "";
      els.locationInput.removeAttribute("aria-invalid");
      state.location = { address: parsed.address, coords: { x: parsed.x, y: parsed.y, z: parsed.z }, planet: parsed.planet };
      resetViewport();
      recordJourneyLocation(parsed);
      saveSession();
      logActivity(`Origin updated to ${parsed.address}`);
      showToast("Origin coordinates updated.");
      renderAll();
    } catch (error) {
      els.locationParseStatus.textContent = "CHECK INPUT";
      syncHexInputStatus();
      document.getElementById("locationError").textContent = error.message;
      els.locationInput.setAttribute("aria-invalid", "true");
      showToast(error.message, true);
    }
  }

  async function copyLocation() {
    if (!state.location) {
      showToast("No origin coordinates are saved.", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(state.location.address);
      showToast("Origin address copied to clipboard.");
    } catch (_) {
      showToast("Clipboard access is unavailable in this browser.", true);
    }
  }

  function toggleRing() {
    if (!state.location) {
      showToast("Enter origin coordinates before drawing a black-hole ring.", true);
      return;
    }
    state.ringVisible = !state.ringVisible;
    syncRingButton();
    logActivity(state.ringVisible ? "Black-hole ring visualised" : "Black-hole ring hidden");
    renderAll();
    showToast(state.ringVisible ? "Illustrative reference ring shown. It does not predict a black-hole exit." : "Reference ring hidden.");
  }

  function syncRingButton() {
    els.drawRingButton.innerHTML = state.ringVisible
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3"/><path d="m18 6 2-2M6 18l-2 2"/></svg> Hide reference ring`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3"/><path d="m18 6 2-2M6 18l-2 2"/></svg> Show reference ring`;
  }

  function selectDestination(index) {
    if (!state.destinations[index]) return;
    state.selectedDestinationIndex = index;
    resetViewport();
    syncLiveDestination(state.destinations[index]);
    logActivity(`Target selected: ${state.destinations[index].name}`);
    saveSession();
    renderAll();
  }

  function toggleLocalMode() {
    state.settings.localMode = !state.settings.localMode;
    resetViewport();
    writeSettings();
    logActivity(state.settings.localMode ? "Local mode enabled" : "Local mode disabled");
    renderAll();
    showToast(state.settings.localMode
      ? `Local projection enabled: ${state.settings.gridSize}×${state.settings.gridSize} regions around the target.`
      : "Star map projection restored.");
  }

  function toggleMapView() {
    if (!map3d?.supported) {
      showToast("3D canvas is unavailable in this browser.", true);
      return;
    }
    state.settings.mapView = state.settings.mapView === "3d" ? "2d" : "3d";
    writeSettings();
    logActivity(state.settings.mapView === "3d" ? "3D orbit map enabled" : "2D projection restored");
    renderAll();
    showToast(state.settings.mapView === "3d" ? "3D orbit map enabled." : "2D star map restored.");
  }

  function syncOrbitControls(orbit) {
    const select = document.getElementById("orbitFocusSelect");
    select.value = orbit.focus;
    select.querySelector('[value="player"]').disabled = !orbit.playerAvailable;
    select.querySelector('[value="destination"]').disabled = !orbit.destinationAvailable;
    const button = document.getElementById("orbitToggleButton");
    button.textContent = orbit.running ? "Pause orbit" : "Start orbit";
    button.setAttribute("aria-pressed", String(orbit.running));
    document.getElementById("orbitStatus").textContent = `${orbit.running ? "Orbiting" : "Paused"} · 360° in 2 minutes`;
  }

  function toggleNametags() {
    state.settings.showNametags = state.settings.showNametags === false;
    writeSettings();
    logActivity(state.settings.showNametags ? "Map nametags enabled" : "Map nametags hidden");
    renderAll();
    showToast(state.settings.showNametags ? "Map nametags shown." : "Map nametags hidden.");
  }

  function syncNametagToggle() {
    if (!els.nametagToggleButton) return;
    const enabled = state.settings.showNametags !== false;
    els.nametagToggleButton.classList.toggle("is-on", enabled);
    els.nametagToggleButton.classList.toggle("is-off", !enabled);
    els.nametagToggleButton.setAttribute("aria-pressed", String(enabled));
    els.nametagToggleButton.setAttribute("aria-label", `Map nametags ${enabled ? "on" : "off"}`);
    els.nametagToggleButton.title = enabled ? "Hide map nametags" : "Show map nametags";
    els.nametagToggleLabel.textContent = enabled ? "ON" : "OFF";
  }

  function syncSnapUserButton() {
    if (!els.snapUserButton) return;
    const enabled = Boolean(state.location);
    els.snapUserButton.disabled = !enabled;
    els.snapUserButton.title = enabled
      ? "Snap the current map view to your saved origin"
      : "Enter origin coordinates before snapping to your location";
  }

  function getMapUserPoint() {
    if (!state.location) return null;
    const target = state.destinations[state.selectedDestinationIndex];
    return state.settings.localMode && target
      ? localMapPositions(state.location.coords, target.coords).user
      : galaxyMapPositions(state.location.coords, target?.coords || GALAXY_CENTRE).user;
  }

  function snapToUser() {
    if (!state.location) {
      showToast("Enter origin coordinates before snapping to your location.", true);
      return;
    }
    if (is3DMap()) {
      if (!map3d?.snapToUser?.()) {
        showToast("The 3D map is waiting for a saved origin.", true);
        return;
      }
    } else {
      const point = getMapUserPoint();
      if (!point) return;
      const scale = state.viewport.scale;
      animateMapViewport({
        scale,
        panX: scale * (MAP_VIEW.width / 2 - point.x),
        panY: scale * (MAP_VIEW.height / 2 - point.y),
      }, 240);
    }
    logActivity("Map snapped to user location");
    showToast("Map snapped to your saved origin.");
  }

  function requestAnimationFrameSafe(callback) {
    return typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame(callback)
      : window.setTimeout(() => callback(Date.now()), 16);
  }

  function cancelMapZoomAnimation() {
    if (!mapZoomFrame) return;
    if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(mapZoomFrame);
    else window.clearTimeout(mapZoomFrame);
    mapZoomFrame = 0;
  }

  function resetViewport() {
    cancelMapZoomAnimation();
    state.viewport = { scale: 1, panX: 0, panY: 0 };
  }

  function animateMapViewport(target, duration = 180) {
    cancelMapZoomAnimation();
    const start = { ...state.viewport };
    const startedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
    const frame = (timestamp) => {
      const elapsed = timestamp - startedAt;
      const progress = math.clamp(elapsed / duration, 0, 1);
      const eased = 1 - ((1 - progress) ** 3);
      state.viewport = {
        scale: start.scale + (target.scale - start.scale) * eased,
        panX: start.panX + (target.panX - start.panX) * eased,
        panY: start.panY + (target.panY - start.panY) * eased,
      };
      updateMapTransform(false);
      if (progress < 1) mapZoomFrame = requestAnimationFrameSafe(frame);
      else mapZoomFrame = 0;
    };
    mapZoomFrame = requestAnimationFrameSafe(frame);
  }

  function recenterMap() {
    if (is3DMap()) {
      if (!map3d?.snapToUser?.()) {
        showToast("Enter origin coordinates before recentering the 3D map.", true);
        return;
      }
    } else {
      resetViewport();
      updateMapTransform();
    }
    logActivity("Map view recentered");
    showToast("Map view recentered.");
  }

  function resetMap() {
    resetViewport();
    if (is3DMap()) map3d.reset(); else updateMapTransform();
    showToast("Map zoom and pan reset.");
  }

  function mapPointFromClient(clientX, clientY) {
    const rect = els.starMap.getBoundingClientRect();
    const renderScale = Math.min(rect.width / MAP_VIEW.width, rect.height / MAP_VIEW.height) || 1;
    const renderedWidth = MAP_VIEW.width * renderScale;
    const renderedHeight = MAP_VIEW.height * renderScale;
    return {
      x: (clientX - rect.left - (rect.width - renderedWidth) / 2) / renderScale,
      y: (clientY - rect.top - (rect.height - renderedHeight) / 2) / renderScale,
    };
  }

  function setZoom(scale, focalEvent) {
    const previousScale = state.viewport.scale;
    const nextScale = math.clamp(scale, MAP_ZOOM_MIN, MAP_ZOOM_MAX);
    if (nextScale === previousScale) return;
    const targetViewport = { scale: nextScale, panX: state.viewport.panX, panY: state.viewport.panY };
    if (focalEvent) {
      const focal = mapPointFromClient(focalEvent.clientX, focalEvent.clientY);
      const focalX = focal.x;
      const focalY = focal.y;
      const previousTranslateX = (1 - previousScale) * 500 + state.viewport.panX;
      const previousTranslateY = (1 - previousScale) * 280 + state.viewport.panY;
      const worldX = (focalX - previousTranslateX) / previousScale;
      const worldY = (focalY - previousTranslateY) / previousScale;
      const nextTranslateX = focalX - nextScale * worldX;
      const nextTranslateY = focalY - nextScale * worldY;
      targetViewport.panX = nextTranslateX - (1 - nextScale) * 500;
      targetViewport.panY = nextTranslateY - (1 - nextScale) * 280;
    }
    animateMapViewport(targetViewport, 150);
  }

  function handle3DZoom(distance) {
    els.zoomReadout.textContent = `ORBIT ${Math.round((DEFAULT_3D_DISTANCE / distance) * 100)}%`;
  }

  function is3DMap() {
    return state.settings.mapView === "3d" && Boolean(map3d?.supported);
  }

  function updateMapTransform(animate = true) {
    if (!els.mapStage || is3DMap()) return;
    const scale = state.viewport.scale;
    const translateX = (1 - scale) * 500 + state.viewport.panX;
    const translateY = (1 - scale) * 280 + state.viewport.panY;
    els.mapStage.setAttribute("transform", `matrix(${scale} 0 0 ${scale} ${translateX} ${translateY})`);
    els.zoomReadout.textContent = `${Math.round(state.viewport.scale * 100)}%`;
  }

  function applyMapHeight() {
    const height = math.clamp(Number(state.settings.mapHeight) || 560, 320, 960);
    els.mapCanvasWrap.style.minHeight = `${height}px`;
    els.starMap.style.minHeight = `${height}px`;
    els.starMap3d.style.minHeight = `${height}px`;
  }

  function resetSession() {
    const activeJourneyCheckpoints = state.journeys
      .filter((journey) => journey.status !== "completed")
      .reduce((total, journey) => total + journey.points.length, 0);
    const archivedJourneys = state.journeys.filter((journey) => journey.status === "completed");
    const unfinished = state.journeys.length - archivedJourneys.length;
    if (!window.confirm(`Reset this session? This removes ${unfinished} unfinished journey(s), including ${activeJourneyCheckpoints} checkpoint(s) and their notes. Completed journeys are kept. Deleted waypoints are restored. Export a backup in Config first if you want to keep unfinished records.`)) return;
    state.location = null;
    state.selectedDestinationIndex = null;
    state.viewingJourneyId = null;
    state.activeJourneyId = null;
    state.journeys = archivedJourneys;
    noteTarget = null;
    renameTarget = null;
    closeCheckpointRenameDialog();
    state.ringVisible = false;
    resetViewport();
    restoreWaypoints({ silent: true, persist: false });
    state.selectedDestinationIndex = null;
    if (is3DMap()) map3d.reset();
    saveWaypointStore();
    saveSession();
    saveJourneyStore();
    logActivity(`Session reset · ${activeJourneyCheckpoints} in-progress checkpoint${activeJourneyCheckpoints === 1 ? "" : "s"} cleared · archives kept`);
    showToast(activeJourneyCheckpoints
      ? `Session reset. ${activeJourneyCheckpoints} in-progress checkpoint${activeJourneyCheckpoints === 1 ? "" : "s"} cleared; completed journeys kept.`
      : "Session reset. Completed journeys kept for restore.");
    renderAll();
  }

  function openWaypointDialog() {
    els.waypointNameInput.value = "";
    els.waypointCoordinateInput.value = "";
    els.waypointError.textContent = "";
    if (typeof els.waypointDialog.showModal === "function") els.waypointDialog.showModal();
    else els.waypointDialog.setAttribute("open", "");
    window.setTimeout(() => els.waypointNameInput.focus(), 0);
  }

  function closeWaypointDialog() {
    if (typeof els.waypointDialog.close === "function" && els.waypointDialog.open) els.waypointDialog.close();
    else els.waypointDialog.removeAttribute("open");
  }

  function saveWaypointFromForm() {
    const name = els.waypointNameInput.value.trim();
    const coordinateInput = els.waypointCoordinateInput.value.trim();
    if (!name) {
      els.waypointError.textContent = "Enter a name for this waypoint.";
      els.waypointNameInput.focus();
      return;
    }
    try {
      const parsed = math.parseLocation(coordinateInput);
      const destination = {
        name,
        address: parsed.address,
        coords: { x: parsed.x, y: parsed.y, z: parsed.z },
        planet: parsed.planet,
        accent: "cyan",
        userCreated: true,
      };
      state.deletedWaypoints = (state.deletedWaypoints || []).filter((waypoint) => waypoint.address !== destination.address);
      state.destinations.push(destination);
      state.selectedDestinationIndex = state.destinations.length - 1;
      syncLiveDestination(destination);
      logActivity(`Waypoint added: ${destination.name}`);
      saveWaypointStore();
      saveSession();
      closeWaypointDialog();
      renderAll();
      showToast(`${destination.name} added to local waypoints.`);
    } catch (error) {
      els.waypointError.textContent = error.message;
      els.waypointCoordinateInput.focus();
    }
  }

  function deleteWaypoint(index) {
    const destination = state.destinations[index];
    if (!destination) return;
    const wasSelected = state.selectedDestinationIndex === index;
    const deletedName = destination.name;
    if (destination.userCreated) {
      state.deletedWaypoints = [
        ...(state.deletedWaypoints || []).filter((waypoint) => waypoint.address !== destination.address),
        cloneDestination(destination),
      ];
    }
    state.destinations.splice(index, 1);
    if (wasSelected) {
      state.selectedDestinationIndex = null;
      state.viewingJourneyId = null;
      saveJourneyStore();
    } else if (Number.isInteger(state.selectedDestinationIndex) && state.selectedDestinationIndex > index) {
      state.selectedDestinationIndex -= 1;
    }
    resetViewport();
    saveWaypointStore();
    saveSession();
    logActivity(`Waypoint deleted: ${deletedName}`);
    renderAll();
    showToast(`${deletedName} removed from stored waypoints.`);
  }

  function clearDestination() {
    if (state.selectedDestinationIndex === null) return;
    state.selectedDestinationIndex = null;
    state.viewingJourneyId = null;
    resetViewport();
    saveSession();
    logActivity("Destination selection cleared");
    renderAll();
    showToast("Destination lock released.");
  }

  function restoreWaypoints({ silent = false, persist = true } = {}) {
    const selectedAddress = Number.isInteger(state.selectedDestinationIndex)
      ? state.destinations[state.selectedDestinationIndex]?.address
      : "";
    const existingCommunity = new Map(
      state.destinations
        .filter((destination) => !destination.userCreated)
        .map((destination) => [destination.address, destination]),
    );
    const existingCustom = state.destinations.filter((destination) => destination.userCreated);
    const existingAddresses = new Set(state.destinations.map((destination) => destination.address));
    const restoredCommunity = COMMUNITY_DESTINATIONS.map((destination) => existingCommunity.get(destination.address) || cloneDestination(destination));
    const restoredCustom = (state.deletedWaypoints || [])
      .filter((waypoint) => !existingAddresses.has(waypoint.address))
      .map(cloneDestination);
    state.destinations = [...restoredCommunity, ...existingCustom, ...restoredCustom];
    state.deletedWaypoints = [];
    state.selectedDestinationIndex = selectedAddress
      ? state.destinations.findIndex((destination) => destination.address === selectedAddress)
      : null;
    if (state.selectedDestinationIndex < 0) state.selectedDestinationIndex = null;
    if (persist) saveWaypointStore();
    if (!silent) {
      logActivity("Stored waypoints restored");
      renderAll();
      showToast("Deleted waypoints restored.");
    }
  }

  function syncRestoreWaypointsButton() {
    if (!els.restoreWaypointsButton) return;
    const presentAddresses = new Set(state.destinations.map((destination) => destination.address));
    const canRestore = COMMUNITY_DESTINATIONS.some((destination) => !presentAddresses.has(destination.address))
      || Boolean(state.deletedWaypoints?.length);
    els.restoreWaypointsButton.disabled = !canRestore;
    els.restoreWaypointsButton.title = canRestore ? "Restore deleted waypoints" : "All waypoints are present";
    els.restoreWaypointsButton.setAttribute("aria-label", canRestore ? "Restore deleted waypoints" : "All waypoints are present");
  }

  function syncLiveDestination(destination) {
    const activeJourney = getActiveJourney();
    if (activeJourney) {
      activeJourney.destination = snapshotDestination(destination);
      activeJourney.updatedAt = new Date().toISOString();
      state.viewingJourneyId = activeJourney.id;
    } else {
      // Selecting or creating a live target exits an archived journey replay.
      // Otherwise render3DMap would correctly redraw, but keep using the
      // archived journey's destination instead of the newly selected target.
      state.viewingJourneyId = null;
    }
    saveJourneyStore();
  }

  function openJourneyDialog() {
    els.journeyNameInput.value = "";
    els.journeyError.textContent = "";
    if (typeof els.journeyDialog.showModal === "function") els.journeyDialog.showModal();
    else els.journeyDialog.setAttribute("open", "");
    window.setTimeout(() => els.journeyNameInput.focus(), 0);
  }

  function closeJourneyDialog() {
    if (typeof els.journeyDialog.close === "function" && els.journeyDialog.open) els.journeyDialog.close();
    else els.journeyDialog.removeAttribute("open");
  }

  function saveJourneyFromForm() {
    const name = els.journeyNameInput.value.trim();
    if (!name) {
      els.journeyError.textContent = "Enter a name for this journey.";
      els.journeyNameInput.focus();
      return;
    }

    const active = getActiveJourney();
    if (active?.points.length) {
      const archived = completeActiveJourney();
      if (archived) logActivity(`Journey completed: ${archived.name}`);
    } else if (active) {
      state.journeys = state.journeys.filter((journey) => journey.id !== active.id);
      state.activeJourneyId = null;
      if (state.viewingJourneyId === active.id) state.viewingJourneyId = null;
    }

    const journey = createJourneyRecord(name);
    state.journeys.push(journey);
    state.activeJourneyId = journey.id;
    state.viewingJourneyId = journey.id;
    noteTarget = null;
    saveJourneyStore();
    closeJourneyDialog();
    logActivity(`New journey started: ${journey.name}`);
    switchView("journeys");
    renderAll();
    showToast(`${journey.name} is ready for checkpoints.`);
  }

  function completeJourney() {
    const completed = completeActiveJourney();
    if (!completed) {
      showToast("Update your location before completing a journey.", true);
      return;
    }
    logActivity(`Journey completed: ${completed.name}`);
    renderAll();
    showToast(`${completed.name} saved to the journey archive.`);
  }

  function selectJourney(id) {
    restoreJourney(id);
  }

  function restoreJourney(id) {
    const journey = getJourney(id)
      || getJourney(state.viewingJourneyId)
      || getActiveJourney()
      || (state.journeys.length ? state.journeys[state.journeys.length - 1] : null);
    if (!journey) return;
    state.viewingJourneyId = journey.id;
    if (journey.status === "active") {
      state.activeJourneyId = journey.id;
      const latest = journey.points[journey.points.length - 1];
      if (latest) state.location = normalizeSavedLocation(latest);
    }
    if (journey.destination) {
      const destinationIndex = state.destinations.findIndex((destination) =>
        destination.address === journey.destination.address
        || sameCoords(destination.coords, journey.destination.coords));
      state.selectedDestinationIndex = destinationIndex >= 0 ? destinationIndex : null;
    } else state.selectedDestinationIndex = null;
    state.settings.mapView = map3d?.supported ? "3d" : "2d";
    saveJourneyStore();
    saveSession();
    writeSettings();
    logActivity(`${journey.status === "completed" ? "Journey replay restored" : "Journey resumed"}: ${journey.name}`);
    switchView("map");
    renderAll();
    showToast(journey.status === "completed"
      ? `${journey.name} route restored on the ${state.settings.mapView.toUpperCase()} map.`
      : `${journey.name} resumed from checkpoint ${journey.points.length}.`);
  }

  function recordJourneyLocation(parsed) {
    const journey = ensureActiveJourney();
    const point = {
      coords: { x: parsed.x, y: parsed.y, z: parsed.z },
      address: parsed.address,
      label: journey.points.length ? `CHECKPOINT ${String(journey.points.length + 1).padStart(2, "0")}` : "ORIGIN",
      timestamp: new Date().toISOString(),
      notes: "",
    };
    const lastPoint = journey.points[journey.points.length - 1];
    const addedPoint = !lastPoint || lastPoint.address !== point.address || !sameCoords(lastPoint.coords, point.coords);
    if (addedPoint) {
      journey.points.push(point);
      noteTarget = { journeyId: journey.id, pointIndex: journey.points.length - 1 };
    }
    if (addedPoint && els.checkpointNoteInput) els.checkpointNoteInput.value = "";
    journey.destination = snapshotDestination(state.destinations[state.selectedDestinationIndex]);
    journey.updatedAt = new Date().toISOString();
    state.viewingJourneyId = journey.id;
    saveJourneyStore();
  }

  function completeActiveJourney() {
    const journey = getActiveJourney();
    if (!journey || !journey.points.length) return null;
    const target = state.destinations[state.selectedDestinationIndex];
    journey.destination = snapshotDestination(target);
    journey.status = "completed";
    journey.completedAt = new Date().toISOString();
    journey.updatedAt = journey.completedAt;
    state.activeJourneyId = null;
    state.viewingJourneyId = journey.id;
    saveJourneyStore();
    return journey;
  }

  function ensureActiveJourney() {
    let journey = getActiveJourney();
    if (!journey) {
      journey = createJourneyRecord(`Journey ${String(state.journeys.length + 1).padStart(2, "0")}`);
      state.journeys.push(journey);
      state.activeJourneyId = journey.id;
    }
    return journey;
  }

  function createJourneyRecord(name) {
    const now = new Date().toISOString();
    return {
      id: `journey-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || `Journey ${String(state.journeys.length + 1).padStart(2, "0")}`,
      status: "active",
      startedAt: now,
      completedAt: null,
      updatedAt: now,
      points: [],
      destination: null,
    };
  }

  function getJourney(id) {
    return state.journeys.find((journey) => journey.id === id) || null;
  }

  function getActiveJourney() {
    const journey = getJourney(state.activeJourneyId);
    return journey?.status === "active" ? journey : null;
  }

  function snapshotDestination(destination) {
    if (!destination) return null;
    return { name: destination.name, address: destination.address, coords: { ...destination.coords } };
  }

  function sameCoords(first, second) {
    return Boolean(first && second) && first.x === second.x && first.y === second.y && first.z === second.z;
  }

  function formatJourneyDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  }

  function getJourneyForOrigin() {
    return getJourney(state.viewingJourneyId)
      || getActiveJourney()
      || null;
  }

  function renderOriginJourneyPoints(journey) {
    const points = journey?.points || [];
    if (!points.length) {
      els.originJourneyPoints.innerHTML = `<div class="origin-journey-empty">NO CHECKPOINTS SAVED</div>`;
      return;
    }
    els.originJourneyPoints.innerHTML = `
      <div class="origin-journey-list" aria-label="Saved journey waypoints">
        ${points.map((point, index) => `
          <div class="origin-journey-point${index === points.length - 1 ? " is-latest" : ""}">
            <i>${String(index + 1).padStart(2, "0")}</i>
            <div class="origin-journey-point-copy">
              <strong>${escapeHtml(point.label || "CHECKPOINT")}</strong>
              <small>${escapeHtml(point.address || `x:${point.coords.x} · y:${point.coords.y} · z:${point.coords.z}`)}</small>
              ${point.notes ? `<button class="origin-journey-point-note note-preview-button" type="button" data-note-journey="${escapeHtml(journey.id)}" data-note-point="${index}" aria-label="Read or edit note for ${escapeHtml(point.label || "checkpoint")}">NOTE · ${escapeHtml(point.notes)}</button>` : ""}
            </div>
            <div class="origin-checkpoint-actions">
              <button class="origin-note-trigger" type="button" data-note-journey="${escapeHtml(journey.id)}" data-note-point="${index}" aria-label="${point.notes ? "Edit" : "Add"} note for ${escapeHtml(point.label || "checkpoint")}">${point.notes ? "EDIT" : "+ NOTE"}</button>
              <button class="origin-rename-trigger" type="button" data-rename-journey="${escapeHtml(journey.id)}" data-rename-point="${index}" aria-label="Rename ${escapeHtml(point.label || "checkpoint")}" title="Rename checkpoint">✎</button>
            </div>
          </div>`).join("")}
      </div>`;
    $$('[data-note-journey]', els.originJourneyPoints).forEach((button) => button.addEventListener("click", () => {
      selectCheckpointNote(button.dataset.noteJourney, Number(button.dataset.notePoint));
    }));
    $$('[data-rename-journey]', els.originJourneyPoints).forEach((button) => button.addEventListener("click", () => {
      openCheckpointRename(button.dataset.renameJourney, Number(button.dataset.renamePoint));
    }));
  }

  function getCheckpointNoteSelection(journey) {
    if (!journey?.points?.length) return null;
    const selectedIndex = noteTarget?.journeyId === journey.id
      && Number.isInteger(noteTarget.pointIndex)
      && journey.points[noteTarget.pointIndex]
      ? noteTarget.pointIndex
      : journey.points.length - 1;
    return { journey, point: journey.points[selectedIndex], pointIndex: selectedIndex };
  }

  function syncCheckpointNoteControls(journey) {
    const selection = getCheckpointNoteSelection(journey);
    const selectedPoint = selection?.point || null;
    const canEdit = Boolean(selectedPoint);
    els.checkpointNoteInput.disabled = !canEdit;
    els.saveCheckpointNoteButton.disabled = !canEdit;
    if (!canEdit) {
      els.checkpointNoteInput.value = "";
      els.checkpointNoteStatus.textContent = "START A JOURNEY TO ADD NOTES";
      return;
    }
    const pointLabel = selection.pointIndex === journey.points.length - 1
      ? "LATEST CHECKPOINT"
      : (selectedPoint.label || `CHECKPOINT ${String(selection.pointIndex + 1).padStart(2, "0")}`);
    const journeyLabel = journey.status === "completed" ? `${pointLabel} · ARCHIVED` : pointLabel;
    els.checkpointNoteStatus.textContent = selectedPoint.notes ? `${journeyLabel} · NOTE SAVED` : `${journeyLabel} · READY`;
  }

  function selectCheckpointNote(journeyId, pointIndex) {
    const journey = getJourney(journeyId);
    const point = journey?.points?.[pointIndex];
    if (!journey || !point) return;
    modalNoteTarget = { journeyId: journey.id, pointIndex };
    document.getElementById("checkpointNoteContext").textContent = `${journey.name} · ${point.label || "Checkpoint"} · ${point.address || ""}`;
    document.getElementById("checkpointNoteEditor").value = point.notes || "";
    document.getElementById("checkpointNoteDialog").showModal();
    document.getElementById("checkpointNoteEditor").focus();
  }

  function bindNoteDialog() {
    const dialog = document.getElementById("checkpointNoteDialog");
    const close = () => dialog.close();
    document.getElementById("closeNoteDialogButton").addEventListener("click", close);
    document.getElementById("cancelNoteDialogButton").addEventListener("click", close);
    dialog.addEventListener("close", () => { modalNoteTarget = null; });
    document.getElementById("checkpointNoteForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const journey = getJourney(modalNoteTarget?.journeyId);
      const point = journey?.points?.[modalNoteTarget?.pointIndex];
      if (!point) { close(); return; }
      point.notes = document.getElementById("checkpointNoteEditor").value.trim().slice(0, 240);
      journey.updatedAt = new Date().toISOString();
      if (noteTarget?.journeyId === journey.id && noteTarget.pointIndex === modalNoteTarget.pointIndex) els.checkpointNoteInput.value = point.notes;
      saveJourneyStore();
      close();
      renderAll();
      showToast(point.notes ? "Checkpoint note saved." : "Checkpoint note cleared.");
    });
  }

  function openCheckpointRename(journeyId, pointIndex) {
    const journey = getJourney(journeyId);
    const point = journey?.points?.[pointIndex];
    if (!journey || !point) return;
    renameTarget = { journeyId: journey.id, pointIndex };
    els.checkpointNameInput.value = point.label || "";
    els.checkpointRenameError.textContent = "";
    if (typeof els.checkpointRenameDialog.showModal === "function") els.checkpointRenameDialog.showModal();
    else els.checkpointRenameDialog.setAttribute("open", "");
    window.setTimeout(() => {
      els.checkpointNameInput.focus();
      els.checkpointNameInput.select();
    }, 0);
  }

  function closeCheckpointRenameDialog() {
    if (!els.checkpointRenameDialog) return;
    if (typeof els.checkpointRenameDialog.close === "function" && els.checkpointRenameDialog.open) els.checkpointRenameDialog.close();
    else els.checkpointRenameDialog.removeAttribute("open");
    renameTarget = null;
  }

  function saveCheckpointRename() {
    const journey = getJourney(renameTarget?.journeyId);
    const point = journey?.points?.[renameTarget?.pointIndex];
    const name = String(els.checkpointNameInput.value || "").trim().slice(0, 48);
    if (!journey || !point) {
      closeCheckpointRenameDialog();
      return;
    }
    if (!name) {
      els.checkpointRenameError.textContent = "Enter a name for this checkpoint.";
      els.checkpointNameInput.focus();
      return;
    }
    point.label = name;
    journey.updatedAt = new Date().toISOString();
    saveJourneyStore();
    closeCheckpointRenameDialog();
    logActivity(`Checkpoint renamed: ${name}`);
    renderAll();
    showToast("Checkpoint renamed and saved.");
  }

  function saveCheckpointNote() {
    const journey = getJourneyForOrigin();
    const selection = getCheckpointNoteSelection(journey);
    if (!selection) {
      showToast("Save an origin checkpoint before adding a note.", true);
      return;
    }
    const note = String(els.checkpointNoteInput.value || "").trim().slice(0, 240);
    if (!note && !selection.point.notes) {
      showToast("Write a note before saving it.", true);
      els.checkpointNoteInput.focus();
      return;
    }
    selection.point.notes = note;
    journey.updatedAt = new Date().toISOString();
    saveJourneyStore();
    logActivity(note ? `Note saved to ${selection.point.label}` : `Note cleared from ${selection.point.label}`);
    renderAll();
    showToast(note ? "Checkpoint note saved." : "Checkpoint note cleared.");
  }

  function renderJourneys() {
    const active = getActiveJourney();
    const viewed = getJourney(state.viewingJourneyId) || active || (state.journeys.length ? state.journeys[state.journeys.length - 1] : null);
    const focus = viewed || active;
    const focusIsActive = Boolean(active && focus && active.id === focus.id);
    const focusPoints = focus?.points || [];
    const originJourney = getJourneyForOrigin();

    els.journeySaveStatus.textContent = active
      ? `${active.name.toUpperCase()} · ${active.points.length} CHECKPOINT${active.points.length === 1 ? "" : "S"} SAVED`
      : originJourney?.points?.length
        ? `${originJourney.name.toUpperCase()} · ${originJourney.points.length} CHECKPOINT${originJourney.points.length === 1 ? "" : "S"} SAVED`
        : "LOCATION CHECKPOINTS SAVE TO JOURNEYS";
    renderOriginJourneyPoints(originJourney);
    syncCheckpointNoteControls(originJourney);
    els.journeyFocusLabel.textContent = focusIsActive ? "ACTIVE JOURNEY" : (focus ? "SELECTED ARCHIVE" : "ACTIVE JOURNEY");
    els.activeJourneyName.textContent = focus?.name || "No active journey";
    els.activeJourneyStatus.textContent = focus?.status === "completed" ? "COMPLETED" : (focus?.points.length ? "RECORDING" : "READY");
    els.activeJourneyStatus.classList.toggle("state-warn", focus?.status !== "completed" && Boolean(focus?.points.length));
    els.activeJourneyStatus.classList.toggle("state-live", focus?.status === "completed" || !focus?.points.length);
    els.activeJourneyPointCount.textContent = String(focusPoints.length);
    els.activeJourneyStart.textContent = formatJourneyDate(focus?.startedAt);
    els.activeJourneyDestination.textContent = focus?.destination?.name || "—";
    els.restoreJourneyButton.disabled = !focus;
    els.restoreJourneyButton.textContent = focus?.status === "completed"
      ? "Replay route"
      : focus?.points.length
        ? "Resume journey"
        : "Open journey";
    els.restoreJourneyButton.title = focus?.status === "completed"
      ? "Restore this completed route on the 3D map"
      : "Resume this journey from its saved checkpoints";
    els.completeJourneyButton.disabled = !active || !active.points.length;
    els.journeyTrailHint.textContent = focus
      ? `${focusPoints.length} checkpoint${focusPoints.length === 1 ? "" : "s"} · ${focus.status === "completed" ? "restore the trail in 3D" : "resume from the latest checkpoint"}`
      : "Update origin to log the first checkpoint.";
    els.activeJourneyPoints.innerHTML = focusPoints.length
      ? focusPoints.map((point, index) => `<div class="journey-point"><i>${String(index + 1).padStart(2, "0")}</i><div><strong>${escapeHtml(point.label)}</strong><small>${escapeHtml(point.address || `x:${point.coords.x} · y:${point.coords.y} · z:${point.coords.z}`)}</small>${point.notes ? `<button class="journey-point-note note-preview-button" type="button" data-note-journey="${escapeHtml(focus.id)}" data-note-point="${index}" aria-label="Read or edit note for ${escapeHtml(point.label)}">NOTE · ${escapeHtml(point.notes)}</button>` : ""}</div><time>${escapeHtml(formatJourneyDate(point.timestamp))}</time><button class="small-action journey-point-rename" type="button" data-rename-journey="${escapeHtml(focus.id)}" data-rename-point="${index}" aria-label="Rename ${escapeHtml(point.label || "checkpoint")}" title="Rename checkpoint">✎</button></div>`).join("")
      : `<div class="journey-empty">No checkpoints yet. Update the origin coordinates to begin recording this flight.</div>`;
    $$('[data-rename-journey]', els.activeJourneyPoints).forEach((button) => button.addEventListener("click", () => {
      openCheckpointRename(button.dataset.renameJourney, Number(button.dataset.renamePoint));
    }));
    $$('[data-note-journey]', els.activeJourneyPoints).forEach((button) => button.addEventListener("click", () => {
      selectCheckpointNote(button.dataset.noteJourney, Number(button.dataset.notePoint));
    }));

    els.journeyCount.textContent = `${String(state.journeys.length).padStart(2, "0")} JOURNE${state.journeys.length === 1 ? "Y" : "YS"}`;
    const sortedJourneys = [...state.journeys].sort((first, second) => new Date(second.updatedAt || second.startedAt).getTime() - new Date(first.updatedAt || first.startedAt).getTime());
    els.journeyList.innerHTML = sortedJourneys.length
      ? sortedJourneys.map((journey, index) => {
        const completed = journey.status === "completed";
        const actionLabel = completed ? "Replay route" : "Resume journey";
        return `<div class="journey-entry ${journey.id === focus?.id ? "is-selected" : ""}"><div class="journey-entry-main"><i>${String(index + 1).padStart(2, "0")}</i><div class="journey-entry-copy"><strong>${escapeHtml(journey.name)}</strong><small>${journey.status.toUpperCase()} · ${journey.points.length} CHECKPOINT${journey.points.length === 1 ? "" : "S"} · ${escapeHtml(formatJourneyDate(journey.updatedAt || journey.startedAt))}</small></div></div><button class="small-action" type="button" data-view-journey="${escapeHtml(journey.id)}" aria-label="${actionLabel} ${escapeHtml(journey.name)}" title="${actionLabel}">${completed ? "↺" : "▶"}</button></div>`;
      }).join("")
      : `<div class="journey-empty">No journeys archived yet. Start one to build a route you can revisit.</div>`;
    $$('[data-view-journey]', els.journeyList).forEach((button) => button.addEventListener("click", () => selectJourney(button.dataset.viewJourney)));
  }

  function syncSettingsForm() {
    els.hyperdriveInput.value = state.settings.hyperdrive;
    els.galaxyInput.value = state.settings.galaxy;
    els.gridSizeInput.value = state.settings.gridSize;
    els.mapHeightInput.value = state.settings.mapHeight;
    if (els.localModeButton) els.localModeButton.setAttribute("aria-pressed", String(Boolean(state.settings.localMode)));
    syncTopPanels();
  }

  function saveSettings() {
    state.settings = {
      ...state.settings,
      hyperdrive: math.clamp(Number(els.hyperdriveInput.value) || 1600, 1, 999999),
      galaxy: els.galaxyInput.value,
      gridSize: math.clamp(Number(els.gridSizeInput.value) || 16, 8, 64),
      mapHeight: math.clamp(Number(els.mapHeightInput.value) || 560, 320, 960),
    };
    writeSettings();
    logActivity("Navigation settings saved locally");
    showToast("Settings saved and applied.");
    renderAll();
  }

  function clearSettings() {
    state.settings = { ...DEFAULT_SETTINGS };
    writeSettings();
    applyTopPanelOrder();
    syncSettingsForm();
    renderAll();
    logActivity("Settings cache cleared");
    showToast("Settings returned to defaults.");
  }

  function readSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      const storedOrder = Array.isArray(stored.topPanelOrder)
        ? stored.topPanelOrder.map((key) => key === "route" ? "target" : key)
        : [];
      const requestedOrder = storedOrder;
      const topPanelOrder = [...new Set(requestedOrder.filter((key) => TOP_PANEL_KEYS.includes(key)))];
      DEFAULT_SETTINGS.topPanelOrder.forEach((key) => { if (!topPanelOrder.includes(key)) topPanelOrder.push(key); });
      return {
        ...DEFAULT_SETTINGS,
        ...stored,
        hyperdrive: math.clamp(Number(stored.hyperdrive) || 1600, 1, 999999),
        gridSize: math.clamp(Number(stored.gridSize) || 16, 8, 64),
        mapHeight: math.clamp(Number(stored.mapHeight) || 560, 320, 960),
        galaxy: ["Euclid", "Hilbert Dimension", "Calypso"].includes(stored.galaxy) ? stored.galaxy : "Euclid",
        localMode: Boolean(stored.localMode),
        showNametags: stored.showNametags !== false,
        // Keep 2D as the reliable startup frame. Users can still switch to
        // 3D during the session; the next load begins from the reference map.
        mapView: "2d",
        topPanelsCollapsed: Boolean(stored.topPanelsCollapsed),
        topPanelOrder,
      };
    } catch (_) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function writeSettings() {
    persistData();
  }

  function saveSession() {
    persistData();
  }

  function readSession(availableDestinations = COMMUNITY_DESTINATIONS) {
    try {
      const stored = JSON.parse(localStorage.getItem(SESSION_KEY)) || {};
      const originWasCleared = Object.prototype.hasOwnProperty.call(stored, "location") && stored.location === null;
      const storedIndex = Number.isInteger(stored.selectedDestinationIndex) ? stored.selectedDestinationIndex : null;
      const storedAddress = String(stored.selectedDestinationAddress || "").toUpperCase();
      const addressIndex = storedAddress
        ? availableDestinations.findIndex((destination) => destination.address === storedAddress)
        : -1;
      const selectedDestinationIndex = addressIndex >= 0
        ? addressIndex
        : storedAddress
          ? null
          : Number.isInteger(storedIndex) && availableDestinations[storedIndex]
            ? storedIndex
            : null;
      // An explicit empty origin must not revive the cache. A destination can
      // still be selected first; Reset Session already writes a null selection.
      const savedLocations = (originWasCleared ? [] : [stored.location, readOriginCache()])
        .map(normalizeSavedLocation)
        .filter(Boolean);
      const location = savedLocations[0] || null;
      return {
        location,
        selectedDestinationIndex,
      };
    } catch (_) {
      return { location: null, selectedDestinationIndex: null };
    }
  }

  function readOriginCache() {
    try {
      return JSON.parse(localStorage.getItem(ORIGIN_CACHE_KEY)) || null;
    } catch (_) {
      return null;
    }
  }

  function normalizeSavedLocation(rawLocation) {
    if (!rawLocation || typeof rawLocation !== "object") return null;
    const rawCoords = rawLocation.coords || {};
    let coords = { x: Number(rawCoords.x), y: Number(rawCoords.y), z: Number(rawCoords.z) };
    let planet = String(rawLocation.planet || DEFAULT_LOCATION.planet);
    let address = String(rawLocation.address || "").trim();

    if (![coords.x, coords.y, coords.z].every(Number.isFinite) && address) {
      try {
        const parsed = math.parseLocation(address);
        coords = { x: parsed.x, y: parsed.y, z: parsed.z };
        planet = parsed.planet;
        address = parsed.address;
      } catch (_) {
        return null;
      }
    }
    if (![coords.x, coords.y, coords.z].every(Number.isFinite)) return null;
    return {
      address: address || savedAddress(coords, planet),
      coords,
      planet,
    };
  }

  function readWaypointStore() {
    try {
      const stored = JSON.parse(localStorage.getItem(WAYPOINT_KEY)) || [];
      const custom = Array.isArray(stored)
        ? stored.map(normalizeWaypoint).filter(Boolean)
        : Array.isArray(stored.custom)
          ? stored.custom.map(normalizeWaypoint).filter(Boolean)
          : [];
      const rawDeletedCustom = !Array.isArray(stored) && Array.isArray(stored.deletedCustom)
        ? stored.deletedCustom.map(normalizeWaypoint).filter(Boolean)
        : [];
      const customAddresses = new Set(custom.map((waypoint) => waypoint.address));
      const deletedCustom = rawDeletedCustom.filter((waypoint) => !customAddresses.has(waypoint.address));
      const knownAddresses = new Set(COMMUNITY_DESTINATIONS.map((destination) => destination.address));
      const removedAddresses = Array.isArray(stored.removedCommunity)
        ? stored.removedCommunity.filter((address) => knownAddresses.has(String(address).toUpperCase())).map((address) => String(address).toUpperCase())
        : [];
      return { custom, deletedCustom, removedAddresses };
    } catch (_) {
      return { custom: [], deletedCustom: [], removedAddresses: [] };
    }
  }

  function normalizeWaypoint(rawWaypoint) {
    if (!rawWaypoint || typeof rawWaypoint !== "object") return null;
    const coords = {
      x: Number(rawWaypoint.coords?.x),
      y: Number(rawWaypoint.coords?.y),
      z: Number(rawWaypoint.coords?.z),
    };
    if (![coords.x, coords.y, coords.z].every(Number.isFinite)) return null;
    const address = String(rawWaypoint.address || savedAddress(coords, rawWaypoint.planet || "0172")).toUpperCase();
    const name = String(rawWaypoint.name || "").trim();
    if (!name) return null;
    return {
      name,
      address,
      coords,
      planet: String(rawWaypoint.planet || "0172"),
      accent: "cyan",
      userCreated: true,
    };
  }

  function saveWaypointStore() {
    persistData();
  }

  function readJourneyStore() {
    try {
      const stored = JSON.parse(localStorage.getItem(JOURNEY_KEY)) || {};
      const journeys = Array.isArray(stored.journeys)
        ? stored.journeys.map(normalizeJourney).filter(Boolean)
        : [];
      const storedActiveJourney = journeys.find((journey) => journey.id === stored.activeJourneyId && journey.status === "active");
      const fallbackActiveJourney = [...journeys].reverse().find((journey) => journey.status === "active");
      const activeJourneyId = storedActiveJourney?.id || fallbackActiveJourney?.id || null;
      const viewingJourneyId = journeys.some((journey) => journey.id === stored.viewingJourneyId)
        ? stored.viewingJourneyId
        : (activeJourneyId || null);
      return { journeys, activeJourneyId, viewingJourneyId };
    } catch (_) {
      return { journeys: [], activeJourneyId: null, viewingJourneyId: null };
    }
  }

  function normalizeJourney(rawJourney, index) {
    if (!rawJourney || typeof rawJourney !== "object") return null;
    const points = Array.isArray(rawJourney.points)
      ? rawJourney.points.map(normalizeJourneyPoint).filter(Boolean)
      : [];
    return {
      id: String(rawJourney.id || `journey-${index + 1}`),
      name: String(rawJourney.name || `Journey ${String(index + 1).padStart(2, "0")}`),
      status: rawJourney.status === "completed" ? "completed" : "active",
      startedAt: rawJourney.startedAt || new Date().toISOString(),
      completedAt: rawJourney.completedAt || null,
      updatedAt: rawJourney.updatedAt || rawJourney.completedAt || rawJourney.startedAt || new Date().toISOString(),
      points,
      destination: normalizeJourneyDestination(rawJourney.destination),
    };
  }

  function normalizeJourneyPoint(rawPoint) {
    if (!rawPoint || typeof rawPoint !== "object" || !rawPoint.coords) return null;
    const coords = {
      x: Number(rawPoint.coords.x),
      y: Number(rawPoint.coords.y),
      z: Number(rawPoint.coords.z),
    };
    if (![coords.x, coords.y, coords.z].every(Number.isFinite)) return null;
    return {
      coords,
      address: String(rawPoint.address || ""),
      label: String(rawPoint.label || "CHECKPOINT").trim().slice(0, 48),
      timestamp: rawPoint.timestamp || new Date().toISOString(),
      notes: String(rawPoint.notes || "").trim().slice(0, 240),
    };
  }

  function normalizeJourneyDestination(rawDestination) {
    if (!rawDestination || typeof rawDestination !== "object" || !rawDestination.coords) return null;
    const coords = {
      x: Number(rawDestination.coords.x),
      y: Number(rawDestination.coords.y),
      z: Number(rawDestination.coords.z),
    };
    if (![coords.x, coords.y, coords.z].every(Number.isFinite)) return null;
    return { name: String(rawDestination.name || "DESTINATION"), address: String(rawDestination.address || ""), coords };
  }

  function saveJourneyStore() {
    persistData();
  }

  function seedActivities() {
    state.activities = [
      { message: "Local engine initialised", time: "NOW" },
      { message: "Community waypoints loaded · Pilgrim Star reference ready", time: "NOW" },
      { message: "Projection ready for input", time: "NOW" },
    ];
  }

  function logActivity(message) {
    const now = new Date();
    const time = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
    state.activities.unshift({ message, time });
    state.activities = state.activities.slice(0, 5);
    renderActivities();
  }

  function renderActivities() {
    els.activityLog.innerHTML = state.activities.map((activity) => `<div class="activity-entry"><i></i><span>${escapeHtml(activity.message)}</span><time>${activity.time}</time></div>`).join("");
  }

  function renderDirectory() {
    els.directoryCount.textContent = `${String(state.destinations.length).padStart(2, "0")} TARGETS`;
    els.destinationDirectory.innerHTML = state.destinations.map((destination, index) => {
      const route = state.location ? math.calculateRoute(state.location.coords, destination.coords, state.settings, GALAXY_CENTRE) : null;
      const distance = route ? `${math.formatNumber(route.destinationDistance, 0)} LY` : "—";
      const jumps = route ? `${route.estimatedJumps} JUMPS` : "ORIGIN REQUIRED";
      return `<div class="directory-entry-row">
        <button class="directory-entry" data-directory-index="${index}"><i>${String(index + 1).padStart(2, "0")}</i><div><strong>${escapeHtml(destination.name)}</strong><small>${escapeHtml(formatDestinationMeta(destination))}</small></div><em>${distance}<br>${jumps}</em></button>
        ${renderDeleteButton(destination, index, "directory-delete")}
      </div>`;
    }).join("");
    $$("[data-directory-index]", els.destinationDirectory).forEach((button) => button.addEventListener("click", () => { selectDestination(Number(button.dataset.directoryIndex)); switchView("map"); }));
    $$('[data-delete-waypoint]', els.destinationDirectory).forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteWaypoint(Number(button.dataset.deleteWaypoint));
    }));
  }

  function startClock() {
    const update = () => { const now = new Date(); els.utcClock.textContent = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}:${String(now.getUTCSeconds()).padStart(2, "0")} UTC`; };
    update();
    setInterval(update, 1000);
  }

  function galaxyNumber(galaxy) { return galaxy === "Euclid" ? "01" : galaxy === "Hilbert Dimension" ? "02" : "03"; }

  function cloneDestination(destination) {
    return { ...destination, coords: { ...destination.coords } };
  }

  function snapshotWaypoint(waypoint) {
    return {
      name: waypoint.name,
      address: waypoint.address,
      coords: { ...waypoint.coords },
      planet: waypoint.planet || "0172",
    };
  }

  function savedAddress(coords, system) {
    try { return math.formatAddress(coords, system); }
    catch (_) { return `${coords.x}, ${coords.y}, ${coords.z}`; }
  }

  function formatDestinationMeta(destination) {
    const origin = destination.community ? `${destination.community} · ` : "";
    return `${origin}${destination.address} · ${destination.userCreated ? "CUSTOM WAYPOINT" : "COMMUNITY WAYPOINT"}`;
  }

  function renderDeleteButton(destination, index, className) {
    return `<button class="waypoint-delete ${className}" type="button" data-delete-waypoint="${index}" aria-label="Delete ${escapeHtml(destination.name)} waypoint" title="Delete waypoint">×</button>`;
  }

  function showToast(message, isError = false) {
    if (storageError && !isError) {
      message = "Changes are temporary — export a backup in Config before closing. Browser storage is unavailable or full.";
      isError = true;
    }
    els.toast.textContent = message;
    els.toast.style.borderColor = isError ? "rgba(255,123,114,.55)" : "rgba(100,232,255,.45)";
    els.toast.classList.add("is-visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("is-visible"), 2800);
  }

  function renderMapLabel(className, x, y, text) {
    if (state.settings.showNametags === false) return "";
    return `<text class="${className}" x="${x}" y="${y}">${text}</text>`;
  }

  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character])); }
})();

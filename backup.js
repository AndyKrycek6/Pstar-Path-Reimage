(function (global) {
  "use strict";
  const FORMAT = "pilgrim-star-path-backup";
  const MAX_BYTES = 20 * 1024 * 1024;

  function validate(raw) {
    const fail = (message) => { throw new Error(`Backup not imported: ${message}`); };
    const object = (value, label) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} is missing or invalid.`);
    };
    const text = (value, label, max, empty = false) => {
      if (typeof value !== "string" || (!empty && !value.trim()) || value.length > max) fail(`${label} is invalid.`);
    };
    const list = (value, label, max = 10000) => {
      if (!Array.isArray(value) || value.length > max) fail(`${label} is invalid or too large.`);
    };
    const position = (value, label) => {
      object(value, label);
      object(value.coords, `${label} coordinates`);
      // Preserve older finite coordinates in archives; new user input is validated by the calculation engine.
      if (![value.coords.x, value.coords.y, value.coords.z].every(Number.isFinite)) fail(`${label} coordinates are invalid.`);
      text(value.address, `${label} address`, 100, true);
      if (value.planet !== undefined) text(value.planet, `${label} system`, 4);
    };
    const date = (value, label, optional = false) => {
      if (optional && value === null) return;
      if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail(`${label} is invalid.`);
    };
    object(raw, "file");
    if (raw.format !== FORMAT || raw.version !== 1) fail("choose a supported Pilgrim Star Path backup (version 1).");
    object(raw.data, "saved data");
    const data = raw.data;
    object(data.settings, "settings");
    for (const [key, min, max] of [["hyperdrive", 1, 999999], ["gridSize", 8, 64], ["mapHeight", 320, 960]]) {
      if (!Number.isFinite(data.settings[key]) || data.settings[key] < min || data.settings[key] > max) fail(`${key} setting is outside its allowed range.`);
    }
    if (!["Euclid", "Hilbert Dimension", "Calypso"].includes(data.settings.galaxy)) fail("galaxy setting is invalid.");
    for (const key of ["localMode", "showNametags", "topPanelsCollapsed"]) {
      if (typeof data.settings[key] !== "boolean") fail(`${key} setting is invalid.`);
    }
    list(data.settings.topPanelOrder, "panel order", 3);
    if (new Set(data.settings.topPanelOrder).size !== 3 || data.settings.topPanelOrder.some(key => !["location", "target", "advisory"].includes(key))) fail("panel order is invalid.");
    object(data.session, "session");
    if (data.session.location !== null) position(data.session.location, "origin");
    if (data.session.selectedDestinationIndex !== null && (!Number.isInteger(data.session.selectedDestinationIndex) || data.session.selectedDestinationIndex < 0)) fail("selected destination is invalid.");
    text(data.session.selectedDestinationAddress, "destination address", 100, true);
    object(data.waypoints, "waypoints");
    for (const key of ["custom", "deletedCustom"]) {
      list(data.waypoints[key], key);
      data.waypoints[key].forEach(point => { position(point, "waypoint"); text(point.name, "waypoint name", 200); });
    }
    list(data.waypoints.removedCommunity, "removed community waypoints", 100);
    data.waypoints.removedCommunity.forEach(address => text(address, "removed waypoint address", 100));
    object(data.journeys, "journey store");
    list(data.journeys.journeys, "journeys", 2000);
    const ids = new Set();
    data.journeys.journeys.forEach(journey => {
      object(journey, "journey");
      text(journey.id, "journey ID", 200);
      if (ids.has(journey.id)) fail("duplicate journey IDs.");
      ids.add(journey.id);
      text(journey.name, "journey name", 200);
      if (!["active", "completed"].includes(journey.status)) fail("journey status is invalid.");
      date(journey.startedAt, "journey start");
      date(journey.updatedAt, "journey update");
      date(journey.completedAt, "journey completion", true);
      if (journey.destination !== null) { position(journey.destination, "journey destination"); text(journey.destination.name, "destination name", 200); }
      list(journey.points, "checkpoints", 100000);
      journey.points.forEach(point => {
        position(point, "checkpoint");
        text(point.label, "checkpoint name", 48);
        text(point.notes, "checkpoint notes", 240, true);
        date(point.timestamp, "checkpoint time");
      });
    });
    for (const key of ["activeJourneyId", "viewingJourneyId"]) {
      if (data.journeys[key] !== null && !ids.has(data.journeys[key])) fail(`${key} does not match a saved journey.`);
    }
    if (data.journeys.activeJourneyId && !data.journeys.journeys.some(j => j.id === data.journeys.activeJourneyId && j.status === "active")) fail("active journey is already completed.");
    return JSON.parse(JSON.stringify(data));
  }

  function encode(data) {
    const backup = { format: FORMAT, version: 1, createdAt: new Date().toISOString(), data };
    const json = JSON.stringify(backup, null, 2);
    // Always allow exporting the current tab, including after a storage quota failure.
    return json;
  }

  function parse(json) {
    if (new TextEncoder().encode(json).length > MAX_BYTES) throw new Error("Choose a backup smaller than 20 MB.");
    let raw;
    try { raw = JSON.parse(json); } catch (_) { throw new Error("This file is not valid JSON. No saved data was changed."); }
    return validate(raw);
  }

  // A backup spans several storage keys. Roll back every key on a failed write.
  function commit(storage, entries) {
    const previous = new Map();
    try {
      for (const [key] of entries) previous.set(key, storage.getItem(key));
      for (const [key, value] of entries) {
        if (value === null) storage.removeItem(key); else storage.setItem(key, value);
      }
      return { ok: true };
    } catch (error) {
      let rollbackFailed = false;
      for (const [key, value] of previous) {
        try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); }
        catch (_) { rollbackFailed = true; }
      }
      return { ok: false, rollbackFailed, error };
    }
  }

  global.PilgrimBackup = Object.freeze({ encode, parse, validate, commit, MAX_BYTES });
})(window);

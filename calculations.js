/*
 * Pilgrim Star Path — isolated calculation engine.
 *
 * The current build uses a transparent mock scale so that the UI can be
 * tested without an external API. Replace the constants or functions here
 * when the verified navigation rules are ready; app.js should not need to
 * change for normal presentation work.
 */
(function (global) {
  "use strict";

  const LY_PER_REGION = 188;
  const DEFAULT_PLANET = "0172";
  const GALAXY_CENTRE = Object.freeze({ x: 2047, y: 127, z: 2047 });

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function parseCoordinateBlock(value, label) {
    const trimmed = String(value).trim();
    if (!trimmed) throw new Error(`${label} is empty.`);
    const number = Number.parseInt(trimmed, 16);
    if (!Number.isFinite(number)) throw new Error(`${label} is not hexadecimal.`);
    return number;
  }

  /**
   * Accepts the familiar four-block address (ABCD:ABCD:ABCD:ABCD) or a
   * simple decimal triple (x, y, z). The fourth block is retained as planet.
   */
  function parseLocation(input) {
    const value = String(input || "").trim();
    if (!value) throw new Error("Enter a coordinate address first.");

    if (value.includes(":")) {
      const blocks = value.split(":").map((block) => block.trim());
      if (blocks.length !== 4 || blocks.some((block) => !/^[0-9a-f]{1,4}$/i.test(block))) {
        throw new Error("Use four hexadecimal blocks, for example 0432:0076:0D66:0172.");
      }
      return {
        x: parseCoordinateBlock(blocks[0], "X block"),
        y: parseCoordinateBlock(blocks[1], "Y block"),
        z: parseCoordinateBlock(blocks[2], "Z block"),
        planet: blocks[3].toUpperCase().padStart(4, "0"),
        address: blocks.map((block) => block.toUpperCase().padStart(4, "0")).join(":"),
        format: "hex",
      };
    }

    const parts = value.split(/[\s,]+/).filter(Boolean);
    if (parts.length !== 3 || parts.some((part) => !/^-?\d+(\.\d+)?$/.test(part))) {
      throw new Error("Use three decimal coordinates separated by commas or spaces.");
    }
    const [x, y, z] = parts.map(Number);
    return { x, y, z, planet: DEFAULT_PLANET, address: formatAddress({ x, y, z }, DEFAULT_PLANET), format: "decimal" };
  }

  function formatHex(value) {
    return Math.max(0, Math.round(Number(value) || 0)).toString(16).toUpperCase().padStart(4, "0");
  }

  function formatAddress(coords, planet) {
    const planetBlock = typeof planet === "string" && /^[0-9a-f]{1,4}$/i.test(planet)
      ? planet.toUpperCase().padStart(4, "0")
      : formatHex(planet || DEFAULT_PLANET);
    return [coords.x, coords.y, coords.z].map(formatHex).concat(planetBlock).join(":");
  }

  function vectorLength(vector) {
    return Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2);
  }

  function vectorBetween(from, to) {
    return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  }

  function distanceInRegions(from, to) {
    return vectorLength(vectorBetween(from, to));
  }

  function distanceInLy(from, to) {
    return distanceInRegions(from, to) * LY_PER_REGION;
  }

  function directionFromAngle(angle) {
    return angle >= 0 ? "right" : "left";
  }

  function normalizeBearing(degrees) {
    return ((degrees % 360) + 360) % 360;
  }

  /**
   * Compass bearing from north, clockwise, using the route vector. In this
   * coordinate convention +X is east and +Z points south on the map.
   */
  function bearingFromRoute(from, to) {
    const vector = vectorBetween(from, to);
    if (vector.x === 0 && vector.z === 0) return 0;
    return normalizeBearing((Math.atan2(vector.x, -vector.z) * 180) / Math.PI);
  }

  /**
   * Bearing on a dial whose zero-degree direction is the route from the ship
   * to a reference point, such as the galactic centre.
   */
  function bearingRelativeToReference(from, to, reference) {
    return normalizeBearing(bearingFromRoute(from, to) - bearingFromRoute(from, reference));
  }

  /**
   * Signed planar turn from the ship's centre-facing vector to its destination
   * vector. This matches the Pilgrim Star Path convention: look at the galaxy
   * centre, then turn left or right until the destination is ahead.
   */
  function angleFromCentre(user, target, centre) {
    const galaxyCentre = centre || GALAXY_CENTRE;
    const centreVector = vectorBetween(user, galaxyCentre);
    const targetVector = vectorBetween(user, target);
    if ((centreVector.x === 0 && centreVector.z === 0) || (targetVector.x === 0 && targetVector.z === 0)) {
      return 0;
    }
    const centreRadians = Math.atan2(centreVector.z, centreVector.x);
    const targetRadians = Math.atan2(targetVector.z, targetVector.x);
    let radians = targetRadians - centreRadians;
    while (radians > Math.PI) radians -= Math.PI * 2;
    while (radians <= -Math.PI) radians += Math.PI * 2;
    return round((radians * 180) / Math.PI, 2);
  }

  /**
   * Signed pitch from the galactic X/Z plane toward the target. Positive
   * values place the target above the plane, negative values below it.
   * The plane is the zero-angle reference for the approach graph.
   */
  function angleFromPlane(user, target) {
    const vector = vectorBetween(user, target);
    const planarDistance = Math.hypot(vector.x, vector.z);
    if (planarDistance === 0) {
      if (vector.y === 0) return 0;
      return round(vector.y > 0 ? 90 : -90, 2);
    }
    return round((Math.atan2(vector.y, planarDistance) * 180) / Math.PI, 2);
  }

  function calculateRoute(user, target, settings, centre) {
    const galaxyCentre = centre || GALAXY_CENTRE;
    const hyperdrive = Math.max(1, Number(settings?.hyperdrive) || 1600);
    const destinationDistance = distanceInLy(user, target);
    const centreDistance = distanceInLy(user, galaxyCentre);
    const signedAngle = angleFromCentre(user, target, galaxyCentre);
    const angleOfAttack = angleFromPlane(user, target);
    const centreBearing = bearingFromRoute(user, galaxyCentre);
    const galacticBearing = bearingRelativeToReference(user, target, galaxyCentre);
    const heightDiff = user.y - target.y;
    const regionHeight = Math.round(Math.abs(heightDiff));
    const direction = directionFromAngle(signedAngle);
    return {
      centreDistance,
      destinationDistance,
      estimatedJumps: Math.max(1, Math.ceil(destinationDistance / hyperdrive)),
      angle: Math.abs(signedAngle),
      signedAngle,
      angleOfAttack,
      direction,
      regionHeight,
      heightDirection: heightDiff >= 0 ? "above" : "below",
      vector: vectorBetween(user, target),
      linealDistance: distanceInRegions(user, target),
      routeBearing: round(bearingFromRoute(user, target), 2),
      centreBearing: round(centreBearing, 2),
      galacticBearing: round(galacticBearing, 2),
      trueNorthOffset: round(normalizeBearing(-centreBearing), 2),
      hyperdrive,
    };
  }

  function calculateBlackHoleRing(user, settings) {
    const gridSize = clamp(Number(settings?.gridSize) || 16, 8, 64);
    const radius = gridSize * 10;
    return {
      radius,
      diameter: radius * 2,
      center: { x: user.x, y: user.y, z: user.z },
      suggestedJump: round(radius * LY_PER_REGION, 3),
    };
  }

  function formatNumber(value, digits) {
    return Number(value || 0).toLocaleString("en-GB", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  global.PilgrimMath = Object.freeze({
    GALAXY_CENTRE,
    LY_PER_REGION,
    angleFromCentre,
    angleFromPlane,
    bearingRelativeToReference,
    calculateBlackHoleRing,
    calculateRoute,
    clamp,
    distanceInLy,
    distanceInRegions,
    bearingFromRoute,
    formatAddress,
    formatNumber,
    parseLocation,
    round,
    vectorBetween,
  });
})(window);

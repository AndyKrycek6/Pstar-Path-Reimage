/*
 * Pilgrim Star Path — dependency-free 3D canvas renderer.
 *
 * This is a lightweight perspective renderer rather than a second calculation
 * engine. Coordinates are projected here, while route maths stays in
 * calculations.js. It is deliberately self-contained so the static app still
 * works offline and does not need an external 3D API or library.
 */
(function (global) {
  "use strict";

  const TAU = Math.PI * 2;
  // Keep the initial 3D reference frame aligned with the 2D map and guidance:
  // +X reads right, +Z reads down, and larger navigation Y reads upward.
  // The true top view is the negative-Y side of the plane; full pitch still
  // allows deliberate orbiting above and below it.
  const MIN_PITCH = -1.48;
  const MAX_PITCH = 1.48;
  const TOP_VIEW_PITCH = -1.48;
  const MIN_DISTANCE = 1.1;
  const MAX_DISTANCE = 3.55;
  const DEFAULT_CAMERA = Object.freeze({ yaw: 0, pitch: TOP_VIEW_PITCH, distance: 3.55, panX: 0, panY: 0 });

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function makeStars(count) {
    let seed = 904117;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    return Array.from({ length: count }, () => ({
      x: (random() * 2 - 1) * 1.7,
      y: (random() * 2 - 1) * .64,
      z: (random() * 2 - 1) * 1.7,
      size: random() * 1.25 + .35,
      alpha: random() * .55 + .18,
      tone: random() > .88 ? "violet" : (random() > .93 ? "warm" : "blue"),
    }));
  }

  function create(canvas, options = {}) {
    if (!canvas || typeof canvas.getContext !== "function") return { supported: false };
    const ctx = canvas.getContext("2d");
    if (!ctx) return { supported: false };

    let width = 1;
    let height = 1;
    let pixelRatio = 1;
    let scene = {
      localMode: false,
      localRange: 16,
      centre: { x: 2047, y: 127, z: 2047 },
      user: { x: 0, y: 0, z: 0 },
      originReady: true,
      target: { x: 0, y: 0, z: 0 },
      targetName: "DESTINATION",
      targetReady: false,
      userInFrame: true,
      ringVisible: false,
      ringRadius: 0,
      journeyName: "",
      journeyPoints: [],
      pilgrim: null,
      showNametags: true,
    };
    let camera = { ...DEFAULT_CAMERA };
    let drag = null;
    let zoomFrame = 0;
    let zoomTargetDistance = DEFAULT_CAMERA.distance;
    const stars = makeStars(260);

    const requestFrame = (callback) => typeof global.requestAnimationFrame === "function"
      ? global.requestAnimationFrame(callback)
      : global.setTimeout(() => callback(Date.now()), 16);
    const cancelFrame = (frame) => {
      if (typeof global.cancelAnimationFrame === "function") global.cancelAnimationFrame(frame);
      else global.clearTimeout(frame);
    };

    canvas.style.touchAction = "none";

    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      pixelRatio = Math.min(global.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      render();
    }

    function setScene(nextScene) {
      scene = { ...scene, ...nextScene };
      render();
    }

    function reset() {
      if (zoomFrame) cancelFrame(zoomFrame);
      zoomFrame = 0;
      camera = { ...DEFAULT_CAMERA };
      zoomTargetDistance = camera.distance;
      render();
    }

    function notifyZoom() {
      if (typeof options.onZoom === "function") options.onZoom(camera.distance);
    }

    function animateZoom() {
      if (zoomFrame) return;
      const step = () => {
        const difference = zoomTargetDistance - camera.distance;
        if (Math.abs(difference) < .001) {
          camera.distance = zoomTargetDistance;
          zoomFrame = 0;
          render();
          notifyZoom();
          return;
        }
        camera.distance += difference * .2;
        render();
        notifyZoom();
        zoomFrame = requestFrame(step);
      };
      zoomFrame = requestFrame(step);
    }

    function zoom(delta) {
      zoomTargetDistance = clamp(zoomTargetDistance + delta, MIN_DISTANCE, MAX_DISTANCE);
      animateZoom();
    }

    function snapToUser() {
      if (!scene.originReady || !scene.user) return false;
      const point = worldFromCoords(scene.user);
      const yawCos = Math.cos(camera.yaw);
      const yawSin = Math.sin(camera.yaw);
      const frameZ = -point.z;
      const rotatedX = point.x * yawCos - frameZ * yawSin;
      const rotatedZ = point.x * yawSin + frameZ * yawCos;
      const pitchCos = Math.cos(camera.pitch);
      const pitchSin = Math.sin(camera.pitch);
      const rotatedY = point.y * pitchCos - rotatedZ * pitchSin;
      camera.panX = -rotatedX;
      camera.panY = -rotatedY;
      render();
      return true;
    }

    function getCamera() {
      return { ...camera };
    }

    function worldFromCoords(coords) {
      if (scene.localMode) {
        const range = Math.max(8, Number(scene.localRange) || 16);
        return {
          x: ((coords.x - scene.target.x) / range) * 2,
          y: ((coords.y - scene.target.y) / range) * .72,
          z: ((coords.z - scene.target.z) / range) * 2,
        };
      }
      return {
        x: ((coords.x - scene.centre.x) / 2048) * 1.36,
        y: ((coords.y - scene.centre.y) / 128) * .58,
        z: ((coords.z - scene.centre.z) / 2048) * 1.36,
      };
    }

    function project(point) {
      const yawCos = Math.cos(camera.yaw);
      const yawSin = Math.sin(camera.yaw);
      // Reflect the depth-plane Z basis so the 3D top view uses the same
      // +Z-down screen convention as the 2D map and route guidance.
      const frameZ = -point.z;
      const rotatedX = point.x * yawCos - frameZ * yawSin;
      const rotatedZ = point.x * yawSin + frameZ * yawCos;
      const pitchCos = Math.cos(camera.pitch);
      const pitchSin = Math.sin(camera.pitch);
      const rotatedY = point.y * pitchCos - rotatedZ * pitchSin;
      const depth = point.y * pitchSin + rotatedZ * pitchCos + camera.distance;
      if (depth <= .08) return null;
      const focal = Math.min(width, height) * .82;
      return {
        x: width / 2 + (rotatedX + camera.panX) * focal / depth,
        y: height / 2 - (rotatedY + camera.panY) * focal / depth,
        depth,
        scale: focal / depth,
      };
    }

    function drawBackground() {
      const background = ctx.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, "#020811");
      background.addColorStop(.52, "#061725");
      background.addColorStop(1, "#09091c");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);

      const blueGlow = ctx.createRadialGradient(width * .68, height * .36, 0, width * .68, height * .36, Math.max(width, height) * .7);
      blueGlow.addColorStop(0, "rgba(71,102,238,.19)");
      blueGlow.addColorStop(.52, "rgba(31,68,161,.08)");
      blueGlow.addColorStop(1, "rgba(4,10,22,0)");
      ctx.fillStyle = blueGlow;
      ctx.fillRect(0, 0, width, height);

      const violetGlow = ctx.createRadialGradient(width * .31, height * .7, 0, width * .31, height * .7, Math.max(width, height) * .52);
      violetGlow.addColorStop(0, "rgba(144,103,255,.14)");
      violetGlow.addColorStop(1, "rgba(30,14,70,0)");
      ctx.fillStyle = violetGlow;
      ctx.fillRect(0, 0, width, height);
    }

    function drawStars() {
      const projected = stars.map((star) => ({ star, point: project(star) })).filter((item) => item.point);
      projected.sort((a, b) => b.point.depth - a.point.depth);
      projected.forEach(({ star, point }) => {
        if (point.x < -8 || point.x > width + 8 || point.y < -8 || point.y > height + 8) return;
        const radius = clamp(star.size * (1.8 / point.depth), .35, 2.7);
        const colour = star.tone === "violet" ? "175,156,255" : star.tone === "warm" ? "255,210,160" : "155,221,255";
        ctx.fillStyle = `rgba(${colour},${star.alpha})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, TAU);
        ctx.fill();
      });
    }

    function drawSegment(from, to, colour, lineWidth = 1, dash = []) {
      const first = project(from);
      const second = project(to);
      if (!first || !second) return;
      ctx.save();
      ctx.strokeStyle = colour;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      ctx.lineTo(second.x, second.y);
      ctx.stroke();
      ctx.restore();
    }

    function drawGrid() {
      const local = scene.localMode;
      const limit = local ? 1 : 1.36;
      const gridLines = local ? Math.min(32, Math.max(8, Number(scene.localRange) || 16)) : 8;
      const step = limit * 2 / gridLines;
      for (let index = 0; index <= gridLines; index += 1) {
        const offset = -limit + index * step;
        drawSegment({ x: offset, y: 0, z: -limit }, { x: offset, y: 0, z: limit }, index === gridLines / 2 ? "rgba(100,232,255,.42)" : "rgba(54,198,223,.22)", index === gridLines / 2 ? 1.15 : .65);
        drawSegment({ x: -limit, y: 0, z: offset }, { x: limit, y: 0, z: offset }, index === gridLines / 2 ? "rgba(100,232,255,.42)" : "rgba(54,198,223,.22)", index === gridLines / 2 ? 1.15 : .65);
      }
      const origin = { x: 0, y: 0, z: 0 };
      drawSegment(origin, { x: limit + .12, y: 0, z: 0 }, "rgba(100,232,255,.72)", 1.2);
      drawSegment(origin, { x: 0, y: 0, z: limit + .12 }, "rgba(155,139,255,.72)", 1.2);
      drawSegment(origin, { x: 0, y: .72, z: 0 }, "rgba(245,169,108,.72)", 1.2);
      drawAxisLabel({ x: limit + .12, y: 0, z: 0 }, "X", "#64e8ff");
      drawAxisLabel({ x: 0, y: 0, z: limit + .12 }, "Z", "#9b8bff");
      drawAxisLabel({ x: 0, y: .72, z: 0 }, "Y", "#f5a96c");
    }

    function drawAxisLabel(point, label, colour) {
      const projected = project(point);
      if (!projected) return;
      ctx.save();
      ctx.fillStyle = colour;
      ctx.font = "700 10px Cascadia Mono, Consolas, monospace";
      ctx.fillText(label, projected.x + 5, projected.y - 4);
      ctx.restore();
    }

    function drawRoute() {
      if (!scene.originReady || !scene.user || !scene.targetReady || !scene.target) return;
      const user = worldFromCoords(scene.user);
      const target = worldFromCoords(scene.target);
      const centre = scene.localMode ? null : worldFromCoords(scene.centre);
      drawSegment(user, target, "rgba(100,232,255,.12)", 7);
      drawSegment(user, target, "#64e8ff", 1.8, [7, 5]);
      if (centre) drawSegment(user, centre, "rgba(155,139,255,.42)", 1, [3, 7]);
    }

    function drawRing() {
      if (!scene.originReady || !scene.user || !scene.ringVisible) return;
      const user = worldFromCoords(scene.user);
      const frameScale = scene.localMode
        ? Math.max(8, Number(scene.localRange) || 16) * 3
        : 2048 / 1.36;
      const radius = clamp((Number(scene.ringRadius) || 0) / frameScale, .08, .55);
      const projected = [];
      for (let index = 0; index <= 48; index += 1) {
        const angle = (index / 48) * TAU;
        const point = project({
          x: user.x + Math.cos(angle) * radius,
          y: user.y,
          z: user.z + Math.sin(angle) * radius,
        });
        if (point) projected.push(point);
      }
      if (projected.length < 2) return;
      ctx.save();
      ctx.strokeStyle = "rgba(245,169,108,.88)";
      ctx.lineWidth = 1.25;
      ctx.setLineDash([3, 7]);
      ctx.shadowColor = "rgba(245,169,108,.62)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      projected.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.restore();
    }

    function drawJourneyTrail() {
      const journeyPoints = Array.isArray(scene.journeyPoints) ? scene.journeyPoints : [];
      if (journeyPoints.length < 2) return;
      const projected = journeyPoints.map((coords) => project(worldFromCoords(coords)));
      ctx.save();
      ctx.strokeStyle = "rgba(65,220,166,.82)";
      ctx.lineWidth = 1.35;
      ctx.setLineDash([2, 5]);
      ctx.shadowColor = "rgba(65,220,166,.62)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      let segmentOpen = false;
      projected.forEach((point) => {
        if (!point) {
          segmentOpen = false;
          return;
        }
        if (segmentOpen) ctx.lineTo(point.x, point.y);
        else {
          ctx.moveTo(point.x, point.y);
          segmentOpen = true;
        }
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      projected.forEach((point, index) => {
        if (!point) return;
        ctx.fillStyle = index === 0 ? "#d4fff0" : "#41dca6";
        ctx.beginPath();
        ctx.arc(point.x, point.y, index === 0 ? 3.2 : 2.25, 0, TAU);
        ctx.fill();
      });
      ctx.restore();
    }

    function drawMarker(coords, colour, label, radius = 4.5, keepOnFrame = false, opacity = 1) {
      const projected = project(worldFromCoords(coords));
      if (!projected) return;
      const markerOpacity = Number.isFinite(opacity) ? clamp(opacity, 0, 1) : 1;
      const offFrame = projected.x < 0 || projected.x > width || projected.y < 0 || projected.y > height;
      if (!keepOnFrame && (projected.x < -80 || projected.x > width + 80 || projected.y < -80 || projected.y > height + 80)) return;
      if (keepOnFrame && offFrame) {
        projected.x = clamp(projected.x, 18, width - 18);
        projected.y = clamp(projected.y, 18, height - 18);
        label = `${label} · OFF FRAME`;
      }
      const markerRadius = clamp(radius * (projected.scale / 120), 3.5, 9);
      ctx.save();
      ctx.globalAlpha = .35 * markerOpacity;
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, markerRadius + 7, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = markerOpacity;
      ctx.fillStyle = colour;
      ctx.shadowColor = colour;
      ctx.shadowBlur = 13;
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, markerRadius, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = "600 10px Cascadia Mono, Consolas, monospace";
      const labelWidth = ctx.measureText(label).width;
      if (scene.showNametags !== false) {
        ctx.fillStyle = "rgba(2,10,18,.82)";
        ctx.fillRect(projected.x + 9, projected.y - 14, labelWidth + 10, 17);
        ctx.strokeStyle = "rgba(100,232,255,.22)";
        ctx.strokeRect(projected.x + 9, projected.y - 14, labelWidth + 10, 17);
        ctx.fillStyle = "#d9f8fb";
        ctx.fillText(label, projected.x + 14, projected.y - 3);
      }
      ctx.restore();
    }

    function render() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      drawBackground();
      drawStars();
      drawGrid();
      drawJourneyTrail();
      drawRing();
      drawRoute();
      if (!scene.localMode) drawMarker(scene.centre, "#9b8bff", "GALACTIC CENTRE", 5.5);
      if (scene.originReady && scene.user) drawMarker(scene.user, scene.userInFrame ? "#41dca6" : "#f5a96c", scene.userInFrame ? "USER LOCATION" : "USER · OFF FRAME");
      if (scene.pilgrim) drawMarker(scene.pilgrim.coords, "#64e8ff", scene.pilgrim.name || "PILGRIM STAR", 4.8, true, scene.pilgrim.opacity);
      if (scene.targetReady && scene.target) drawMarker(scene.target, "#f5a96c", scene.targetName || "DESTINATION");
    }

    canvas.addEventListener("pointerdown", (event) => {
      if (event.button === 2) return;
      event.preventDefault();
      drag = { x: event.clientX, y: event.clientY, pan: event.shiftKey || event.button === 1 };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("is-orbiting");
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (drag.pan) {
        const focal = Math.min(width, height) * .82;
        camera.panX += (dx / focal) * camera.distance;
        camera.panY -= (dy / focal) * camera.distance;
      } else {
        // Treat the canvas like a physical map: dragging right/down moves the
        // reference frame right/down, matching the 2D map's grab behaviour.
        camera.yaw -= dx * .008;
        camera.pitch = clamp(camera.pitch + dy * .008, MIN_PITCH, MAX_PITCH);
      }
      render();
    });
    const stopDrag = (event) => {
      if (!drag) return;
      drag = null;
      canvas.classList.remove("is-orbiting");
      try { canvas.releasePointerCapture(event.pointerId); } catch (_) { /* already released */ }
    };
    canvas.addEventListener("pointerup", stopDrag);
    canvas.addEventListener("pointercancel", stopDrag);
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      zoom(event.deltaY * .0024);
    }, { passive: false });
    canvas.addEventListener("dblclick", reset);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    global.addEventListener("resize", resize);

    return {
      supported: true,
      resize,
      setScene,
      reset,
      zoom,
      snapToUser,
      getCamera,
    };
  }

  global.Pilgrim3D = Object.freeze({ create });
})(window);

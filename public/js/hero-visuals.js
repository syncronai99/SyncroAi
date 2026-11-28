/* ============================================================
   HERO VISUALS — GitHub-style globe + thinking orb
   Dependency-free canvas versions for the static Syncro AI site.

   Performance notes:
   - Draw calls are batched into a few paths per frame instead of one
     call per dot/segment (3176 dots alone used to mean 3176 fills).
   - Canvas backing resolution is capped — glow art gains nothing from
     a 2x/3x device pixel ratio but costs 4x/9x the fill work.
   - Per-segment shadowBlur is replaced by a cheap wide translucent
     underlay; only the 8 arc heads still use a blur.
   - Geometry buffers are allocated once and mutated in place.
   ============================================================ */
(function () {
  'use strict';

  const globeCanvas = document.getElementById('globe-canvas');
  const orbCanvas = document.getElementById('orb-canvas');
  if (!globeCanvas || !orbCanvas) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const RAD = Math.PI / 180;
  const gctx = globeCanvas.getContext('2d');
  const octx = orbCanvas.getContext('2d');

  let heroVisible = true;
  let pageVisible = true;
  let lastFrame = 0;

  document.addEventListener('visibilitychange', () => { pageVisible = !document.hidden; });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      heroVisible = entries[0].isIntersecting;
    }, { threshold: 0.01 }).observe(document.getElementById('home'));
  }

  /* ---------------- SIZING ---------------- */

  const gSize = { w: 1, h: 1 };
  const oSize = { w: 1, h: 1 };

  function fit(canvas, ctx, size) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    size.w = Math.max(1, Math.round(rect.width));
    size.h = Math.max(1, Math.round(rect.height));
    const bw = Math.round(size.w * dpr);
    const bh = Math.round(size.h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resizeCanvases() {
    fit(globeCanvas, gctx, gSize);
    fit(orbCanvas, octx, oSize);
  }
  resizeCanvases();
  window.addEventListener('resize', resizeCanvases, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(resizeCanvases).observe(globeCanvas.parentElement);

  /* ---------------- SHARED GEOMETRY ---------------- */

  function toVec(lat, lng) {
    const phi = lat * RAD;
    const lambda = lng * RAD;
    const cp = Math.cos(phi);
    return { x: cp * Math.sin(lambda), y: Math.sin(phi), z: cp * Math.cos(lambda) };
  }

  function project(v, cx, cy, radius, cosR, sinR, cosT, sinT, out) {
    const x = v.x * cosR + v.z * sinR;
    const z0 = v.z * cosR - v.x * sinR;
    out.x = cx + x * radius;
    out.y = cy - (v.y * cosT - z0 * sinT) * radius;
    out.z = v.y * sinT + z0 * cosT;
    return out;
  }

  const makePoint = () => ({ x: 0, y: 0, z: 0, t: 0 });

  // Static lat/long wireframe vectors are built once, not every frame.
  const gridVectors = [];
  for (let lat = -60; lat <= 60; lat += 30) {
    const line = [];
    for (let s = 0; s <= 60; s++) line.push(toVec(lat, -180 + s * 6));
    gridVectors.push(line);
  }
  for (let lng = -180; lng < 180; lng += 30) {
    const line = [];
    for (let s = 0; s <= 29; s++) line.push(toVec(-88 + s * 6, lng));
    gridVectors.push(line);
  }
  const gridScreen = gridVectors.map(line => line.map(() => makePoint()));
  gridScreen.forEach(line => line.forEach((p, s) => { p.t = s / (line.length - 1); }));

  // Reused bucket scratch for every batched stroke/fill.
  const lineScratch = Array.from({ length: 5 }, () => []);
  const dotScratch = Array.from({ length: 6 }, () => []);
  const arcScratch = Array.from({ length: 6 }, () => []);
  const scratchVec = { x: 0, y: 0, z: 0 };

  // Draws a moving window of a line, batching segments by brightness so a
  // whole wireframe costs ~5 strokes instead of ~700.
  function strokeMovingLine(ctx, pts, head, trail, rgb, maxAlpha, width) {
    const tail = head - trail;
    for (const bucket of lineScratch) bucket.length = 0;
    for (let s = 1; s < pts.length; s++) {
      const prev = pts[s - 1];
      const cur = pts[s];
      if (prev.z <= 0 || cur.z <= 0) continue;
      if (cur.t < tail || cur.t > head) continue;
      const life = (cur.t - tail) / trail;
      lineScratch[Math.min(4, (life * 5) | 0)].push(prev, cur);
    }
    ctx.lineCap = 'round';
    for (let b = 0; b < lineScratch.length; b++) {
      const segs = lineScratch[b];
      if (!segs.length) continue;
      const life = (b + 0.5) / 5;
      ctx.strokeStyle = 'rgba(' + rgb + ',' + (Math.pow(life, 1.6) * maxAlpha).toFixed(3) + ')';
      ctx.lineWidth = width * (0.45 + life * 0.55);
      ctx.beginPath();
      for (let i = 0; i < segs.length; i += 2) {
        ctx.moveTo(segs[i].x, segs[i].y);
        ctx.lineTo(segs[i + 1].x, segs[i + 1].y);
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  /* ---------------- GLOBE ---------------- */

  let landPoints = [];
  let landScreen = [];
  let rotation = -0.55;
  let tilt = -0.14;
  let dragging = false;
  let lastPointer = null;

  // Each arc makes one trip: draw origin -> destination, fade out, pause.
  const ARC_TRAVEL = 3800;
  const ARC_FADE = 700;
  const ARC_PAUSE = 900;
  const ARC_CYCLE = ARC_TRAVEL + ARC_FADE + ARC_PAUSE;

  const arcs = [
    { from: [37.77, -122.42], to: [51.50, -0.12], alt: 0.34, color: '125,211,252' },
    { from: [40.71, -74.01], to: [1.35, 103.82], alt: 0.42, color: '56,189,248' },
    { from: [19.08, 72.88], to: [-33.87, 151.21], alt: 0.38, color: '186,230,253' },
    { from: [-23.55, -46.63], to: [35.68, 139.76], alt: 0.32, color: '125,211,252' },
    { from: [25.20, 55.27], to: [52.52, 13.40], alt: 0.24, color: '56,189,248' },
    { from: [6.52, 3.38], to: [40.71, -74.01], alt: 0.30, color: '186,230,253' },
    { from: [28.61, 77.21], to: [22.32, 114.17], alt: 0.20, color: '125,211,252' },
    { from: [-1.29, 36.82], to: [19.08, 72.88], alt: 0.23, color: '56,189,248' }
  ].map((arc, i) => {
    const a = toVec(arc.from[0], arc.from[1]);
    const b = toVec(arc.to[0], arc.to[1]);
    const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
    const omega = Math.acos(dot);
    const sinOmega = Math.sin(omega) || 1;
    const path = [];
    for (let s = 0; s <= 64; s++) {
      const t = s / 64;
      const f1 = Math.sin((1 - t) * omega) / sinOmega;
      const f2 = Math.sin(t * omega) / sinOmega;
      const x = a.x * f1 + b.x * f2;
      const y = a.y * f1 + b.y * f2;
      const z = a.z * f1 + b.z * f2;
      const len = Math.hypot(x, y, z) || 1;
      const lift = 1 + arc.alt * Math.sin(Math.PI * t);
      path.push({ x: x / len * lift, y: y / len * lift, z: z / len * lift, t });
    }
    return { ...arc, path, screen: path.map(makePoint), delay: i * 540 };
  });

  function loadLandPoints() {
    return fetch('/data/globe-points.json')
      .then(r => { if (!r.ok) throw new Error('globe data'); return r.json(); })
      .then(points => {
        landPoints = points.map(([lat, lng]) => toVec(lat, lng));
        landScreen = landPoints.map(makePoint);
      })
      .catch(() => { landPoints = []; landScreen = []; });
  }

  function drawGlobe(time, width, height) {
    const ctx = gctx;
    ctx.clearRect(0, 0, width, height);

    const cx = width * 0.5;
    const cy = height * 0.5;
    const radius = Math.min(width, height) * 0.375;

    const glow = ctx.createRadialGradient(cx, cy, radius * 0.82, cx, cy, radius * 1.34);
    glow.addColorStop(0, 'rgba(56,189,248,0.20)');
    glow.addColorStop(0.55, 'rgba(56,189,248,0.07)');
    glow.addColorStop(1, 'rgba(56,189,248,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.34, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(cx - radius * 0.34, cy - radius * 0.38, radius * 0.1, cx, cy, radius);
    body.addColorStop(0, 'rgba(12,74,110,0.42)');
    body.addColorStop(0.62, 'rgba(3,18,28,0.58)');
    body.addColorStop(1, 'rgba(0,4,8,0.9)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    const cosR = Math.cos(rotation), sinR = Math.sin(rotation);
    const cosT = Math.cos(tilt), sinT = Math.sin(tilt);

    // Latitude / longitude wireframe.
    let gridIndex = 0;
    for (let i = 0; i < gridVectors.length; i++) {
      const src = gridVectors[i];
      const dst = gridScreen[i];
      for (let s = 0; s < src.length; s++) project(src[s], cx, cy, radius, cosR, sinR, cosT, sinT, dst[s]);
      const head = reduceMotion ? 0.68 : ((time * 0.00007 + gridIndex * 0.13) % 1);
      strokeMovingLine(ctx, dst, head, 0.42, '125,211,252', 0.22, 0.8);
      gridIndex++;
    }

    // Continent dots: 6 depth buckets = 6 fills instead of ~1600.
    for (const bucket of dotScratch) bucket.length = 0;
    for (let i = 0; i < landPoints.length; i++) {
      const p = project(landPoints[i], cx, cy, radius, cosR, sinR, cosT, sinT, landScreen[i]);
      if (p.z <= 0.02) continue;
      dotScratch[Math.min(5, (p.z * 6) | 0)].push(p);
    }
    for (let b = 0; b < dotScratch.length; b++) {
      const pts = dotScratch[b];
      if (!pts.length) continue;
      const depth = (b + 0.5) / 6;
      const size = 0.65 + depth * 0.85;
      ctx.fillStyle = 'rgba(125,211,252,' + (0.18 + depth * 0.68).toFixed(3) + ')';
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        ctx.moveTo(pts[i].x + size, pts[i].y);
        ctx.arc(pts[i].x, pts[i].y, size, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Connection arcs: the line grows from origin to destination, vanishes
    // there, then a new trip begins. Segments on the far side of the sphere
    // stay hidden so the line is naturally occluded when it goes behind.
    arcs.forEach(arc => {
      const pts = arc.screen;
      for (let s = 0; s < arc.path.length; s++) {
        const p = project(arc.path[s], cx, cy, radius, cosR, sinR, cosT, sinT, pts[s]);
        p.t = arc.path[s].t;
      }

      let headT = 0;
      let lineAlpha = 0;
      let arriving = 0;
      if (reduceMotion) {
        headT = 1;
        lineAlpha = 0.7;
      } else {
        const phase = (time + arc.delay) % ARC_CYCLE;
        if (phase < ARC_TRAVEL) {
          const raw = phase / ARC_TRAVEL;
          headT = raw * raw * (3 - 2 * raw); // ease in and out at each city
          lineAlpha = 1;
        } else if (phase < ARC_TRAVEL + ARC_FADE) {
          headT = 1;
          const fade = (phase - ARC_TRAVEL) / ARC_FADE;
          lineAlpha = 1 - fade;
          arriving = 1 - fade;
        }
      }

      // Small city markers stay put; only the connecting line disappears.
      for (const endpoint of [pts[0], pts[pts.length - 1]]) {
        if (endpoint.z <= -0.05) continue;
        ctx.fillStyle = 'rgba(' + arc.color + ',0.85)';
        ctx.beginPath();
        ctx.arc(endpoint.x, endpoint.y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }

      if (lineAlpha <= 0.01 || headT <= 0) return;

      const headSeg = Math.max(1, Math.round(headT * (pts.length - 1)));
      for (const bucket of arcScratch) bucket.length = 0;
      for (let s = 1; s <= headSeg; s++) {
        const prev = pts[s - 1];
        const cur = pts[s];
        if (prev.z <= -0.05 || cur.z <= -0.05) continue;
        arcScratch[Math.min(5, ((s / headSeg) * 6) | 0)].push(prev, cur);
      }
      ctx.lineCap = 'round';
      for (let b = 0; b < arcScratch.length; b++) {
        const segs = arcScratch[b];
        if (!segs.length) continue;
        const life = (b + 0.5) / 6;
        const alpha = Math.pow(life, 1.35) * 0.95 * lineAlpha;
        ctx.beginPath();
        for (let j = 0; j < segs.length; j += 2) {
          ctx.moveTo(segs[j].x, segs[j].y);
          ctx.lineTo(segs[j + 1].x, segs[j + 1].y);
        }
        ctx.strokeStyle = 'rgba(' + arc.color + ',' + (alpha * 0.16).toFixed(3) + ')';
        ctx.lineWidth = 3.2;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(' + arc.color + ',' + alpha.toFixed(3) + ')';
        ctx.lineWidth = 0.5 + life * 1.6;
        ctx.stroke();
      }
      ctx.lineCap = 'butt';

      // Bright travelling head, fades out together with the line.
      const hp = pts[headSeg];
      if (hp && hp.z > -0.05 && headT < 1) {
        ctx.fillStyle = 'rgba(' + arc.color + ',' + (0.18 * lineAlpha).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,' + (0.98 * lineAlpha).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // One ripple on arrival, then the connection is gone until next trip.
      if (arriving > 0) {
        const dest = pts[pts.length - 1];
        if (dest.z > -0.05) {
          ctx.strokeStyle = 'rgba(' + arc.color + ',' + (arriving * 0.55).toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(dest.x, dest.y, 4 + (1 - arriving) * 9, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    });

    ctx.strokeStyle = 'rgba(125,211,252,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* ---------------- THINKING ORB ---------------- */

  const BANDS = 7;
  const STEPS = 42;
  const orbBands = Array.from({ length: BANDS }, () =>
    Array.from({ length: STEPS + 1 }, () => makePoint()));
  orbBands.forEach(line => line.forEach((p, s) => { p.t = s / STEPS; }));

  function drawOrb(time, width, height) {
    const ctx = octx;
    ctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.36;

    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.55);
    halo.addColorStop(0, 'rgba(125,211,252,0.18)');
    halo.addColorStop(1, 'rgba(125,211,252,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(125,211,252,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.12, 0, Math.PI * 2);
    ctx.stroke();

    const spin = reduceMotion ? 0.4 : time * 0.00042;
    const cosR = Math.cos(spin), sinR = Math.sin(spin);
    const cosT = Math.cos(-0.42), sinT = Math.sin(-0.42);

    for (let band = -3; band <= 3; band++) {
      const pts = orbBands[band + 3];
      for (let s = 0; s <= STEPS; s++) {
        const lng = (s / STEPS) * Math.PI * 2 + band * 0.16;
        const wave = Math.sin(lng * 3 + time * 0.0017 + band * 0.8) * 0.055;
        const r = 1 + wave;
        const phi = band * 0.23 + Math.sin(lng * 2 - time * 0.0011 + band) * 0.045;
        const cp = Math.cos(phi);
        scratchVec.x = cp * Math.sin(lng) * r;
        scratchVec.y = Math.sin(phi) * r;
        scratchVec.z = cp * Math.cos(lng) * r;
        project(scratchVec, cx, cy, radius, cosR, sinR, cosT, sinT, pts[s]);
      }
      const head = reduceMotion ? 0.62 : ((time * 0.00024 + (band + 3) * 0.12) % 1);
      strokeMovingLine(ctx, pts, head, 0.48, '125,211,252', 0.32, 0.9);
    }

    // Orb dots: back-to-front depth buckets, one fill per bucket.
    for (const bucket of dotScratch) bucket.length = 0;
    for (let b = 0; b < orbBands.length; b++) {
      const line = orbBands[b];
      for (let i = 0; i < line.length; i++) {
        const p = line[i];
        const depth = (p.z + 1.1) / 2.2;
        if (depth <= 0) continue;
        dotScratch[Math.min(5, (depth * 6) | 0)].push(p);
      }
    }
    for (let b = 0; b < dotScratch.length; b++) {
      const pts = dotScratch[b];
      if (!pts.length) continue;
      const depth = (b + 0.5) / 6;
      const alpha = Math.max(0.12, Math.min(1, depth));
      const size = 0.55 + Math.max(0, depth) * 0.75;
      ctx.fillStyle = depth > 0.62
        ? 'rgba(224,247,255,' + alpha.toFixed(3) + ')'
        : 'rgba(56,189,248,' + alpha.toFixed(3) + ')';
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        ctx.moveTo(pts[i].x + size, pts[i].y);
        ctx.arc(pts[i].x, pts[i].y, size, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  /* ---------------- INTERACTION + LOOP ---------------- */

  globeCanvas.addEventListener('pointerdown', e => {
    dragging = true;
    lastPointer = { x: e.clientX, y: e.clientY };
    globeCanvas.setPointerCapture(e.pointerId);
    globeCanvas.classList.add('dragging');
  });
  globeCanvas.addEventListener('pointermove', e => {
    if (!dragging || !lastPointer) return;
    rotation += (e.clientX - lastPointer.x) * 0.006;
    tilt = Math.max(-0.6, Math.min(0.6, tilt - (e.clientY - lastPointer.y) * 0.004));
    lastPointer = { x: e.clientX, y: e.clientY };
  });
  const endDrag = () => { dragging = false; lastPointer = null; globeCanvas.classList.remove('dragging'); };
  globeCanvas.addEventListener('pointerup', endDrag);
  globeCanvas.addEventListener('pointercancel', endDrag);

  function frame(time) {
    requestAnimationFrame(frame);
    // Keep the clock current while hidden so returning to the tab doesn't
    // produce one big jump in rotation.
    if (!heroVisible || !pageVisible) { lastFrame = time; return; }
    const elapsed = time - lastFrame;
    if (elapsed < (reduceMotion ? 100 : 16)) return;
    const dt = lastFrame ? Math.min(elapsed, 64) : 16;
    lastFrame = time;
    if (!dragging && !reduceMotion) rotation += dt * 0.0001;

    drawGlobe(time, gSize.w, gSize.h);
    drawOrb(time, oSize.w, oSize.h);
  }

  loadLandPoints().then(() => requestAnimationFrame(frame));
})();

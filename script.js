/* Meridional Raytracer (2D) — TVL Lens Builder (RAYS ONLY + MERIT + OPTIMIZER)
   - Keeps: surface table, edit actions, raytracing, PL overlay, autofocus, save/load.
   - Adds: hard feasibility constraints + robust merit + optimizer (random/anneal) + "Apply best".
   - Safe: runs optimizer in RAF chunks (won't freeze tab).
*/

(() => {
  "use strict";

  // -------------------- kill scroll restoration --------------------
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch(_) {}
  window.scrollTo(0, 0);

  // -------------------- tiny helpers --------------------
  const $ = (sel) => document.querySelector(sel);
  const clone = (obj) =>
    typeof structuredClone === "function" ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const clamp01 = (x) => clamp(x, 0, 1);

  function num(v, fallback = 0) {
    const s = String(v ?? "").trim().replace(",", ".");
    const x = parseFloat(s);
    return Number.isFinite(x) ? x : fallback;
  }

  function randf(a, b) { return a + Math.random() * (b - a); }
  function randi(a, b) { return Math.floor(randf(a, b + 1)); }
  function choice(arr) { return arr[(Math.random() * arr.length) | 0]; }

  // -------------------- canvas (RAYS) --------------------
  const canvas = $("#canvas");
  const ctx = canvas?.getContext("2d");

  // -------------------- UI --------------------
  const ui = {
    tbody: $("#surfTbody"),
    status: $("#statusText"),

    efl: $("#badgeEfl"),
    bfl: $("#badgeBfl"),
    tstop: $("#badgeT"),
    vig: $("#badgeVig"),
    fov: $("#badgeFov"),
    cov: $("#badgeCov"),
    merit: $("#badgeMerit"),

    footerWarn: $("#footerWarn"),
    metaInfo: $("#metaInfo"),

    eflTop: $("#badgeEflTop"),
    bflTop: $("#badgeBflTop"),
    tstopTop: $("#badgeTTop"),
    fovTop: $("#badgeFovTop"),
    covTop: $("#badgeCovTop"),
    meritTop: $("#badgeMeritTop"), // optional, might not exist

    sensorPreset: $("#sensorPreset"),
    sensorW: $("#sensorW"),
    sensorH: $("#sensorH"),

    fieldAngle: $("#fieldAngle"),
    rayCount: $("#rayCount"),
    wavePreset: $("#wavePreset"),
    sensorOffset: $("#sensorOffset"),
    focusMode: $("#focusMode"),
    lensFocus: $("#lensFocus"),
    renderScale: $("#renderScale"),

    btnScaleToFocal: $("#btnScaleToFocal"),
    btnSetTStop: $("#btnSetTStop"),
    btnNew: $("#btnNew"),
    btnLoadOmit: $("#btnLoadOmit"),
    btnLoadDemo: $("#btnLoadDemo"),
    btnAdd: $("#btnAdd"),
    btnAddElement: $("#btnAddElement"),
    btnDuplicate: $("#btnDuplicate"),
    btnMoveUp: $("#btnMoveUp"),
    btnMoveDown: $("#btnMoveDown"),
    btnRemove: $("#btnRemove"),
    btnSave: $("#btnSave"),
    fileLoad: $("#fileLoad"),
    btnAutoFocus: $("#btnAutoFocus"),

    btnRaysFS: $("#btnRaysFS"),
    raysPane: $("#raysPane"),

    toastHost: $("#toastHost"),

    leftScroll: $(".leftScroll"),
    panelHeader: $(".panelHeader"),
    toolbar: $(".toolbar"),
  };

  function toast(msg, ms = 2200) {
    if (!ui.toastHost) return;
    const d = document.createElement("div");
    d.className = "toast";
    d.textContent = String(msg || "");
    ui.toastHost.appendChild(d);
    setTimeout(() => {
      d.style.opacity = "0";
      d.style.transform = "translateY(6px)";
      setTimeout(() => d.remove(), 250);
    }, ms);
  }

  // -------------------- sensor presets --------------------
  const SENSOR_PRESETS = {
    "ARRI Alexa Mini (S35)": { w: 28.25, h: 18.17 },
    "ARRI Alexa Mini LF (LF)": { w: 36.7, h: 25.54 },
    "Sony VENICE (FF)": { w: 36.0, h: 24.0 },
    "Fuji GFX (MF)": { w: 43.8, h: 32.9 },
  };

  function populateSensorPresetsSelect() {
    if (!ui.sensorPreset) return;
    const keys = Object.keys(SENSOR_PRESETS);
    ui.sensorPreset.innerHTML = keys.map((k) => `<option value="${k}">${k}</option>`).join("");
    if (!SENSOR_PRESETS[ui.sensorPreset.value]) ui.sensorPreset.value = "ARRI Alexa Mini LF (LF)";
  }

  function getSensorWH() {
    const w = Number(ui.sensorW?.value || 36.7);
    const h = Number(ui.sensorH?.value || 25.54);
    return { w, h, halfH: Math.max(0.1, h * 0.5), halfW: Math.max(0.1, w * 0.5) };
  }

  // -------------------- glass db --------------------
  const GLASS_DB = {
    AIR: { nd: 1.0, Vd: 999.0 },

    "N-BK7HT":   { nd: 1.5168,  Vd: 64.17 },
    "N-BK10":    { nd: 1.49782, Vd: 66.95 },

    "N-K5":      { nd: 1.52249, Vd: 59.48 },
    "N-KF9":     { nd: 1.52346, Vd: 51.54 },
    "N-PK52A":   { nd: 1.49700, Vd: 81.61 },
    "N-ZK7A":    { nd: 1.508054, Vd: 61.04 },

    "N-BAK1":    { nd: 1.5725,  Vd: 57.55 },
    "N-BAK2":    { nd: 1.53996, Vd: 59.71 },
    "N-BAK4":    { nd: 1.56883, Vd: 55.98 },

    "N-BALF4":   { nd: 1.57956, Vd: 53.87 },
    "N-BALF5":   { nd: 1.54739, Vd: 53.63 },

    "N-BAF4":    { nd: 1.60568, Vd: 43.72 },
    "N-BAF10":   { nd: 1.67003, Vd: 47.11 },
    "N-BAF51":   { nd: 1.65224, Vd: 44.96 },
    "N-BAF52":   { nd: 1.60863, Vd: 46.6 },
    "N-BASF2":   { nd: 1.66446, Vd: 36.0 },

    "N-SK2":     { nd: 1.60738, Vd: 56.65 },
    "N-SK4":     { nd: 1.61272, Vd: 58.63 },
    "N-SK5":     { nd: 1.58913, Vd: 61.27 },
    "N-SK11":    { nd: 1.56384, Vd: 60.8 },
    "N-SK14":    { nd: 1.60311, Vd: 60.6 },
    "N-SK16":    { nd: 1.62041, Vd: 60.32 },

    "N-SSK2":    { nd: 1.62229, Vd: 53.27 },
    "N-SSK5":    { nd: 1.65844, Vd: 50.88 },
    "N-SSK8":    { nd: 1.61773, Vd: 49.83 },

    "N-PSK3":    { nd: 1.55232, Vd: 63.46 },
    "N-PSK53A":  { nd: 1.61800, Vd: 63.39 },

    "N-KZFS2":   { nd: 1.55836, Vd: 54.01 },
    "N-KZFS4":   { nd: 1.61336, Vd: 44.49 },
    "N-KZFS5":   { nd: 1.65412, Vd: 39.7 },
    "N-KZFS8":   { nd: 1.72047, Vd: 34.7 },

    "N-LAK9":    { nd: 1.69100, Vd: 54.71 },
    "N-LAK10":   { nd: 1.72003, Vd: 50.62 },
    "N-LAK22":   { nd: 1.65113, Vd: 55.89 },
    "N-LAK28":   { nd: 1.74429, Vd: 50.77 },
    "N-LAK34":   { nd: 1.72916, Vd: 54.5 },

    "N-LAF2":    { nd: 1.74397, Vd: 44.85 },
    "N-LAF7":    { nd: 1.7495,  Vd: 34.82 },
    "N-LAF21":   { nd: 1.7880,  Vd: 47.49 },
    "N-LAF34":   { nd: 1.7725,  Vd: 49.62 },

    "N-LASF9":   { nd: 1.85025, Vd: 32.17 },
    "N-LASF40":  { nd: 1.83404, Vd: 37.3 },
    "N-LASF41":  { nd: 1.83501, Vd: 43.13 },
    "N-LASF43":  { nd: 1.8061,  Vd: 40.61 },
    "N-LASF44":  { nd: 1.8042,  Vd: 46.5 },
    "N-LASF45":  { nd: 1.80107, Vd: 34.97 },

    "N-F2":      { nd: 1.62005, Vd: 36.43 },
    "N-FK5":     { nd: 1.48749, Vd: 70.41 },
    "N-FK58":    { nd: 1.45600, Vd: 90.9 },

    "N-SF1":     { nd: 1.71736, Vd: 29.62 },
    "N-SF2":     { nd: 1.64769, Vd: 33.82 },
    "N-SF4":     { nd: 1.75513, Vd: 27.38 },
    "N-SF5":     { nd: 1.67271, Vd: 32.25 },
    "N-SF6":     { nd: 1.80518, Vd: 25.36 },
    "N-SF8":     { nd: 1.68894, Vd: 31.31 },
    "N-SF10":    { nd: 1.72828, Vd: 28.53 },
    "N-SF11":    { nd: 1.78472, Vd: 25.68 },
    "N-SF15":    { nd: 1.69892, Vd: 30.2 },
    "N-SF57":    { nd: 1.84666, Vd: 23.78 },
    "N-SF66":    { nd: 1.92286, Vd: 20.88 },
  };

  // Wavelengths (nm)
  const WL = { C: 656.2725, d: 587.5618, F: 486.1327, g: 435.8343 };

  function fitCauchyFrom3(nC, nd, nF){
    const lC = WL.C / 1000, ld = WL.d / 1000, lF = WL.F / 1000;
    const M = [
      [1, 1/(lC*lC), 1/(lC*lC*lC*lC)],
      [1, 1/(ld*ld), 1/(ld*ld*ld*ld)],
      [1, 1/(lF*lF), 1/(lF*lF*lF*lF)],
    ];
    const y = [nC, nd, nF];

    const A = M.map(r=>r.slice());
    const b = y.slice();
    for (let i=0;i<3;i++){
      let piv=i;
      for (let r=i+1;r<3;r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv=r;
      if (piv!==i){ [A[i],A[piv]]=[A[piv],A[i]]; [b[i],b[piv]]=[b[piv],b[i]]; }

      const div = A[i][i] || 1e-12;
      for (let j=i;j<3;j++) A[i][j] /= div;
      b[i] /= div;

      for (let r=0;r<3;r++){
        if (r===i) continue;
        const f = A[r][i];
        for (let j=i;j<3;j++) A[r][j] -= f*A[i][j];
        b[r] -= f*b[i];
      }
    }
    return { A:b[0], B:b[1], C:b[2] };
  }

  function cauchyN_um(cfit, lambda_um){
    const L2 = lambda_um*lambda_um;
    return cfit.A + cfit.B/L2 + cfit.C/(L2*L2);
  }

  const GLASS_ALIASES = {
    BK7: "N-BK7HT",
    F2: "N-F2",
    LASF35: "N-LASF43",
    LASFN31: "N-LASF43",
    LF5: "N-SF5",
    "S-LAM3": "N-LAK9",
    "S-BAH11": "N-BAK4",
  };

  function resolveGlassName(name) {
    if (!name) return "AIR";
    if (GLASS_DB[name]) return name;
    const alias = GLASS_ALIASES[name];
    if (alias && GLASS_DB[alias]) return alias;
    return "AIR";
  }

  const _cauchyCache = new Map();
  const _glassWarned = new Set();
  function warnMissingGlass(name) {
    if (_glassWarned.has(name)) return;
    _glassWarned.add(name);
    console.warn(`[GLASS_DB] Unknown glass "${name}" (resolved to AIR). Add alias or DB entry.`);
  }

  function wavePresetToLambdaNm(w){
    const ww = String(w || "d");
    if (ww === "c" || ww === "C") return WL.C;
    if (ww === "F") return WL.F;
    if (ww === "g") return WL.g;
    return WL.d;
  }

  function glassN(glassName, wavePresetOrNm = "d") {
    const lambdaNm =
      (typeof wavePresetOrNm === "number" && Number.isFinite(wavePresetOrNm))
        ? wavePresetOrNm
        : wavePresetToLambdaNm(wavePresetOrNm);

    const key = resolveGlassName(glassName);
    if (key === "AIR" && glassName !== "AIR") warnMissingGlass(glassName);
    if (key === "AIR") return 1.0;

    const g = GLASS_DB[key];
    const nd = Number(g.nd || 1.5168);
    const Vd = Math.max(10, Number(g.Vd || 50));
    const dN = (nd - 1) / Vd; // nF - nC (approx)
    const nF = nd + 0.6 * dN;
    const nC = nd - 0.4 * dN;

    const cacheKey = key + "::cauchy";
    let fit = _cauchyCache.get(cacheKey);
    if (!fit){
      fit = fitCauchyFrom3(nC, nd, nF);
      _cauchyCache.set(cacheKey, fit);
    }
    return cauchyN_um(fit, lambdaNm / 1000);
  }

  // -------------------- built-in lenses --------------------
  function demoLensSimple() {
    return {
      name: "Demo (simple)",
      surfaces: [
        { type: "OBJ", R: 0.0, t: 0.0, ap: 22.0, glass: "AIR", stop: false },
        { type: "1", R: 42.0, t: 10.0, ap: 22.0, glass: "N-LASF43", stop: false },
        { type: "2", R: -140.0, t: 10.0, ap: 21.0, glass: "AIR", stop: false },
        { type: "3", R: -30.0, t: 10.0, ap: 19.0, glass: "N-LASF43", stop: false },
        { type: "STOP", R: 0.0, t: 10.0, ap: 14.0, glass: "AIR", stop: true },
        { type: "5", R: 12.42, t: 10.0, ap: 8.5, glass: "AIR", stop: false },
        { type: "7", R: -18.93, t: 10.0, ap: 11.0, glass: "N-SF5", stop: false },
        { type: "8", R: 59.6, t: 10.0, ap: 13.0, glass: "N-LASF43", stop: false },
        { type: "9", R: -40.49, t: 10.0, ap: 13.0, glass: "AIR", stop: false },
        { type: "IMS", R: 0.0, t: 0.0, ap: 12.0, glass: "AIR", stop: false },
      ],
    };
  }

  function omit50ConceptV1() {
    return {
      name: "OMIT 50mm (concept v1 — scaled Double-Gauss base)",
      notes: [
        "Geometric sanity base for this 2D meridional tracer.",
        "Not optimized; coatings/stop/entrance pupil not modeled.",
      ],
      surfaces: [
        { type: "OBJ", R: 0.0, t: 0.0, ap: 60.0, glass: "AIR", stop: false },

        { type: "1", R: 37.4501, t: 4.49102, ap: 16.46707, glass: "N-LAK9", stop: false },
        { type: "2", R: 135.07984, t: 0.40, ap: 16.46707, glass: "AIR", stop: false },

        { type: "3", R: 19.59581, t: 8.23852, ap: 13.72255, glass: "N-BALF4", stop: false },
        { type: "4", R: 0.0, t: 1.20, ap: 12.22555, glass: "N-SF5", stop: false },

        { type: "5", R: 12.7994, t: 5.48403, ap: 9.73054, glass: "AIR", stop: false },

        { type: "STOP", R: 0.0, t: 6.48703, ap: 9.28144, glass: "AIR", stop: true },

        { type: "7", R: -15.90319, t: 3.50798, ap: 9.23154, glass: "N-SF5", stop: false },
        { type: "8", R: 0.0, t: 4.48104, ap: 10.47904, glass: "N-LAK9", stop: false },
        { type: "9", R: -21.71158, t: 0.40, ap: 10.47904, glass: "AIR", stop: false },

        { type: "10", R: 110.3493, t: 3.98204, ap: 11.47705, glass: "N-BALF4", stop: false },
        { type: "11", R: -44.30639, t: 30.6477, ap: 11.47705, glass: "AIR", stop: false },

        { type: "IMS", R: 0.0, t: 0.0, ap: 12.77, glass: "AIR", stop: false },
      ],
    };
  }

  // -------------------- sanitize/load --------------------
  function sanitizeLens(obj) {
    const safe = {
      name: String(obj?.name ?? "No name"),
      notes: Array.isArray(obj?.notes) ? obj.notes.map(String) : [],
      surfaces: Array.isArray(obj?.surfaces) ? obj.surfaces : [],
    };

    safe.surfaces = safe.surfaces.map((s) => ({
      type: String(s?.type ?? ""),
      R: Number(s?.R ?? 0),
      t: Number(s?.t ?? 0),
      ap: Number(s?.ap ?? 10),
      glass: String(s?.glass ?? "AIR"),
      stop: Boolean(s?.stop ?? false),
    }));

    const firstStop = safe.surfaces.findIndex((s) => s.stop);
    if (firstStop >= 0) safe.surfaces.forEach((s, i) => { if (i !== firstStop) s.stop = false; });

    safe.surfaces.forEach((s, i) => { if (!s.type || !s.type.trim()) s.type = String(i); });

    if (safe.surfaces.length >= 1) {
      safe.surfaces[0].type = "OBJ";
      safe.surfaces[0].t = 0.0;
      safe.surfaces[0].glass = "AIR";
    }
    if (safe.surfaces.length >= 1) {
      safe.surfaces[safe.surfaces.length - 1].type = "IMS";
      safe.surfaces[safe.surfaces.length - 1].glass = "AIR";
      safe.surfaces[safe.surfaces.length - 1].t = 0.0;
    }

    return safe;
  }

  let lens = sanitizeLens(omit50ConceptV1());
  let selectedIndex = 0;

  function applySensorToIMS() {
    const { halfH } = getSensorWH();
    const ims = lens?.surfaces?.[lens.surfaces.length - 1];
    if (ims && String(ims.type).toUpperCase() === "IMS") {
      ims.ap = halfH;
      const i = lens.surfaces.length - 1;
      const apInput = ui.tbody?.querySelector(`input.cellInput[data-k="ap"][data-i="${i}"]`);
      if (apInput) apInput.value = Number(ims.ap || 0).toFixed(2);
    }
  }

  function applySensorToIMSOnSurfaces(surfaces) {
    const { halfH } = getSensorWH();
    const ims = surfaces?.[surfaces.length - 1];
    if (ims && String(ims.type).toUpperCase() === "IMS") ims.ap = halfH;
  }

  function applyPreset(name) {
    const p = SENSOR_PRESETS[name] || SENSOR_PRESETS["ARRI Alexa Mini LF (LF)"];
    if (ui.sensorW) ui.sensorW.value = p.w.toFixed(2);
    if (ui.sensorH) ui.sensorH.value = p.h.toFixed(2);
    applySensorToIMS();
  }

  function loadLens(obj) {
    lens = sanitizeLens(obj);
    selectedIndex = 0;
    clampAllApertures(lens.surfaces);
    buildTable();
    applySensorToIMS();
    renderAll();
  }

  // -------------------- table helpers --------------------
  function clampSelected() {
    selectedIndex = Math.max(0, Math.min(lens.surfaces.length - 1, selectedIndex));
  }
  function isProtectedIndex(i) {
    const t = String(lens.surfaces[i]?.type || "").toUpperCase();
    return t === "OBJ" || t === "IMS";
  }
  function enforceSingleStop(changedIndex) {
    if (!lens.surfaces[changedIndex]?.stop) return;
    lens.surfaces.forEach((s, i) => { if (i !== changedIndex) s.stop = false; });
  }

  let _focusMemo = null;
  function rememberTableFocus() {
    const a = document.activeElement;
    if (!a) return;
    if (!(a.classList && a.classList.contains("cellInput"))) return;
    _focusMemo = {
      i: a.dataset.i,
      k: a.dataset.k,
      ss: typeof a.selectionStart === "number" ? a.selectionStart : null,
      se: typeof a.selectionEnd === "number" ? a.selectionEnd : null,
    };
  }
  function restoreTableFocus() {
    if (!_focusMemo || !ui.tbody) return;
    const sel = `input.cellInput[data-i="${_focusMemo.i}"][data-k="${_focusMemo.k}"]`;
    const el = ui.tbody.querySelector(sel);
    if (!el) return;
    el.focus({ preventScroll: true });
    if (_focusMemo.ss != null && _focusMemo.se != null) {
      try { el.setSelectionRange(_focusMemo.ss, _focusMemo.se); } catch (_) {}
    }
    _focusMemo = null;
  }

  // -------------------- table build + events --------------------
  function buildTable() {
    clampSelected();
    if (!ui.tbody) return;

    rememberTableFocus();
    ui.tbody.innerHTML = "";

    const glassOptions = Object.keys(GLASS_DB);

    lens.surfaces.forEach((s, idx) => {
      const tr = document.createElement("tr");
      tr.classList.toggle("selected", idx === selectedIndex);

      tr.addEventListener("click", (ev) => {
        if (["INPUT", "SELECT", "OPTION", "TEXTAREA"].includes(ev.target.tagName)) return;
        selectedIndex = idx;
        buildTable();
      });

      const isOBJ = String(s.type || "").toUpperCase() === "OBJ";
      const isIMS = String(s.type || "").toUpperCase() === "IMS";

      tr.innerHTML = `
        <td style="width:34px; font-family:var(--mono)">${idx}</td>
        <td style="width:72px"><input class="cellInput" data-k="type" data-i="${idx}" value="${s.type}"></td>
        <td style="width:92px"><input class="cellInput" data-k="R" data-i="${idx}" type="number" step="0.01" value="${s.R}"></td>
        <td style="width:92px">
          <input class="cellInput" data-k="t" data-i="${idx}" type="number" step="0.01"
            value="${isOBJ || isIMS ? 0 : s.t}" ${(isOBJ || isIMS) ? "disabled" : ""}>
        </td>
        <td style="width:92px"><input class="cellInput" data-k="ap" data-i="${idx}" type="number" step="0.01" value="${s.ap}"></td>
        <td style="width:110px">
          <select class="cellSelect" data-k="glass" data-i="${idx}" ${(isOBJ || isIMS) ? "disabled" : ""}>
            ${glassOptions.map((name) =>
              `<option value="${name}" ${name === s.glass ? "selected" : ""}>${name}</option>`
            ).join("")}
          </select>
        </td>
        <td class="cellChk" style="width:58px">
          <input type="checkbox" data-k="stop" data-i="${idx}" ${s.stop ? "checked" : ""} ${isOBJ || isIMS ? "disabled" : ""}>
        </td>
      `;
      ui.tbody.appendChild(tr);
    });

    ui.tbody.querySelectorAll("input.cellInput").forEach((el) => {
      el.addEventListener("input", onCellInput);
      el.addEventListener("change", onCellCommit);
      el.addEventListener("blur", onCellCommit);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); onCellCommit(e); }
      });
    });
    ui.tbody.querySelectorAll("select.cellSelect").forEach((el) => el.addEventListener("change", onCellCommit));
    ui.tbody.querySelectorAll('input[type="checkbox"][data-k="stop"]').forEach((el) => el.addEventListener("change", onCellCommit));

    restoreTableFocus();
  }

  function onCellInput(e) {
    const el = e.target;
    const i = Number(el.dataset.i);
    const k = el.dataset.k;
    if (!Number.isFinite(i) || !k) return;

    selectedIndex = i;
    const s = lens.surfaces[i];
    if (!s) return;

    const t0 = String(s.type || "").toUpperCase();
    if ((t0 === "OBJ" || t0 === "IMS") && k === "t") {
      s.t = 0.0;
      el.value = "0";
      scheduleRenderAll();
      return;
    }

    if (k === "type") s.type = el.value;
    else if (k === "R" || k === "t" || k === "ap") s[k] = num(el.value, s[k] ?? 0);

    applySensorToIMS();
    scheduleRenderAll();
  }

  function onCellCommit(e) {
    const el = e.target;
    const i = Number(el.dataset.i);
    const k = el.dataset.k;
    if (!Number.isFinite(i) || !k) return;

    selectedIndex = i;
    const s = lens.surfaces[i];
    if (!s) return;

    const t0 = String(s.type || "").toUpperCase();
    if ((t0 === "OBJ" || t0 === "IMS") && k === "t") {
      s.t = 0.0;
      el.value = "0";
    }

    if (k === "stop") {
      s.stop = !!el.checked;
      enforceSingleStop(i);
    } else if (k === "glass") {
      s.glass = String(el.value || "AIR");
    } else if (k === "type") {
      s.type = String(el.value || "");
    } else if (k === "R" || k === "t" || k === "ap") {
      s[k] = num(el.value, s[k] ?? 0);
    }

    lens = sanitizeLens(lens);
    applySensorToIMS();
    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
  }

  // -------------------- math helpers --------------------
  function normalize(v) {
    const m = Math.hypot(v.x, v.y);
    if (m < 1e-12) return { x: 0, y: 0 };
    return { x: v.x / m, y: v.y / m };
  }
  function dot(a, b) { return a.x * b.x + a.y * b.y; }
  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
  function mul(a, s) { return { x: a.x * s, y: a.y * s }; }

  function refract(I, N, n1, n2) {
    I = normalize(I);
    N = normalize(N);
    if (dot(I, N) > 0) N = mul(N, -1);
    const cosi = -dot(N, I);
    const eta = n1 / n2;
    const k = 1 - eta * eta * (1 - cosi * cosi);
    if (k < 0) return null;
    const T = add(mul(I, eta), mul(N, eta * cosi - Math.sqrt(k)));
    return normalize(T);
  }

  function intersectSurface(ray, surf) {
    const vx = surf.vx;
    const R = Number(surf.R || 0);
    const ap = Math.max(0, Number(surf.ap || 0));

    if (Math.abs(R) < 1e-9) {
      if (Math.abs(ray.d.x) < 1e-12) return null;
      const t = (vx - ray.p.x) / ray.d.x;
      if (!Number.isFinite(t) || t <= 1e-9) return null;
      const hit = add(ray.p, mul(ray.d, t));
      const vignetted = Math.abs(hit.y) > ap + 1e-9;
      const N = { x: -1, y: 0 };
      return { hit, t, vignetted, normal: N };
    }

    const cx = vx + R;
    const rad = Math.abs(R);

    const px = ray.p.x - cx;
    const py = ray.p.y;
    const dx = ray.d.x;
    const dy = ray.d.y;

    const A = dx * dx + dy * dy;
    const B = 2 * (px * dx + py * dy);
    const C = px * px + py * py - rad * rad;

    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;

    const sdisc = Math.sqrt(disc);
    const t1 = (-B - sdisc) / (2 * A);
    const t2 = (-B + sdisc) / (2 * A);

    let t = null;
    if (t1 > 1e-9 && t2 > 1e-9) t = Math.min(t1, t2);
    else if (t1 > 1e-9) t = t1;
    else if (t2 > 1e-9) t = t2;
    else return null;

    const hit = add(ray.p, mul(ray.d, t));
    const vignetted = Math.abs(hit.y) > ap + 1e-9;
    const Nout = normalize({ x: hit.x - cx, y: hit.y });
    return { hit, t, vignetted, normal: Nout };
  }

  function computeVertices(surfaces, lensShift = 0, sensorX = 0) {
    let x = 0;
    for (let i = 0; i < surfaces.length; i++) {
      surfaces[i].vx = x;
      x += Number(surfaces[i].t || 0);
    }

    const imsIdx = surfaces.findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
    if (imsIdx >= 0) {
      const shiftAll = (Number(sensorX) || 0) - (surfaces[imsIdx].vx || 0);
      for (let i = 0; i < surfaces.length; i++) surfaces[i].vx += shiftAll;
    }

    if (Number.isFinite(lensShift) && Math.abs(lensShift) > 1e-12) {
      for (let i = 0; i < surfaces.length; i++) {
        const t = String(surfaces[i]?.type || "").toUpperCase();
        if (t !== "IMS") surfaces[i].vx += lensShift;
      }
    }
    return x;
  }

  function findStopSurfaceIndex(surfaces) {
    return surfaces.findIndex((s) => !!s.stop);
  }

  // -------------------- physical sanity clamps --------------------
  const AP_SAFETY = 0.90;
  const AP_MAX_PLANE = 30.0;
  const AP_MIN = 0.01;

  function maxApForSurface(s) {
    const R = Number(s?.R || 0);
    if (!Number.isFinite(R) || Math.abs(R) < 1e-9) return AP_MAX_PLANE;
    return Math.max(AP_MIN, Math.abs(R) * AP_SAFETY);
  }

  function clampSurfaceAp(s) {
    if (!s) return;
    const t = String(s.type || "").toUpperCase();
    if (t === "IMS" || t === "OBJ") return;
    const lim = maxApForSurface(s);
    const ap = Number(s.ap || 0);
    s.ap = Math.max(AP_MIN, Math.min(ap, lim));
  }

  function clampAllApertures(surfaces) {
    if (!Array.isArray(surfaces)) return;
    for (const s of surfaces) clampSurfaceAp(s);
  }

  function surfaceXatY(s, y) {
    const vx = s.vx;
    const R = Number(s.R || 0);
    if (Math.abs(R) < 1e-9) return vx;

    const cx = vx + R;
    const rad = Math.abs(R);
    const sign = Math.sign(R) || 1;
    const inside = rad * rad - y * y;
    if (inside < 0) return null;
    return cx - sign * Math.sqrt(inside);
  }

  function maxNonOverlappingSemiDiameter(sFront, sBack, minCT = 0.10) {
    const apGuess = Math.max(0.01, Math.min(Number(sFront.ap || 0), Number(sBack.ap || 0)));
    function gapAt(y) {
      const xf = surfaceXatY(sFront, y);
      const xb = surfaceXatY(sBack, y);
      if (xf == null || xb == null) return -1e9;
      return xb - xf;
    }
    if (gapAt(0) < minCT) return 0.01;
    if (gapAt(apGuess) >= minCT) return apGuess;

    let lo = 0, hi = apGuess;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) * 0.5;
      if (gapAt(mid) >= minCT) lo = mid;
      else hi = mid;
    }
    return Math.max(0.01, lo);
  }

  // -------------------- tracing --------------------
  function traceRayForward(ray, surfaces, wavePreset, opts = {}) {
    const skipIMS = !!opts.skipIMS;

    let pts = [];
    let vignetted = false;
    let tir = false;

    pts.push({ x: ray.p.x, y: ray.p.y });

    let nBefore = 1.0;

    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const type = String(s?.type || "").toUpperCase();
      const isIMS = type === "IMS";
      const isMECH = type === "MECH" || type === "BAFFLE" || type === "HOUSING";

      if (skipIMS && isIMS) continue;

      const hitInfo = intersectSurface(ray, s);
      if (!hitInfo) { vignetted = true; break; }

      pts.push(hitInfo.hit);

      if (!isIMS && hitInfo.vignetted) { vignetted = true; break; }

      if (isIMS || isMECH) {
        ray = { p: hitInfo.hit, d: ray.d };
        continue;
      }

      const nAfter = glassN(String(s.glass || "AIR"), wavePreset);

      if (Math.abs(nAfter - nBefore) < 1e-9) {
        ray = { p: hitInfo.hit, d: ray.d };
        nBefore = nAfter;
        continue;
      }

      const newDir = refract(ray.d, hitInfo.normal, nBefore, nAfter);
      if (!newDir) { tir = true; break; }

      ray = { p: hitInfo.hit, d: newDir };
      nBefore = nAfter;
    }

    return { pts, vignetted, tir, endRay: ray };
  }

  // -------------------- ray bundles --------------------
  function getRayReferencePlane(surfaces) {
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx >= 0) {
      const s = surfaces[stopIdx];
      return { xRef: s.vx, apRef: Math.max(1e-3, Number(s.ap || 10) * 0.98), refIdx: stopIdx };
    }
    let refIdx = 1;
    if (!surfaces[refIdx] || String(surfaces[refIdx].type).toUpperCase() === "IMS") refIdx = 0;
    const s = surfaces[refIdx] || surfaces[0];
    return { xRef: s.vx, apRef: Math.max(1e-3, Number(s.ap || 10) * 0.98), refIdx };
  }

  function buildRays(surfaces, fieldAngleDeg, count) {
    const n = Math.max(3, Math.min(101, count | 0));
    const theta = (fieldAngleDeg * Math.PI) / 180;
    const dir = normalize({ x: Math.cos(theta), y: Math.sin(theta) });

    const xStart = (surfaces[0]?.vx ?? 0) - 80;
    const { xRef, apRef } = getRayReferencePlane(surfaces);

    const hMax = apRef * 0.98;
    const rays = [];
    const tanT = Math.abs(dir.x) < 1e-9 ? 0 : dir.y / dir.x;

    for (let k = 0; k < n; k++) {
      const a = (k / (n - 1)) * 2 - 1;
      const yAtRef = a * hMax;
      const y0 = yAtRef - tanT * (xRef - xStart);
      rays.push({ p: { x: xStart, y: y0 }, d: dir });
    }
    return rays;
  }

  function buildChiefRay(surfaces, fieldAngleDeg) {
    const theta = (fieldAngleDeg * Math.PI) / 180;
    const dir = normalize({ x: Math.cos(theta), y: Math.sin(theta) });

    const xStart = (surfaces[0]?.vx ?? 0) - 120;
    const stopIdx = findStopSurfaceIndex(surfaces);
    const stopSurf = stopIdx >= 0 ? surfaces[stopIdx] : surfaces[0];
    const xStop = stopSurf.vx;

    const tanT = Math.abs(dir.x) < 1e-9 ? 0 : dir.y / dir.x;
    const y0 = 0 - tanT * (xStop - xStart);
    return { p: { x: xStart, y: y0 }, d: dir };
  }

  function rayHitYAtX(endRay, x) {
    if (!endRay?.d || Math.abs(endRay.d.x) < 1e-9) return null;
    const t = (x - endRay.p.x) / endRay.d.x;
    if (!Number.isFinite(t)) return null;
    return endRay.p.y + t * endRay.d.y;
  }

  function coverageTestMaxFieldDeg(surfaces, wavePreset, sensorX, halfH) {
    let lo = 0, hi = 60, best = 0;
    for (let iter = 0; iter < 18; iter++) {
      const mid = (lo + hi) * 0.5;
      const ray = buildChiefRay(surfaces, mid);
      const tr = traceRayForward(clone(ray), surfaces, wavePreset);
      if (!tr || tr.vignetted || tr.tir) { hi = mid; continue; }

      const y = rayHitYAtX(tr.endRay, sensorX);
      if (y == null) { hi = mid; continue; }
      if (Math.abs(y) <= halfH) { best = mid; lo = mid; }
      else hi = mid;
    }
    return best;
  }

  // -------------------- EFL/BFL (paraxial-ish) --------------------
  function lastPhysicalVertexX(surfaces) {
    let maxX = -Infinity;
    for (const s of surfaces || []) {
      const t = String(s?.type || "").toUpperCase();
      if (t === "IMS") continue;
      if (!Number.isFinite(s.vx)) continue;
      maxX = Math.max(maxX, s.vx);
    }
    return Number.isFinite(maxX) ? maxX : 0;
  }
  function firstPhysicalVertexX(surfaces) {
    if (!surfaces?.length) return 0;
    let minX = Infinity;
    for (const s of surfaces) {
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      if (!Number.isFinite(s.vx)) continue;
      minX = Math.min(minX, s.vx);
    }
    return Number.isFinite(minX) ? minX : (surfaces[0]?.vx ?? 0);
  }

  function estimateEflBflParaxial(surfaces, wavePreset) {
    const lastVx = lastPhysicalVertexX(surfaces);
    const xStart = (surfaces[0]?.vx ?? 0) - 160;

    const heights = [0.25, 0.5, 0.75, 1.0, 1.25];
    const fVals = [];
    const xCrossVals = [];

    for (const y0 of heights) {
      const ray = { p: { x: xStart, y: y0 }, d: normalize({ x: 1, y: 0 }) };
      const tr = traceRayForward(clone(ray), surfaces, wavePreset, { skipIMS: true });
      if (!tr || tr.vignetted || tr.tir || !tr.endRay) continue;

      const er = tr.endRay;
      const dx = er.d.x, dy = er.d.y;
      if (Math.abs(dx) < 1e-12) continue;

      const uOut = dy / dx;
      if (Math.abs(uOut) < 1e-12) continue;

      const f = -y0 / uOut;
      if (Number.isFinite(f)) fVals.push(f);

      if (Math.abs(dy) > 1e-12) {
        const t = -er.p.y / dy;
        const xCross = er.p.x + t * dx;
        if (Number.isFinite(xCross)) xCrossVals.push(xCross);
      }
    }

    if (fVals.length < 2) return { efl: null, bfl: null };
    const efl = fVals.reduce((a, b) => a + b, 0) / fVals.length;

    let bfl = null;
    if (xCrossVals.length >= 2) {
      const xF = xCrossVals.reduce((a, b) => a + b, 0) / xCrossVals.length;
      bfl = xF - lastVx;
    }
    return { efl, bfl };
  }

  function estimateTStopApprox(efl, surfaces) {
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return null;
    const stopAp = Math.max(1e-6, Number(surfaces[stopIdx].ap || 0));
    if (!Number.isFinite(efl) || efl <= 0) return null;
    const T = efl / (2 * stopAp);
    return Number.isFinite(T) ? T : null;
  }

  // -------------------- FOV --------------------
  function rad2deg(r) { return (r * 180) / Math.PI; }
  function computeFovDeg(efl, sensorW, sensorH) {
    if (!Number.isFinite(efl) || efl <= 0) return null;
    const diag = Math.hypot(sensorW, sensorH);
    const hfov = 2 * Math.atan(sensorW / (2 * efl));
    const vfov = 2 * Math.atan(sensorH / (2 * efl));
    const dfov = 2 * Math.atan(diag / (2 * efl));
    return { hfov: rad2deg(hfov), vfov: rad2deg(vfov), dfov: rad2deg(dfov) };
  }

  function coversSensorYesNo({ fov, maxField, mode = "diag", marginDeg = 0.5 }) {
    if (!fov || !Number.isFinite(maxField)) return { ok: false, req: null };
    let req = null;
    if (mode === "h") req = fov.hfov * 0.5;
    else if (mode === "v") req = fov.vfov * 0.5;
    else req = fov.dfov * 0.5;
    const ok = maxField + marginDeg >= req;
    return { ok, req };
  }

  // -------------------- RMS spot metric --------------------
  function spotRmsAtSensorX(traces, sensorX) {
    const ys = [];
    for (const tr of traces) {
      if (!tr || tr.tir) continue;
      if (tr.vignetted) continue;
      const y = rayHitYAtX(tr.endRay, sensorX);
      if (y == null) continue;
      ys.push(y);
    }
    if (ys.length < 5) return { rms: null, n: ys.length };
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    const rms = Math.sqrt(ys.reduce((acc, y) => acc + (y - mean) ** 2, 0) / ys.length);
    return { rms, n: ys.length };
  }

  // -------------------- FEASIBILITY (hard constraints) --------------------
  const PL_FFD = 52.0;
  const PL_LENS_LIP = 3.0;

  const FEAS = {
    minAir: 0.20,
    minGlass: 0.80,
    minEdge: 0.20,
    minRadiusAbs: 6.0,
    maxAp: 30.0,
    maxTotalLen: 240.0,
    maxSurfaces: 18,
    maxVigFracHard: 0.25,
  };

  function isFeasible(surfaces, sensorX, wavePreset, rayCount, halfH) {
    if (!Array.isArray(surfaces) || surfaces.length < 3) return { ok: false, reason: "No surfaces" };
    if (surfaces.length > FEAS.maxSurfaces) return { ok: false, reason: "Too many surfaces" };

    const st = findStopSurfaceIndex(surfaces);
    if (st < 0) return { ok: false, reason: "No STOP" };

    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const t = String(s.type || "").toUpperCase();

      if (t !== "OBJ" && t !== "IMS") {
        if (!Number.isFinite(s.ap) || s.ap <= 0) return { ok: false, reason: "Bad aperture" };
        if (s.ap > FEAS.maxAp) return { ok: false, reason: "Ap too big" };
      }

      if (t !== "OBJ" && t !== "IMS" && Math.abs(Number(s.R || 0)) > 1e-9) {
        if (Math.abs(s.R) < FEAS.minRadiusAbs) return { ok: false, reason: "Radius too small" };
      }

      if (t !== "OBJ" && t !== "IMS") {
        if (!Number.isFinite(s.t) || s.t <= 0) return { ok: false, reason: "Bad thickness" };
      }
    }

    for (let i = 0; i < surfaces.length - 1; i++) {
      const a = surfaces[i];
      const b = surfaces[i + 1];
      const ta = String(a.type || "").toUpperCase();
      const tb = String(b.type || "").toUpperCase();
      if (ta === "OBJ" || tb === "OBJ") continue;
      if (ta === "IMS" || tb === "IMS") continue;

      const mediumAfterA = String(a.glass || "AIR").toUpperCase();
      const gap = Number(a.t || 0);

      if (mediumAfterA === "AIR") {
        if (gap < FEAS.minAir) return { ok: false, reason: "Air gap too thin" };
      } else {
        if (gap < FEAS.minGlass) return { ok: false, reason: "Glass too thin" };

        const apRegion = Math.max(0.01, Math.min(a.ap || 0, b.ap || 0, maxApForSurface(a), maxApForSurface(b)));
        if (Math.abs(a.R) > 1e-9 && Math.abs(b.R) > 1e-9) {
          const nonOverlap = maxNonOverlappingSemiDiameter(a, b, FEAS.minEdge);
          if (nonOverlap + 1e-6 < apRegion * 0.95) return { ok: false, reason: "Overlap/edge thin" };
        }
      }
    }

    const plX = -PL_FFD;
    const rearVx = lastPhysicalVertexX(surfaces);
    const intrusion = rearVx - plX;
    if (Number.isFinite(intrusion) && intrusion > 0) return { ok: false, reason: "Rear intrusion" };

    const frontVx = firstPhysicalVertexX(surfaces);
    const lenToFlange = plX - frontVx;
    const totalLen = lenToFlange + PL_LENS_LIP;
    if (Number.isFinite(totalLen) && totalLen > FEAS.maxTotalLen) return { ok: false, reason: "Too long" };

    computeVertices(surfaces, 0, sensorX);
    const rays = buildRays(surfaces, 0, rayCount);
    const traces = rays.map((r) => traceRayForward(clone(r), surfaces, wavePreset));
    const vCount = traces.filter((t) => t.vignetted).length;
    const vigFrac = traces.length ? vCount / traces.length : 1;
    if (vigFrac > FEAS.maxVigFracHard) return { ok: false, reason: `Too much vignette (${Math.round(vigFrac*100)}%)` };

    const maxField = coverageTestMaxFieldDeg(surfaces, wavePreset, sensorX, halfH);
    if (!Number.isFinite(maxField) || maxField < 1.0) return { ok: false, reason: "No coverage" };

    return { ok: true, reason: "OK" };
  }

  // -------------------- MERIT --------------------
  const MERIT = {
    rmsNorm: 0.03,
    vigWeight: 80.0,
    covPenalty: 200.0,
    tirPenalty: 200.0,
    rayDropPenalty: 400.0,
    lengthWeight: 0.01,
    stopApWeight: 0.002,
    fieldWeights: [1.0, 1.6, 2.3],
  };

  function traceBundleAtField(surfaces, fieldDeg, rayCount, wavePreset, sensorX){
    const rays = buildRays(surfaces, fieldDeg, rayCount);
    const traces = rays.map((r) => traceRayForward(clone(r), surfaces, wavePreset));
    const vCount = traces.filter((t) => t.vignetted).length;
    const tirCount = traces.filter((t) => t.tir).length;
    const vigFrac = traces.length ? (vCount / traces.length) : 1;
    const { rms, n } = spotRmsAtSensorX(traces, sensorX);
    return { traces, rms, n, vigFrac, vCount, tirCount };
  }

  function computeMeritV2({ surfaces, wavePreset, sensorX, rayCount, sensorW, sensorH }){
    const { halfH } = getSensorWH();
    const { efl } = estimateEflBflParaxial(surfaces, wavePreset);
    const fov = computeFovDeg(efl, sensorW, sensorH);

    const maxField = coverageTestMaxFieldDeg(surfaces, wavePreset, sensorX, halfH);
    const covMode = "v";
    const { ok: covers, req } = coversSensorYesNo({ fov, maxField, mode: covMode, marginDeg: 0.5 });

    const edge = Number.isFinite(req) ? Math.min(maxField, req) : maxField;
    const fields = [0, edge * 0.65, edge * 0.95];

    let merit = 0;
    let rmsCenter = null, rmsEdge = null;
    let vigAvg = 0;
    let tirAny = 0;
    let validMin = 999;

    for (let k = 0; k < fields.length; k++){
      const fa = fields[k];
      const pack = traceBundleAtField(surfaces, fa, rayCount, wavePreset, sensorX);

      validMin = Math.min(validMin, pack.n || 0);
      vigAvg += pack.vigFrac / fields.length;
      if (pack.tirCount > 0) tirAny = 1;

      const rms = Number.isFinite(pack.rms) ? pack.rms : 999;
      if (k === 0) rmsCenter = rms;
      if (k === fields.length - 1) rmsEdge = rms;

      const rn = rms / MERIT.rmsNorm;
      merit += MERIT.fieldWeights[k] * (rn * rn);
    }

    merit += MERIT.vigWeight * (vigAvg * vigAvg);
    if (!covers) merit += MERIT.covPenalty;
    if (tirAny) merit += MERIT.tirPenalty;
    if (validMin < 9) merit += MERIT.rayDropPenalty;

    const plX = -PL_FFD;
    const frontVx = firstPhysicalVertexX(surfaces);
    const totalLen = (plX - frontVx) + PL_LENS_LIP;
    if (Number.isFinite(totalLen)) merit += MERIT.lengthWeight * (totalLen * totalLen);

    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx >= 0) {
      const ap = Math.max(0.01, Number(surfaces[stopIdx].ap || 0));
      merit += MERIT.stopApWeight * (ap * ap);
    }

    return {
      merit,
      breakdown: { efl, maxField, covers, req, rmsCenter, rmsEdge, vigPct: Math.round(vigAvg * 100), fields }
    };
  }

  // -------------------- autofocus --------------------
  function autoFocus() {
    if (ui.focusMode) ui.focusMode.value = "lens";
    if (ui.sensorOffset) ui.sensorOffset.value = "0";

    const fieldAngle = Number(ui.fieldAngle?.value || 0);
    const rayCount = Number(ui.rayCount?.value || 31);
    const wavePreset = ui.wavePreset?.value || "d";

    const currentLensShift = Number(ui.lensFocus?.value || 0);
    const sensorX = 0.0;

    const range = 20;
    const coarseStep = 0.25;
    const fineStep = 0.05;

    let best = { shift: currentLensShift, rms: Infinity, n: 0 };

    function evalShift(shift) {
      computeVertices(lens.surfaces, shift, sensorX);
      const rays = buildRays(lens.surfaces, fieldAngle, rayCount);
      const traces = rays.map((r) => traceRayForward(clone(r), lens.surfaces, wavePreset));
      return spotRmsAtSensorX(traces, sensorX);
    }

    function scan(center, halfRange, step) {
      const start = center - halfRange;
      const end = center + halfRange;
      for (let sh = start; sh <= end + 1e-9; sh += step) {
        const { rms, n } = evalShift(sh);
        if (rms == null) continue;
        if (rms < best.rms) best = { shift: sh, rms, n };
      }
    }

    scan(currentLensShift, range, coarseStep);
    if (Number.isFinite(best.rms)) scan(best.shift, 2.0, fineStep);

    if (!Number.isFinite(best.rms) || best.n < 5) {
      if (ui.footerWarn) ui.footerWarn.textContent =
        "Auto focus (lens) failed (too few valid rays). Try more rays / larger apertures.";
      computeVertices(lens.surfaces, currentLensShift, sensorX);
      renderAll();
      return;
    }

    if (ui.lensFocus) ui.lensFocus.value = best.shift.toFixed(2);
    if (ui.footerWarn) ui.footerWarn.textContent =
      `Auto focus (LENS): lensFocus=${best.shift.toFixed(2)}mm • RMS=${best.rms.toFixed(3)}mm • rays=${best.n}`;

    renderAll();
  }

  // -------------------- drawing --------------------
  let view = { panX: 0, panY: 0, zoom: 1.0, dragging: false, lastX: 0, lastY: 0 };

  function drawBackgroundCSS(w, h) {
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = "#05070c";
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;

    const step = 80;
    for (let x = 0; x <= w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.restore();
  }

  function resizeCanvasToCSS() {
    if (!canvas || !ctx) return;
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(2, Math.floor(r.width * dpr));
    canvas.height = Math.max(2, Math.floor(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function worldToScreen(p, world) {
    const { cx, cy, s } = world;
    return { x: cx + p.x * s, y: cy - p.y * s };
  }

  function makeWorldTransform() {
    if (!canvas) return { cx: 0, cy: 0, s: 1 };
    const r = canvas.getBoundingClientRect();
    const cx = r.width / 2 + view.panX;
    const cy = r.height / 2 + view.panY;
    const base = Number(ui.renderScale?.value || 1.25) * 3.2;
    const s = base * view.zoom;
    return { cx, cy, s };
  }

  function drawAxes(world) {
    if (!ctx) return;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.beginPath();
    const p1 = worldToScreen({ x: -240, y: 0 }, world);
    const p2 = worldToScreen({ x: 800, y: 0 }, world);
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    ctx.restore();
  }

  function buildSurfacePolyline(s, ap, steps = 90) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const y = -ap + (i / steps) * (2 * ap);
      const x = surfaceXatY(s, y);
      if (x == null) continue;
      pts.push({ x, y });
    }
    return pts;
  }

  function drawElementBody(world, sFront, sBack, apRegion) {
    if (!ctx) return;
    const front = buildSurfacePolyline(sFront, apRegion, 90);
    const back  = buildSurfacePolyline(sBack,  apRegion, 90);
    if (front.length < 2 || back.length < 2) return;

    const poly = front.concat(back.slice().reverse());

    ctx.save();
    ctx.fillStyle = "rgba(120,180,255,0.10)";
    ctx.beginPath();
    let p0 = worldToScreen(poly[0], world);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < poly.length; i++) {
      const p = worldToScreen(poly[i], world);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath(); ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(220,235,255,0.55)";
    ctx.shadowColor = "rgba(70,140,255,0.35)";
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();
  }

  function drawElementsClosed(world, surfaces) {
    for (let i = 0; i < surfaces.length - 1; i++) {
      const sA = surfaces[i];
      const sB = surfaces[i + 1];

      const typeA = String(sA.type || "").toUpperCase();
      const typeB = String(sB.type || "").toUpperCase();
      if (typeA === "OBJ" || typeB === "OBJ") continue;
      if (typeA === "IMS" || typeB === "IMS") continue;

      const medium = String(sA.glass || "AIR").toUpperCase();
      if (medium === "AIR") continue;

      const apA = Math.max(0, Number(sA.ap || 0));
      const apB = Math.max(0, Number(sB.ap || 0));
      const limA = maxApForSurface(sA);
      const limB = maxApForSurface(sB);

      let apRegion = Math.max(0.01, Math.min(apA, apB, limA, limB));
      if (Math.abs(sA.R) > 1e-9 && Math.abs(sB.R) > 1e-9) {
        const nonOverlap = maxNonOverlappingSemiDiameter(sA, sB, 0.10);
        apRegion = Math.min(apRegion, nonOverlap);
      }

      drawElementBody(world, sA, sB, apRegion);
    }
  }

  function drawSurface(world, s) {
    if (!ctx) return;
    ctx.save();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = "rgba(255,255,255,.22)";

    const vx = s.vx;
    const ap = Math.min(Math.max(0, Number(s.ap || 0)), maxApForSurface(s));

    if (Math.abs(s.R) < 1e-9) {
      const a = worldToScreen({ x: vx, y: -ap }, world);
      const b = worldToScreen({ x: vx, y: ap }, world);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.restore();
      return;
    }

    const R = Number(s.R || 0);
    const cx = vx + R;
    const rad = Math.abs(R);
    const sign = Math.sign(R) || 1;

    const steps = 90;
    ctx.beginPath();
    let moved = false;
    for (let i = 0; i <= steps; i++) {
      const y = -ap + (i / steps) * (2 * ap);
      const inside = rad * rad - y * y;
      if (inside < 0) continue;
      const x = cx - sign * Math.sqrt(inside);
      const sp = worldToScreen({ x, y }, world);
      if (!moved) { ctx.moveTo(sp.x, sp.y); moved = true; }
      else ctx.lineTo(sp.x, sp.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawLens(world, surfaces) {
    drawElementsClosed(world, surfaces);
    for (const s of surfaces) drawSurface(world, s);
  }

  function drawRays(world, rayTraces, sensorX) {
    if (!ctx) return;
    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "rgba(70,140,255,0.85)";
    ctx.shadowColor = "rgba(70,140,255,0.45)";
    ctx.shadowBlur = 12;

    for (const tr of rayTraces) {
      if (!tr.pts || tr.pts.length < 2) continue;
      ctx.globalAlpha = tr.vignetted ? 0.10 : 1.0;

      ctx.beginPath();
      const p0 = worldToScreen(tr.pts[0], world);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < tr.pts.length; i++) {
        const p = worldToScreen(tr.pts[i], world);
        ctx.lineTo(p.x, p.y);
      }

      const last = tr.endRay;
      if (last && Number.isFinite(sensorX) && last.d && Math.abs(last.d.x) > 1e-9) {
        const t = (sensorX - last.p.x) / last.d.x;
        if (t > 0) {
          const hit = add(last.p, mul(last.d, t));
          const ps = worldToScreen(hit, world);
          ctx.lineTo(ps.x, ps.y);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStop(world, surfaces) {
    if (!ctx) return;
    const idx = findStopSurfaceIndex(surfaces);
    if (idx < 0) return;
    const s = surfaces[idx];
    const ap = Math.max(0, s.ap);
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#b23b3b";
    const a = worldToScreen({ x: s.vx, y: -ap }, world);
    const b = worldToScreen({ x: s.vx, y: ap }, world);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  }

  function drawSensor(world, sensorX, halfH) {
    if (!ctx) return;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.setLineDash([6, 6]);

    const a = worldToScreen({ x: sensorX, y: -halfH }, world);
    const b = worldToScreen({ x: sensorX, y: halfH }, world);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawPLFlange(world, xFlange) {
    if (!ctx || !canvas) return;

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.setLineDash([10, 8]);

    const r = canvas.getBoundingClientRect();
    const yWorld = (r.height / (world.s || 1)) * 0.6;

    const a = worldToScreen({ x: xFlange, y: -yWorld }, world);
    const b = worldToScreen({ x: xFlange, y: yWorld }, world);

    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawTitleOverlay(text) {
    if (!ctx || !canvas) return;
    const mono = (getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace").trim();
    const r = canvas.getBoundingClientRect();

    const padX = 14;
    const padY = 10;
    const maxW = r.width - padX * 2;

    const fontSize = 13;
    const lineH = 17;

    const parts = String(text || "").split(" • ").map(s => s.trim()).filter(Boolean);

    ctx.save();
    ctx.font = `${fontSize}px ${mono}`;

    const lines = [];
    let cur = "";

    for (const p of parts) {
      const test = cur ? (cur + " • " + p) : p;
      if (ctx.measureText(test).width <= maxW) cur = test;
      else {
        if (cur) lines.push(cur);
        cur = p;
      }
      if (lines.length >= 3) break;
    }
    if (lines.length < 3 && cur) lines.push(cur);

    const barH = padY * 2 + lines.length * lineH;

    ctx.fillStyle = "rgba(0,0,0,.62)";
    ctx.fillRect(8, 6, r.width - 16, barH);

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], padX, 6 + padY + i * lineH);
    ctx.restore();
  }

  // -------------------- render scheduler (RAF throttle) --------------------
  let _rafAll = 0;
  function scheduleRenderAll() {
    if (_rafAll) return;
    _rafAll = requestAnimationFrame(() => {
      _rafAll = 0;
      renderAll();
    });
  }

  // ===========================
  // RENDER ALL
  // ===========================
  function renderAll() {
    if (!canvas || !ctx) return;

    const fieldAngle = Number(ui.fieldAngle?.value || 0);
    const rayCount   = Number(ui.rayCount?.value || 31);
    const wavePreset = ui.wavePreset?.value || "d";

    const { w: sensorW, h: sensorH, halfH } = getSensorWH();

    const focusMode = String(ui.focusMode?.value || "cam").toLowerCase();
    const sensorX = (focusMode === "cam") ? Number(ui.sensorOffset?.value || 0) : 0.0;
    const lensShift = (focusMode === "lens") ? Number(ui.lensFocus?.value || 0) : 0;

    computeVertices(lens.surfaces, lensShift, sensorX);

    const plX = -PL_FFD;

    const rays = buildRays(lens.surfaces, fieldAngle, rayCount);
    const traces = rays.map((r) => traceRayForward(clone(r), lens.surfaces, wavePreset));

    const vCount = traces.filter((t) => t.vignetted).length;
    const tirCount = traces.filter((t) => t.tir).length;
    const vigPct = traces.length ? Math.round((vCount / traces.length) * 100) : 0;

    const { efl, bfl } = estimateEflBflParaxial(lens.surfaces, wavePreset);
    const T = estimateTStopApprox(efl, lens.surfaces);

    const fov = computeFovDeg(efl, sensorW, sensorH);
    const fovTxt = !fov
      ? "FOV: —"
      : `FOV: H ${fov.hfov.toFixed(1)}° • V ${fov.vfov.toFixed(1)}° • D ${fov.dfov.toFixed(1)}°`;

    const maxField = coverageTestMaxFieldDeg(lens.surfaces, wavePreset, sensorX, halfH);
    const covMode = "v";
    const { ok: covers, req } = coversSensorYesNo({ fov, maxField, mode: covMode, marginDeg: 0.5 });

    const covTxt = !fov
      ? "COV(V): —"
      : `COV(V): ±${maxField.toFixed(1)}° • REQ(V): ${(req ?? 0).toFixed(1)}° • ${covers ? "COVERS ✅" : "NO ❌"}`;

    const rearVx = lastPhysicalVertexX(lens.surfaces);
    const intrusion = rearVx - plX;

    const rearTxt = (intrusion > 0)
      ? `REAR INTRUSION: +${intrusion.toFixed(2)}mm ❌`
      : `REAR CLEAR: ${Math.abs(intrusion).toFixed(2)}mm ✅`;

    const frontVx = firstPhysicalVertexX(lens.surfaces);
    const lenToFlange = plX - frontVx;
    const totalLen = lenToFlange + PL_LENS_LIP;
    const lenTxt = (Number.isFinite(totalLen) && totalLen > 0)
      ? `LEN≈ ${totalLen.toFixed(1)}mm (front→PL + mount)`
      : `LEN≈ —`;

    const feas = isFeasible(lens.surfaces, sensorX, wavePreset, rayCount, halfH);
    let meritRes = { merit: 1e9, breakdown: {} };
    if (feas.ok) meritRes = computeMeritV2({ surfaces: lens.surfaces, wavePreset, sensorX, rayCount, sensorW, sensorH });
    const m = meritRes.merit;
    const bd = meritRes.breakdown;

    const meritTxt =
      feas.ok
        ? `Merit ${Number.isFinite(m) ? m.toFixed(2) : "—"} (RMS0 ${bd.rmsCenter?.toFixed?.(3) ?? "—"}mm • RMSedge ${bd.rmsEdge?.toFixed?.(3) ?? "—"}mm • Vig ${bd.vigPct ?? "—"}%)`
        : `Merit — (FAIL: ${feas.reason})`;

    if (ui.efl) ui.efl.textContent = `Focal Length: ${efl == null ? "—" : efl.toFixed(2)}mm`;
    if (ui.bfl) ui.bfl.textContent = `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
    if (ui.tstop) ui.tstop.textContent = `T≈ ${T == null ? "—" : "T" + T.toFixed(2)}`;
    if (ui.vig) ui.vig.textContent = `Vignette: ${vigPct}%`;
    if (ui.fov) ui.fov.textContent = fovTxt;
    if (ui.cov) ui.cov.textContent = covers ? "COV: YES" : "COV: NO";
    if (ui.merit) ui.merit.textContent = feas.ok ? `Merit: ${m.toFixed(2)}` : `Merit: FAIL`;

    if (ui.eflTop) ui.eflTop.textContent = ui.efl?.textContent || `EFL: ${efl == null ? "—" : efl.toFixed(2)}mm`;
    if (ui.bflTop) ui.bflTop.textContent = ui.bfl?.textContent || `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
    if (ui.tstopTop) ui.tstopTop.textContent = ui.tstop?.textContent || `T≈ ${T == null ? "—" : "T" + T.toFixed(2)}`;
    if (ui.fovTop) ui.fovTop.textContent = fovTxt;
    if (ui.covTop) ui.covTop.textContent = ui.cov?.textContent || (covers ? "COV: YES" : "COV: NO");
    if (ui.meritTop) ui.meritTop.textContent = feas.ok ? `Merit: ${m.toFixed(2)}` : `Merit: FAIL`;

    if (ui.footerWarn) {
      ui.footerWarn.textContent = "";
      if (!feas.ok) ui.footerWarn.textContent = `FEASIBILITY FAIL: ${feas.reason}`;
      else if (tirCount > 0) ui.footerWarn.textContent = `TIR on ${tirCount} rays (check glass/curvature).`;
    }

    if (ui.status) {
      ui.status.textContent =
        `Selected: ${selectedIndex} • Traced ${traces.length} rays • field ${fieldAngle.toFixed(2)}° • vignetted ${vCount} • ${covTxt} • ${meritTxt}`;
    }
    if (ui.metaInfo) ui.metaInfo.textContent = `sensor ${sensorW.toFixed(2)}×${sensorH.toFixed(2)}mm`;

    resizeCanvasToCSS();
    const r = canvas.getBoundingClientRect();
    drawBackgroundCSS(r.width, r.height);

    const world = makeWorldTransform();
    drawAxes(world);

    drawPLFlange(world, plX);
    drawLens(world, lens.surfaces);
    drawStop(world, lens.surfaces);
    drawRays(world, traces, sensorX);
    drawSensor(world, sensorX, halfH);

    drawTitleOverlay(
      [
        lens?.name || "Lens",
        `EFL ${efl == null ? "—" : efl.toFixed(2)}mm`,
        `BFL ${bfl == null ? "—" : bfl.toFixed(2) + "mm"}`,
        `${T == null ? "T—" : "T" + T.toFixed(2)}`,
        fovTxt,
        covTxt,
        rearTxt,
        lenTxt,
        feas.ok ? `Merit ${m.toFixed(2)}` : `FAIL ${feas.reason}`,
        (String(ui.focusMode?.value || "cam").toLowerCase() === "cam")
          ? `CamFocus ${sensorX.toFixed(2)}mm`
          : `LensFocus ${lensShift.toFixed(2)}mm`,
      ].join(" • ")
    );
  }

  // -------------------- view controls --------------------
  function bindViewControls() {
    if (!canvas) return;

    canvas.addEventListener("mousedown", (e) => {
      view.dragging = true;
      view.lastX = e.clientX;
      view.lastY = e.clientY;
    });
    window.addEventListener("mouseup", () => { view.dragging = false; });

    window.addEventListener("mousemove", (e) => {
      if (!view.dragging) return;
      const dx = e.clientX - view.lastX;
      const dy = e.clientY - view.lastY;
      view.lastX = e.clientX;
      view.lastY = e.clientY;
      view.panX += dx;
      view.panY += dy;
      renderAll();
    });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      const factor = delta > 0 ? 0.92 : 1.08;
      view.zoom = clamp(view.zoom * factor, 0.12, 12);
      renderAll();
    }, { passive: false });

    canvas.addEventListener("dblclick", () => {
      view.panX = 0; view.panY = 0; view.zoom = 1.0;
      renderAll();
    });
  }

  // -------------------- editing actions --------------------
  function getIMSIndex() { return lens.surfaces.findIndex((s) => String(s.type).toUpperCase() === "IMS"); }

  function safeInsertAtAfterSelected() {
    clampSelected();
    let insertAt = selectedIndex + 1;
    const imsIdx = getIMSIndex();
    if (imsIdx >= 0) insertAt = Math.min(insertAt, imsIdx);
    insertAt = Math.max(1, insertAt);
    return insertAt;
  }

  function insertSurface(atIndex, surfaceObj) {
    lens.surfaces.splice(atIndex, 0, surfaceObj);
    selectedIndex = atIndex;
    lens = sanitizeLens(lens);
    buildTable();
    applySensorToIMS();
    renderAll();
  }

  function addSurface() {
    insertSurface(safeInsertAtAfterSelected(), { type: "", R: 0.0, t: 4.0, ap: 18.0, glass: "AIR", stop: false });
  }

  function duplicateSelected() {
    clampSelected();
    if (isProtectedIndex(selectedIndex)) return toast("Cannot duplicate OBJ/IMS");
    const s = clone(lens.surfaces[selectedIndex]);
    s.type = "";
    const at = safeInsertAtAfterSelected();
    insertSurface(at, s);
  }

  function moveSelected(delta) {
    clampSelected();
    const i = selectedIndex;
    const j = i + delta;
    if (j < 0 || j >= lens.surfaces.length) return;
    if (isProtectedIndex(i) || isProtectedIndex(j)) return toast("Cannot move OBJ/IMS");
    const a = lens.surfaces[i];
    lens.surfaces[i] = lens.surfaces[j];
    lens.surfaces[j] = a;
    selectedIndex = j;
    buildTable();
    applySensorToIMS();
    renderAll();
  }

  function removeSelected() {
    clampSelected();
    if (isProtectedIndex(selectedIndex)) return toast("Cannot remove OBJ/IMS");
    lens.surfaces.splice(selectedIndex, 1);
    selectedIndex = Math.max(0, selectedIndex - 1);
    lens = sanitizeLens(lens);
    clampAllApertures(lens.surfaces);
    buildTable();
    applySensorToIMS();
    renderAll();
  }

  function newClearLens() {
    loadLens({
      name: "Blank",
      surfaces: [
        { type: "OBJ",  R: 0.0, t: 0.0,  ap: 60.0, glass: "AIR", stop: false },
        { type: "STOP", R: 0.0, t: 30.0, ap: 8.0,  glass: "AIR", stop: true },
        { type: "IMS",  R: 0.0, t: 0.0,  ap: 12.77, glass: "AIR", stop: false },
      ],
    });
    toast("New / Clear");
  }

  // -------------------- save/load JSON --------------------
  function saveJSON() {
    const data = JSON.stringify(lens, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (lens?.name ? lens.name.replace(/[^\w\-]+/g, "_") : "lens") + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("Saved JSON");
  }

  async function loadJSONFile(file) {
    const txt = await file.text();
    const obj = JSON.parse(txt);
    loadLens(obj);
    toast("Loaded JSON");
  }

  // -------------------- fullscreen --------------------
  function toggleFullscreen(el) {
    if (!el) return;
    const isFS = document.fullscreenElement;
    if (!isFS) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  // -------------------- Scale → FL & Set T --------------------
  function scaleToFocalPrompt() {
    const { efl } = estimateEflBflParaxial(lens.surfaces, ui.wavePreset?.value || "d");
    const cur = Number.isFinite(efl) ? efl : 50;
    const s = prompt("Target focal length (mm):", String(cur.toFixed(2)));
    const target = num(s, NaN);
    if (!Number.isFinite(target) || target <= 1) return;

    const factor = target / cur;
    if (!Number.isFinite(factor) || factor <= 0) return;

    lens.surfaces.forEach((sf) => {
      const t = String(sf.type || "").toUpperCase();
      if (t !== "OBJ" && t !== "IMS") {
        sf.R *= factor;
        sf.t *= factor;
        sf.ap *= factor;
      }
    });

    lens = sanitizeLens(lens);
    clampAllApertures(lens.surfaces);
    buildTable();
    applySensorToIMS();
    renderAll();
    toast(`Scaled to FL≈${target.toFixed(1)}mm`);
  }

  function setTStopPrompt() {
    const wave = ui.wavePreset?.value || "d";
    const { efl } = estimateEflBflParaxial(lens.surfaces, wave);
    if (!Number.isFinite(efl) || efl <= 0) return toast("EFL not available");
    const curT = estimateTStopApprox(efl, lens.surfaces);
    const s = prompt("Target T-stop:", String((curT ?? 2.8).toFixed(2)));
    const Tt = num(s, NaN);
    if (!Number.isFinite(Tt) || Tt <= 0.5) return;

    const stopIdx = findStopSurfaceIndex(lens.surfaces);
    if (stopIdx < 0) return toast("No STOP surface");
    const newAp = efl / (2 * Tt);
    lens.surfaces[stopIdx].ap = clamp(newAp, AP_MIN, maxApForSurface(lens.surfaces[stopIdx]));

    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    toast(`Set stop for ~T${Tt.toFixed(2)}`);
  }

  // -------------------- OPTIMIZER --------------------
  const OPT = {
    running: false,
    iter: 0,
    chunk: 150,
    temperature: 1.0,
    cool: 0.9992,

    best: null,
    mode: "safe",
    targetEfl: null,
    targetT: null,
  };

  function optLog(msg) {
    if (!ui.optLog) return;
    const s = String(msg || "");
    ui.optLog.value += (ui.optLog.value ? "\n" : "") + s;
    ui.optLog.scrollTop = ui.optLog.scrollHeight;
  }

  function ensureOptimizerUI() {
    if (!ui.toolbar) return;

    const mkBtn = (id, label, cls="btn") => {
      let b = $("#" + id);
      if (b) return b;
      b = document.createElement("button");
      b.id = id;
      b.className = cls;
      b.type = "button";
      b.textContent = label;
      ui.toolbar.appendChild(b);
      return b;
    };

    const maybeSep = () => {
      const d = document.createElement("div");
      d.className = "sep";
      d.setAttribute("aria-hidden","true");
      ui.toolbar.appendChild(d);
    };

    if (!$("#btnOptimize")) {
      maybeSep();
      mkBtn("btnOptimize", "Optimize", "btn btnPrimary");
      mkBtn("btnOptStop", "Stop", "btn");
      mkBtn("btnApplyBest", "Apply best", "btn");
      mkBtn("btnBench", "Bench", "btn");
    }

    if (!$("#optPanel") && ui.leftScroll) {
      const wrap = document.createElement("section");
      wrap.id = "optPanel";
      wrap.className = "controls";
      wrap.style.marginTop = "10px";
      wrap.innerHTML = `
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
          <div class="ctrl" style="min-width:180px; flex:1;">
            <label for="optIters">Iterations (hint)</label>
            <input id="optIters" type="number" step="100" value="2000" min="100" />
          </div>
          <div class="ctrl" style="min-width:180px; flex:1;">
            <label for="optMode">Exploration</label>
            <select id="optMode">
              <option value="safe" selected>Safe</option>
              <option value="wild">Wild</option>
            </select>
          </div>
          <div class="ctrl" style="min-width:180px; flex:1;">
            <label for="optTargetEfl">Target EFL (optional)</label>
            <input id="optTargetEfl" type="number" step="0.5" placeholder="e.g. 75" />
          </div>
          <div class="ctrl" style="min-width:180px; flex:1;">
            <label for="optTargetT">Target T (optional)</label>
            <input id="optTargetT" type="number" step="0.05" placeholder="e.g. 2.0" />
          </div>
        </div>
        <div class="hint" id="optReadout" style="margin-top:8px;">Optimizer idle.</div>
        <div class="ctrl" style="margin-top:10px;">
          <label for="optLog">Optimizer log</label>
          <textarea id="optLog" rows="7" spellcheck="false" style="width:100%; resize:vertical;"></textarea>
        </div>
      `;
      ui.leftScroll.prepend(wrap);
    }

    ui.btnOptimize = $("#btnOptimize");
    ui.btnOptStop = $("#btnOptStop");
    ui.btnApplyBest = $("#btnApplyBest");
    ui.btnBench = $("#btnBench");
    ui.optIters = $("#optIters");
    ui.optMode = $("#optMode");
    ui.optTargetEfl = $("#optTargetEfl");
    ui.optTargetT = $("#optTargetT");
    ui.optReadout = $("#optReadout");
    ui.optLog = $("#optLog");
  }

  function scoreCurrentForOptimizer() {
    const wavePreset = ui.wavePreset?.value || "d";
    const rayCount = Math.max(21, Math.min(61, Number(ui.rayCount?.value || 31)));
    const focusMode = String(ui.focusMode?.value || "cam").toLowerCase();
    const sensorX = (focusMode === "cam") ? Number(ui.sensorOffset?.value || 0) : 0.0;

    const { w: sensorW, h: sensorH, halfH } = getSensorWH();
    computeVertices(lens.surfaces, (focusMode === "lens") ? Number(ui.lensFocus?.value || 0) : 0, sensorX);

    const feas = isFeasible(lens.surfaces, sensorX, wavePreset, rayCount, halfH);
    if (!feas.ok) return { merit: 1e9, feas, breakdown: { reason: feas.reason } };

    const mr = computeMeritV2({ surfaces: lens.surfaces, wavePreset, sensorX, rayCount, sensorW, sensorH });

    let extra = 0;
    if (Number.isFinite(OPT.targetEfl) && Number.isFinite(mr.breakdown.efl)) {
      const d = (mr.breakdown.efl - OPT.targetEfl) / 1.0;
      extra += 0.8 * d * d;
    }
    if (Number.isFinite(OPT.targetT)) {
      const T = estimateTStopApprox(mr.breakdown.efl, lens.surfaces);
      if (Number.isFinite(T)) {
        const d = (T - OPT.targetT) / 0.05;
        extra += 0.25 * d * d;
      }
    }

    return { merit: mr.merit + extra, feas, breakdown: mr.breakdown };
  }

  function mutateLensInPlace(surfaces, mode="safe") {
    const n = surfaces.length;
    if (n < 3) return;

    const candidates = [];
    for (let i = 0; i < n; i++) {
      const t = String(surfaces[i].type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      candidates.push(i);
    }
    if (!candidates.length) return;

    const i = choice(candidates);
    const s = surfaces[i];
    const t = String(s.type || "").toUpperCase();

    const ampR = (mode === "wild") ? 0.22 : 0.08;
    const ampT = (mode === "wild") ? 0.28 : 0.10;
    const ampAp= (mode === "wild") ? 0.18 : 0.08;

    if (Math.random() < 0.60 && Math.abs(s.R) > 1e-9) {
      const f = 1 + randf(-ampR, ampR);
      s.R *= f;
      if (Math.abs(s.R) < FEAS.minRadiusAbs) s.R = Math.sign(s.R) * FEAS.minRadiusAbs;
    } else if (Math.random() < 0.10) {
      s.R = -s.R;
    }

    if (Math.random() < 0.70) {
      const f = 1 + randf(-ampT, ampT);
      s.t *= f;
      s.t = Math.max(0.05, s.t);
    }

    if (Math.random() < 0.55 && t !== "STOP") {
      const f = 1 + randf(-ampAp, ampAp);
      s.ap *= f;
      s.ap = clamp(s.ap, AP_MIN, FEAS.maxAp);
    } else if (Math.random() < 0.35 && t === "STOP") {
      const f = 1 + randf(-ampAp, ampAp);
      s.ap *= f;
      s.ap = clamp(s.ap, AP_MIN, FEAS.maxAp);
    }

    if (Math.random() < (mode === "wild" ? 0.25 : 0.08)) {
      const glassPool = Object.keys(GLASS_DB).filter(g => g !== "AIR");
      if (String(s.glass || "AIR").toUpperCase() !== "AIR") {
        s.glass = choice(glassPool);
      } else if (Math.random() < 0.35) {
        s.glass = choice(glassPool);
        s.t = Math.max(s.t, FEAS.minGlass);
      }
    }

    if (mode === "wild" && Math.random() < 0.04) {
      const stopCandidates = candidates.filter(j => {
        const tt = String(surfaces[j].type || "").toUpperCase();
        return tt !== "OBJ" && tt !== "IMS";
      });
      if (stopCandidates.length) {
        const newStopIdx = choice(stopCandidates);
        surfaces.forEach(ss => ss.stop = false);
        surfaces[newStopIdx].stop = true;
        if (String(surfaces[newStopIdx].type || "").toUpperCase() !== "STOP") surfaces[newStopIdx].type = "STOP";
      }
    }

    if (mode === "wild" && Math.random() < 0.02 && surfaces.length < FEAS.maxSurfaces) {
      const imsIdx = surfaces.findIndex(ss => String(ss.type).toUpperCase() === "IMS");
      const at = clamp(randi(2, Math.max(2, imsIdx - 1)), 1, Math.max(1, imsIdx));
      surfaces.splice(at, 0, { type: "", R: 0.0, t: randf(0.5, 6.0), ap: randf(6, 18), glass: "AIR", stop: false });
    } else if (mode === "wild" && Math.random() < 0.015 && surfaces.length > 7) {
      const imsIdx = surfaces.findIndex(ss => String(ss.type).toUpperCase() === "IMS");
      const rem = clamp(randi(1, Math.max(1, imsIdx - 2)), 1, Math.max(1, imsIdx - 2));
      const tt = String(surfaces[rem].type || "").toUpperCase();
      if (tt !== "OBJ" && tt !== "IMS") surfaces.splice(rem, 1);
    }

    surfaces.forEach((sf, idx) => { if (!sf.type || !String(sf.type).trim()) sf.type = String(idx); });
    surfaces[0].type = "OBJ";
    surfaces[surfaces.length - 1].type = "IMS";
  }

  function optimizerStart() {
    ensureOptimizerUI();

    OPT.running = true;
    OPT.iter = 0;
    OPT.temperature = 1.0;

    OPT.mode = ui.optMode?.value || "safe";
    OPT.targetEfl = num(ui.optTargetEfl?.value, NaN);
    OPT.targetT = num(ui.optTargetT?.value, NaN);
    if (!Number.isFinite(OPT.targetEfl)) OPT.targetEfl = null;
    if (!Number.isFinite(OPT.targetT)) OPT.targetT = null;

    const baseline = scoreCurrentForOptimizer();
    OPT.best = { lens: clone(lens), merit: baseline.merit, breakdown: baseline.breakdown, feas: baseline.feas };

    if (ui.optLog) ui.optLog.value = "";
    optLog(`start | mode=${OPT.mode} | targetEFL=${OPT.targetEfl ?? "—"} | targetT=${OPT.targetT ?? "—"}`);
    optLog(`baseline merit=${Number.isFinite(baseline.merit) ? baseline.merit.toFixed(2) : "—"} | feas=${baseline.feas.ok ? "OK" : "FAIL"} ${baseline.feas.reason ?? ""}`);

    toast("Optimizer started");
    optimizerTick();
  }

  function optimizerStop() { OPT.running = false; toast("Optimizer stopped"); optLog("stop"); }

  function optimizerApplyBest() {
    if (!OPT.best?.lens) return toast("No best yet");
    loadLens(OPT.best.lens);
    toast(`Applied best (Merit ${Number.isFinite(OPT.best.merit) ? OPT.best.merit.toFixed(2) : "—"})`);
    optLog(`apply best merit=${Number.isFinite(OPT.best.merit) ? OPT.best.merit.toFixed(2) : "—"}`);
  }

  function optimizerBench() {
    const N = 200;
    const wavePreset = ui.wavePreset?.value || "d";
    const rayCount = Math.max(21, Math.min(61, Number(ui.rayCount?.value || 31)));
    const focusMode = String(ui.focusMode?.value || "cam").toLowerCase();
    const sensorX = (focusMode === "cam") ? Number(ui.sensorOffset?.value || 0) : 0.0;
    const { w: sensorW, h: sensorH, halfH } = getSensorWH();

    let ok = 0, fail = 0;
    let bestM = Infinity;

    const base = clone(lens);

    for (let k = 0; k < N; k++) {
      const cand = clone(base);
      mutateLensInPlace(cand.surfaces, "safe");
      applySensorToIMSOnSurfaces(cand.surfaces);
      cand.surfaces = sanitizeLens(cand).surfaces;
      clampAllApertures(cand.surfaces);

      computeVertices(cand.surfaces, 0, sensorX);
      const feas = isFeasible(cand.surfaces, sensorX, wavePreset, rayCount, halfH);
      if (!feas.ok) { fail++; continue; }

      const mr = computeMeritV2({ surfaces: cand.surfaces, wavePreset, sensorX, rayCount, sensorW, sensorH });
      ok++;
      if (mr.merit < bestM) bestM = mr.merit;
    }

    toast(`Bench: ok ${ok}/${N} • fail ${fail} • best merit ${Number.isFinite(bestM) ? bestM.toFixed(2) : "—"}`);
    optLog(`bench ok=${ok}/${N} fail=${fail} best=${Number.isFinite(bestM) ? bestM.toFixed(2) : "—"}`);
  }

  function optimizerTick() {
    if (!OPT.running) {
      if (ui.optReadout) ui.optReadout.textContent = "Optimizer idle.";
      return;
    }

    const itersHint = Math.max(100, Math.min(200000, Number(ui.optIters?.value || 2000)));
    const wavePreset = ui.wavePreset?.value || "d";
    const rayCount = Math.max(21, Math.min(61, Number(ui.rayCount?.value || 31)));
    const focusMode = String(ui.focusMode?.value || "cam").toLowerCase();
    const sensorX = (focusMode === "cam") ? Number(ui.sensorOffset?.value || 0) : 0.0;
    const { w: sensorW, h: sensorH, halfH } = getSensorWH();

    let curScore = scoreCurrentForOptimizer();
    if (!curScore.feas.ok && OPT.best?.feas?.ok) {
      lens = sanitizeLens(OPT.best.lens);
      buildTable();
      renderAll();
      curScore = scoreCurrentForOptimizer();
      optLog(`reset to best (current infeasible)`);
    }

    const startMerit = curScore.merit;
    let accepted = 0, improved = 0, fails = 0;

    for (let step = 0; step < OPT.chunk; step++) {
      if (!OPT.running) break;
      if (OPT.iter >= itersHint) { OPT.running = false; break; }

      OPT.iter++;

      const cand = clone(lens);
      mutateLensInPlace(cand.surfaces, OPT.mode);
      applySensorToIMSOnSurfaces(cand.surfaces);
      const candSan = sanitizeLens(cand);
      candSan.surfaces = candSan.surfaces;
      clampAllApertures(candSan.surfaces);

      computeVertices(candSan.surfaces, 0, sensorX);
      const feas = isFeasible(candSan.surfaces, sensorX, wavePreset, rayCount, halfH);
      let candMerit = 1e9;
      let candBreakdown = { reason: feas.reason };

      if (feas.ok) {
        const mr = computeMeritV2({ surfaces: candSan.surfaces, wavePreset, sensorX, rayCount, sensorW, sensorH });
        candMerit = mr.merit;

        if (Number.isFinite(OPT.targetEfl) && Number.isFinite(mr.breakdown.efl)) {
          const d = (mr.breakdown.efl - OPT.targetEfl) / 1.0;
          candMerit += 0.8 * d * d;
        }
        if (Number.isFinite(OPT.targetT)) {
          const T = estimateTStopApprox(mr.breakdown.efl, candSan.surfaces);
          if (Number.isFinite(T)) {
            const d = (T - OPT.targetT) / 0.05;
            candMerit += 0.25 * d * d;
          }
        }

        candBreakdown = mr.breakdown;
      } else {
        fails++;
      }

      const curM = curScore.merit;
      const dM = candMerit - curM;

      const Ttemp = Math.max(1e-6, OPT.temperature);
      const accept = (dM <= 0) || (Math.random() < Math.exp(-dM / (Ttemp)));
      OPT.temperature *= OPT.cool;

      if (accept) {
        lens = candSan;
        curScore = { merit: candMerit, feas, breakdown: candBreakdown };
        accepted++;
        if (candMerit < curM) improved++;

        if (feas.ok && candMerit < (OPT.best?.merit ?? Infinity)) {
          OPT.best = { lens: clone(lens), merit: candMerit, breakdown: candBreakdown, feas };
          optLog(`new best @iter ${OPT.iter}: ${candMerit.toFixed(2)} | EFL ${candBreakdown.efl?.toFixed?.(2) ?? "—"} | Vig ${candBreakdown.vigPct ?? "—"}%`);
        }
      }
    }

    buildTable();
    renderAll();

    if (ui.optReadout) {
      const bestTxt = OPT.best?.feas?.ok ? `best ${OPT.best.merit.toFixed(2)}` : `best —`;
      ui.optReadout.textContent =
        `Optimize | iter ${OPT.iter}/${itersHint} | mode ${OPT.mode} | start ${Number.isFinite(startMerit) ? startMerit.toFixed(2) : "—"} | now ${Number.isFinite(curScore.merit) ? curScore.merit.toFixed(2) : "—"} | ${bestTxt} | acc ${accepted} | imp ${improved} | fail ${fails}`;
    }

    if (OPT.iter % (OPT.chunk * 6) === 0) {
      optLog(`iter ${OPT.iter}: now ${Number.isFinite(curScore.merit) ? curScore.merit.toFixed(2) : "—"} | acc ${accepted} | imp ${improved} | fail ${fails}`);
    }

    if (OPT.running) requestAnimationFrame(optimizerTick);
    else { toast("Optimizer finished"); optLog("finished"); }
  }

  function wireOptimizerButtons() {
    ensureOptimizerUI();
    ui.btnOptimize?.addEventListener("click", optimizerStart);
    ui.btnOptStop?.addEventListener("click", optimizerStop);
    ui.btnApplyBest?.addEventListener("click", optimizerApplyBest);
    ui.btnBench?.addEventListener("click", optimizerBench);
  }

  // -------------------- wire UI --------------------
  function wireUI() {
    populateSensorPresetsSelect();
    applyPreset(ui.sensorPreset?.value || "ARRI Alexa Mini LF (LF)");

    ui.sensorPreset?.addEventListener("change", () => { applyPreset(ui.sensorPreset.value); renderAll(); });
    ui.sensorW?.addEventListener("input", () => { applySensorToIMS(); renderAll(); });
    ui.sensorH?.addEventListener("input", () => { applySensorToIMS(); renderAll(); });

    ["fieldAngle","rayCount","wavePreset","sensorOffset","focusMode","lensFocus"].forEach((id) => {
      ui[id]?.addEventListener("input", scheduleRenderAll);
      ui[id]?.addEventListener("change", scheduleRenderAll);
    });
    ui.renderScale?.addEventListener("input", scheduleRenderAll);

    ui.btnNew?.addEventListener("click", newClearLens);
    ui.btnLoadOmit?.addEventListener("click", () => loadLens(omit50ConceptV1()));
    ui.btnLoadDemo?.addEventListener("click", () => loadLens(demoLensSimple()));

    ui.btnAdd?.addEventListener("click", addSurface);
    ui.btnDuplicate?.addEventListener("click", duplicateSelected);
    ui.btnMoveUp?.addEventListener("click", () => moveSelected(-1));
    ui.btnMoveDown?.addEventListener("click", () => moveSelected(+1));
    ui.btnRemove?.addEventListener("click", removeSelected);

    ui.btnAutoFocus?.addEventListener("click", autoFocus);

    ui.btnSave?.addEventListener("click", saveJSON);
    ui.fileLoad?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) loadJSONFile(f).catch((err) => {
        console.error(err);
        toast("Load failed (invalid JSON?)");
      });
      e.target.value = "";
    });

    ui.btnRaysFS?.addEventListener("click", () => toggleFullscreen(ui.raysPane));

    ui.btnScaleToFocal?.addEventListener("click", scaleToFocalPrompt);
    ui.btnSetTStop?.addEventListener("click", setTStopPrompt);

    wireOptimizerButtons();
  }

  // -------------------- boot --------------------
  function boot() {
    wireUI();

    window.scrollTo(0, 0);
    ui.leftScroll?.scrollTo(0, 0);
    setTimeout(() => ui.leftScroll?.scrollTo(0, 0), 0);

    clampAllApertures(lens.surfaces);
    buildTable();
    applySensorToIMS();
    bindViewControls();
    renderAll();

    window.addEventListener("resize", () => renderAll());
    document.addEventListener("fullscreenchange", () => renderAll());
  }

  boot();
})();

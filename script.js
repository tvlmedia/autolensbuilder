/* Meridional Raytracer (2D) — TVL Lens Builder (RAYS ONLY)
   - Rays canvas + surface editor + merit score + simple optimizer.
   - No preview/LUT/DOF/CA pipeline.
*/

(() => {
  // -------------------- kill scroll restoration --------------------
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch(_) {}

  // -------------------- tiny helpers --------------------
  const $ = (sel) => document.querySelector(sel);
  const clamp = (x,a,b)=> x<a?a:(x>b?b:x);
  const clone = (obj) =>
    typeof structuredClone === "function" ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));

  function num(v, fallback = 0) {
    const s = String(v ?? "").trim().replace(",", ".");
    const x = parseFloat(s);
    return Number.isFinite(x) ? x : fallback;
  }

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
    dist: $("#badgeDist"),
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
    distTop: $("#badgeDistTop"),
    meritTop: $("#badgeMeritTop"),

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

    // Optimizer
    optTargetFL: $("#optTargetFL"),
    optTargetT: $("#optTargetT"),
    optIters: $("#optIters"),
    optPop: $("#optPop"),
    optLog: $("#optLog"),

    btnOptStart: $("#btnOptStart"),
    btnOptStop: $("#btnOptStop"),
    btnOptApply: $("#btnOptApply"),
    btnOptBench: $("#btnOptBench"),

    elementModal: $("#elementModal"),
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
    "N-BK7HT": { nd: 1.5168, Vd: 64.17 },
    "N-BK10": { nd: 1.49782, Vd: 66.95 },
    "N-K5": { nd: 1.52249, Vd: 59.48 },
    "N-KF9": { nd: 1.52346, Vd: 51.54 },
    "N-PK52A": { nd: 1.497, Vd: 81.61 },
    "N-ZK7A": { nd: 1.508054, Vd: 61.04 },
    "N-BAK1": { nd: 1.5725, Vd: 57.55 },
    "N-BAK2": { nd: 1.53996, Vd: 59.71 },
    "N-BAK4": { nd: 1.56883, Vd: 55.98 },
    "N-BALF4": { nd: 1.57956, Vd: 53.87 },
    "N-BALF5": { nd: 1.54739, Vd: 53.63 },
    "N-BAF4": { nd: 1.60568, Vd: 43.72 },
    "N-BAF10": { nd: 1.67003, Vd: 47.11 },
    "N-BAF51": { nd: 1.65224, Vd: 44.96 },
    "N-BAF52": { nd: 1.60863, Vd: 46.6 },
    "N-BASF2": { nd: 1.66446, Vd: 36.0 },
    "N-SK2": { nd: 1.60738, Vd: 56.65 },
    "N-SK4": { nd: 1.61272, Vd: 58.63 },
    "N-SK5": { nd: 1.58913, Vd: 61.27 },
    "N-SK11": { nd: 1.56384, Vd: 60.8 },
    "N-SK14": { nd: 1.60311, Vd: 60.6 },
    "N-SK16": { nd: 1.62041, Vd: 60.32 },
    "N-SSK2": { nd: 1.62229, Vd: 53.27 },
    "N-SSK5": { nd: 1.65844, Vd: 50.88 },
    "N-SSK8": { nd: 1.61773, Vd: 49.83 },
    "N-PSK3": { nd: 1.55232, Vd: 63.46 },
    "N-PSK53A": { nd: 1.618, Vd: 63.39 },
    "N-KZFS2": { nd: 1.55836, Vd: 54.01 },
    "N-KZFS4": { nd: 1.61336, Vd: 44.49 },
    "N-KZFS5": { nd: 1.65412, Vd: 39.7 },
    "N-KZFS8": { nd: 1.72047, Vd: 34.7 },
    "N-LAK9": { nd: 1.691, Vd: 54.71 },
    "N-LAK10": { nd: 1.72003, Vd: 50.62 },
    "N-LAK22": { nd: 1.65113, Vd: 55.89 },
    "N-LAK28": { nd: 1.74429, Vd: 50.77 },
    "N-LAK34": { nd: 1.72916, Vd: 54.5 },
    "N-LAF2": { nd: 1.74397, Vd: 44.85 },
    "N-LAF7": { nd: 1.7495, Vd: 34.82 },
    "N-LAF21": { nd: 1.788, Vd: 47.49 },
    "N-LAF34": { nd: 1.7725, Vd: 49.62 },
    "N-LASF9": { nd: 1.85025, Vd: 32.17 },
    "N-LASF40": { nd: 1.83404, Vd: 37.3 },
    "N-LASF41": { nd: 1.83501, Vd: 43.13 },
    "N-LASF43": { nd: 1.8061, Vd: 40.61 },
    "N-LASF44": { nd: 1.8042, Vd: 46.5 },
    "N-LASF45": { nd: 1.80107, Vd: 34.97 },
    "N-F2": { nd: 1.62005, Vd: 36.43 },
    "N-FK5": { nd: 1.48749, Vd: 70.41 },
    "N-FK58": { nd: 1.456, Vd: 90.9 },
    "N-SF1": { nd: 1.71736, Vd: 29.62 },
    "N-SF2": { nd: 1.64769, Vd: 33.82 },
    "N-SF4": { nd: 1.75513, Vd: 27.38 },
    "N-SF5": { nd: 1.67271, Vd: 32.25 },
    "N-SF6": { nd: 1.80518, Vd: 25.36 },
    "N-SF8": { nd: 1.68894, Vd: 31.31 },
    "N-SF10": { nd: 1.72828, Vd: 28.53 },
    "N-SF11": { nd: 1.78472, Vd: 25.68 },
    "N-SF15": { nd: 1.69892, Vd: 30.2 },
    "N-SF57": { nd: 1.84666, Vd: 23.78 },
    "N-SF66": { nd: 1.92286, Vd: 20.88 },
  };

  const GLASS_LIST = Object.keys(GLASS_DB).filter(k => k !== "AIR");

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

  // -------------------- demo lenses --------------------
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
        { type: "AST", R: 0.0, t: 6.4, ap: 8.5, glass: "AIR", stop: false },
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
        "Scaled from Double-Gauss base; used as geometric sanity for this 2D meridional tracer.",
        "Not optimized; coatings/stop/entrance pupil are not modeled.",
      ],
      surfaces: [
        { type: "OBJ", R: 0.0, t: 0.0, ap: 60.0, glass: "AIR", stop: false },
        { type: "1", R: 37.4501, t: 4.49102, ap: 16.46707, glass: "N-LAK9", stop: false },
        { type: "2", R: 135.07984, t: 0.0499, ap: 16.46707, glass: "AIR", stop: false },
        { type: "3", R: 19.59581, t: 8.23852, ap: 13.72255, glass: "N-BAK4", stop: false },
        { type: "4", R: 0.0, t: 0.998, ap: 12.22555, glass: "N-SF5", stop: false },
        { type: "5", R: 12.7994, t: 5.48403, ap: 9.73054, glass: "AIR", stop: false },
        { type: "STOP", R: 0.0, t: 6.48703, ap: 9.28144, glass: "AIR", stop: true },
        { type: "7", R: -15.90319, t: 3.50798, ap: 9.23154, glass: "N-SF5", stop: false },
        { type: "8", R: 0.0, t: 4.48104, ap: 10.47904, glass: "N-LAK9", stop: false },
        { type: "9", R: -21.71158, t: 0.0499, ap: 10.47904, glass: "AIR", stop: false },
        { type: "10", R: 110.3493, t: 3.98204, ap: 11.47705, glass: "N-BAK4", stop: false },
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
    }
    if (safe.surfaces.length >= 1) safe.surfaces[safe.surfaces.length - 1].type = "IMS";

    // resolve glass names
    safe.surfaces.forEach((s) => { s.glass = resolveGlassName(s.glass); });

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
            value="${isOBJ ? 0 : s.t}" ${isOBJ || isIMS ? "disabled" : ""}>
        </td>
        <td style="width:92px"><input class="cellInput" data-k="ap" data-i="${idx}" type="number" step="0.01" value="${s.ap}"></td>
        <td style="width:110px">
          <select class="cellSelect" data-k="glass" data-i="${idx}">
            ${Object.keys(GLASS_DB).map((name) =>
              `<option value="${name}" ${name === s.glass ? "selected" : ""}>${name}</option>`
            ).join("")}
          </select>
        </td>
        <td class="cellChk" style="width:58px">
          <input type="checkbox" data-k="stop" data-i="${idx}" ${s.stop ? "checked" : ""}>
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
    if (t0 === "OBJ" && k === "t") {
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
    if (t0 === "OBJ" && k === "t") {
      s.t = 0.0;
      el.value = "0";
    }

    if (k === "stop") {
      s.stop = !!el.checked;
      enforceSingleStop(i);
    } else if (k === "glass") {
      s.glass = resolveGlassName(String(el.value || "AIR"));
    } else if (k === "type") {
      s.type = String(el.value || "");
    } else if (k === "R" || k === "t" || k === "ap") {
      s[k] = num(el.value, s[k] ?? 0);
    }

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
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) * 0.5;
      if (gapAt(mid) >= minCT) lo = mid;
      else hi = mid;
    }
    return Math.max(0.01, lo);
  }

  const PHYS_CFG = {
    minAirGap: 0.12,
    prefAirGap: 0.60,
    minGlassCT: 0.35,
    prefGlassCT: 1.20,
    minRadius: 8.0,
    minAperture: 1.2,
    maxAperture: 32.0,
    minThickness: 0.05,
    maxThickness: 55.0,
    minStopToApertureRatio: 0.28,
    maxNegOverlap: 0.05,
    gapWeightAir: 1200.0,
    gapWeightGlass: 2600.0,
    overlapWeight: 3200.0,
    tinyApWeight: 120.0,
    tinyRadiusWeight: 80.0,
    pinchWeight: 220.0,
    stopOversizeWeight: 240.0,
    stopTooTinyWeight: 200.0,
    minAirGapsPreferred: 3,
    tooFewAirGapsWeight: 260.0,
    shortAirGapWeight: 190.0,
    thinGlassWeight: 150.0,
    minStopSideAirGap: 0.35,
    stopAirSideWeight: 1200.0,
    stopAirGapWeight: 900.0,
    planeRefractiveWeight: 520.0,
    planeNearStopExtraWeight: 880.0,
  };

  function minGapBetweenSurfaces(sFront, sBack, yMax, samples = 11) {
    const n = Math.max(3, samples | 0);
    const ym = Math.max(0.001, Number(yMax || 0));
    let minGap = Infinity;

    for (let k = 0; k < n; k++) {
      const a = n === 1 ? 0 : (k / (n - 1));
      const y = a * ym;
      const xf = surfaceXatY(sFront, y);
      const xb = surfaceXatY(sBack, y);
      if (!Number.isFinite(xf) || !Number.isFinite(xb)) return -Infinity;
      minGap = Math.min(minGap, xb - xf);
    }
    return minGap;
  }

  function evaluatePhysicalConstraints(surfaces) {
    let penalty = 0;
    let hardFail = false;
    let worstOverlap = 0;
    let worstPinch = 0;
    let airGapCount = 0;

    const stopIdx = findStopSurfaceIndex(surfaces);
    const stopAp = stopIdx >= 0 ? Math.max(0.1, Number(surfaces[stopIdx]?.ap || 0)) : null;

    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;

      const ap = Math.max(0, Number(s.ap || 0));
      const R = Math.abs(Number(s.R || 0));
      const th = Math.max(0, Number(s.t || 0));
      const nBefore = i > 0 ? String(resolveGlassName(surfaces[i - 1]?.glass || "AIR")).toUpperCase() : "AIR";
      const nAfter = String(resolveGlassName(s.glass || "AIR")).toUpperCase();
      const isRefractive = nBefore !== nAfter;

      if (ap < PHYS_CFG.minAperture) {
        const d = PHYS_CFG.minAperture - ap;
        penalty += PHYS_CFG.tinyApWeight * d * d;
      }
      if (ap > PHYS_CFG.maxAperture) {
        const d = ap - PHYS_CFG.maxAperture;
        penalty += 60.0 * d * d;
      }
      if (R > 1e-9 && R < PHYS_CFG.minRadius) {
        const d = PHYS_CFG.minRadius - R;
        penalty += PHYS_CFG.tinyRadiusWeight * d * d;
      }
      if (isRefractive && R <= 1e-9) {
        penalty += PHYS_CFG.planeRefractiveWeight;
        if (stopIdx >= 0 && Math.abs(i - stopIdx) <= 2) {
          penalty += PHYS_CFG.planeNearStopExtraWeight;
        }
      }
      if (th < PHYS_CFG.minThickness) {
        const d = PHYS_CFG.minThickness - th;
        penalty += 400.0 * d * d;
      }
      if (th > PHYS_CFG.maxThickness) {
        const d = th - PHYS_CFG.maxThickness;
        penalty += 5.0 * d * d;
      }

      if (Number.isFinite(stopAp) && ap < stopAp * PHYS_CFG.minStopToApertureRatio) {
        const d = stopAp * PHYS_CFG.minStopToApertureRatio - ap;
        penalty += PHYS_CFG.tinyApWeight * d * d;
      }
    }

    for (let i = 1; i < surfaces.length - 1; i++) {
      const prev = surfaces[i - 1];
      const cur = surfaces[i];
      const next = surfaces[i + 1];
      const tp = String(prev?.type || "").toUpperCase();
      const tc = String(cur?.type || "").toUpperCase();
      const tn = String(next?.type || "").toUpperCase();
      if (tp === "OBJ" || tc === "OBJ" || tn === "OBJ") continue;
      if (tp === "IMS" || tc === "IMS" || tn === "IMS") continue;
      const apPrev = Number(prev.ap || 0);
      const apCur = Number(cur.ap || 0);
      const apNext = Number(next.ap || 0);
      const ref = Math.min(apPrev, apNext);
      if (ref > 0.5 && apCur < 0.5 * ref) {
        const d = 0.5 * ref - apCur;
        worstPinch = Math.max(worstPinch, d);
        penalty += PHYS_CFG.pinchWeight * d * d;
      }
    }

    for (let i = 0; i < surfaces.length - 1; i++) {
      const sA = surfaces[i];
      const sB = surfaces[i + 1];
      const tA = String(sA?.type || "").toUpperCase();
      const tB = String(sB?.type || "").toUpperCase();
      if (tA === "OBJ" || tA === "IMS" || tB === "OBJ" || tB === "IMS") continue;

      const apShared = Math.max(0.1, Math.min(Number(sA.ap || 0), Number(sB.ap || 0), maxApForSurface(sA), maxApForSurface(sB)));
      const minGap = minGapBetweenSurfaces(sA, sB, apShared, 13);
      const mediumAfterA = String(sA.glass || "AIR").toUpperCase();
      if (mediumAfterA === "AIR") airGapCount++;
      const required = mediumAfterA === "AIR" ? PHYS_CFG.minAirGap : PHYS_CFG.minGlassCT;

      if (!Number.isFinite(minGap)) {
        penalty += 100_000;
        hardFail = true;
        continue;
      }

      if (minGap < required) {
        const d = required - minGap;
        const w = (mediumAfterA === "AIR") ? PHYS_CFG.gapWeightAir : PHYS_CFG.gapWeightGlass;
        penalty += w * d * d;
      }
      if (mediumAfterA === "AIR" && minGap < PHYS_CFG.prefAirGap) {
        const d = PHYS_CFG.prefAirGap - minGap;
        penalty += PHYS_CFG.shortAirGapWeight * d * d;
      }
      if (mediumAfterA !== "AIR" && minGap < PHYS_CFG.prefGlassCT) {
        const d = PHYS_CFG.prefGlassCT - minGap;
        penalty += PHYS_CFG.thinGlassWeight * d * d;
      }

      if (minGap < -PHYS_CFG.maxNegOverlap) hardFail = true;
      if (minGap < 0) worstOverlap = Math.max(worstOverlap, -minGap);

      if (mediumAfterA !== "AIR") {
        const noAp = maxNonOverlappingSemiDiameter(sA, sB, PHYS_CFG.minGlassCT);
        if (apShared > noAp + 1e-3) {
          const d = apShared - noAp;
          worstOverlap = Math.max(worstOverlap, d);
          penalty += PHYS_CFG.overlapWeight * d * d;
          if (d > 0.25) hardFail = true;
        }
      }
    }

    if (stopIdx < 0) {
      penalty += 1500;
      hardFail = true;
    } else {
      // Prefer iris in air on both sides.
      const prevMedium = stopIdx > 0 ? String(resolveGlassName(surfaces[stopIdx - 1]?.glass || "AIR")).toUpperCase() : "AIR";
      const nextMedium = String(resolveGlassName(surfaces[stopIdx]?.glass || "AIR")).toUpperCase();
      if (prevMedium !== "AIR") {
        penalty += PHYS_CFG.stopAirSideWeight;
        hardFail = true;
      }
      if (nextMedium !== "AIR") {
        penalty += PHYS_CFG.stopAirSideWeight;
        hardFail = true;
      }

      const leftGap = stopIdx > 0
        ? Math.max(0, Number(surfaces[stopIdx - 1]?.t || 0))
        : 0;
      const rightGap = Math.max(0, Number(surfaces[stopIdx]?.t || 0));
      if (leftGap < PHYS_CFG.minStopSideAirGap) {
        const d = PHYS_CFG.minStopSideAirGap - leftGap;
        penalty += PHYS_CFG.stopAirGapWeight * d * d;
      }
      if (rightGap < PHYS_CFG.minStopSideAirGap) {
        const d = PHYS_CFG.minStopSideAirGap - rightGap;
        penalty += PHYS_CFG.stopAirGapWeight * d * d;
      }

      // STOP should be compatible with nearby clear apertures to avoid heavy on-axis clipping.
      const neighbors = [];
      for (let d = 1; d <= 2; d++) {
        const iL = stopIdx - d;
        const iR = stopIdx + d;
        if (iL >= 0) {
          const sL = surfaces[iL];
          const tL = String(sL?.type || "").toUpperCase();
          if (tL !== "OBJ" && tL !== "IMS") neighbors.push(Number(sL.ap || 0));
        }
        if (iR < surfaces.length) {
          const sR = surfaces[iR];
          const tR = String(sR?.type || "").toUpperCase();
          if (tR !== "OBJ" && tR !== "IMS") neighbors.push(Number(sR.ap || 0));
        }
      }
      if (neighbors.length) {
        const minNeigh = Math.max(0.2, Math.min(...neighbors));
        if (stopAp > 1.08 * minNeigh) {
          const d = stopAp - 1.08 * minNeigh;
          penalty += PHYS_CFG.stopOversizeWeight * d * d;
          if (d > 0.9) hardFail = true;
        }
        if (stopAp < 0.55 * minNeigh) {
          const d = 0.55 * minNeigh - stopAp;
          penalty += PHYS_CFG.stopTooTinyWeight * d * d;
        }
      }
    }

    if (airGapCount < PHYS_CFG.minAirGapsPreferred) {
      const d = PHYS_CFG.minAirGapsPreferred - airGapCount;
      penalty += PHYS_CFG.tooFewAirGapsWeight * d * d;
    }

    return { penalty, hardFail, worstOverlap, worstPinch, airGapCount };
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

  function usableCoverageFieldDeg(surfaces, wavePreset, sensorX, halfSizeMm, rayCount) {
    let lo = 0, hi = 60, best = 0;
    const nReq = Math.max(6, Math.floor(Math.max(9, rayCount | 0) * 0.78));
    const maxVigFrac = 0.06;
    for (let iter = 0; iter < 18; iter++) {
      const mid = (lo + hi) * 0.5;
      const pack = traceBundleAtField(surfaces, mid, Math.max(9, rayCount | 0), wavePreset, sensorX);
      const chief = buildChiefRay(surfaces, mid);
      const tr = traceRayForward(clone(chief), surfaces, wavePreset);
      const y = tr?.endRay ? rayHitYAtX(tr.endRay, sensorX) : null;
      const chiefInside = Number.isFinite(y) && Math.abs(y) <= halfSizeMm;
      const ok = chiefInside && (pack.n || 0) >= nReq && (pack.vigFrac || 1) <= maxVigFrac;
      if (ok) { best = mid; lo = mid; } else hi = mid;
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

  const COVERAGE_CFG = {
    mode: "d",              // evaluate in diagonal plane
    marginDeg: 0.5,
    minSensorW: 36.0,       // always at least full-frame
    minSensorH: 24.0,
  };

  function requiredHalfFieldDeg(efl, sensorW, sensorH, mode = "d") {
    const fov = computeFovDeg(efl, sensorW, sensorH);
    if (!fov) return null;
    if (mode === "h") return fov.hfov * 0.5;
    if (mode === "v") return fov.vfov * 0.5;
    return fov.dfov * 0.5;
  }

  function coverageRequirementDeg(efl, sensorW, sensorH, mode = "d") {
    const reqCur = requiredHalfFieldDeg(efl, sensorW, sensorH, mode);
    const reqMin = requiredHalfFieldDeg(efl, COVERAGE_CFG.minSensorW, COVERAGE_CFG.minSensorH, mode);
    if (!Number.isFinite(reqCur) && !Number.isFinite(reqMin)) return null;
    if (!Number.isFinite(reqCur)) return reqMin;
    if (!Number.isFinite(reqMin)) return reqCur;
    return Math.max(reqCur, reqMin);
  }

  function coverageHalfSizeMm(sensorW, sensorH, mode = "d") {
    if (mode === "h") return Math.max(0.1, sensorW * 0.5);
    if (mode === "v") return Math.max(0.1, sensorH * 0.5);
    const d = Math.hypot(sensorW, sensorH);
    return Math.max(0.1, d * 0.5);
  }

  function coverageHalfSizeWithFloorMm(sensorW, sensorH, mode = "d") {
    const cur = coverageHalfSizeMm(sensorW, sensorH, mode);
    const min = coverageHalfSizeMm(COVERAGE_CFG.minSensorW, COVERAGE_CFG.minSensorH, mode);
    return Math.max(cur, min);
  }

  function traceChiefImageHeight(surfaces, wavePreset, sensorX, fieldDeg) {
    const chief = buildChiefRay(surfaces, fieldDeg);
    const tr = traceRayForward(clone(chief), surfaces, wavePreset);
    if (!tr || tr.vignetted || tr.tir || !tr.endRay) return null;
    return rayHitYAtX(tr.endRay, sensorX);
  }

  function computeDistortionMetrics(surfaces, wavePreset, sensorX, efl, reqHalfFieldDeg, maxFieldDeg) {
    if (!Number.isFinite(efl) || efl <= 0) return { edgePct: null, rmsPct: null, valid: 0 };
    const lim = Math.max(0, Math.min(
      Number.isFinite(reqHalfFieldDeg) ? reqHalfFieldDeg : 0,
      Number.isFinite(maxFieldDeg) ? maxFieldDeg : reqHalfFieldDeg || 0
    ));
    if (!Number.isFinite(lim) || lim < 0.4) return { edgePct: null, rmsPct: null, valid: 0 };

    const fields = [0.35 * lim, 0.70 * lim, 0.95 * lim].filter((v) => v > 0.05);
    const vals = [];
    for (const fa of fields) {
      const y = traceChiefImageHeight(surfaces, wavePreset, sensorX, fa);
      const yIdeal = efl * Math.tan((fa * Math.PI) / 180);
      if (!Number.isFinite(y) || !Number.isFinite(yIdeal) || Math.abs(yIdeal) < 1e-6) continue;
      const dPct = ((y - yIdeal) / yIdeal) * 100;
      vals.push(dPct);
    }
    if (!vals.length) return { edgePct: null, rmsPct: null, valid: 0 };
    const edgePct = vals[vals.length - 1];
    const rmsPct = Math.sqrt(vals.reduce((a, b) => a + b * b, 0) / vals.length);
    return { edgePct, rmsPct, valid: vals.length };
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

  // -------------------- spot RMS + autofocus core --------------------
  function spotRmsAtSensorX(traces, sensorX) {
    const ys = [];
    for (const tr of traces) {
      if (!tr || tr.vignetted || tr.tir) continue;
      const y = rayHitYAtX(tr.endRay, sensorX);
      if (y == null) continue;
      ys.push(y);
    }
    if (ys.length < 5) return { rms: null, n: ys.length };
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    const rms = Math.sqrt(ys.reduce((acc, y) => acc + (y - mean) ** 2, 0) / ys.length);
    return { rms, n: ys.length };
  }

  function bestLensShiftForDesign(surfaces, fieldAngle, rayCount, wavePreset) {
    const sensorX = 0.0;
    const x0 = 0;
    const range = 22;
    const coarseStep = 0.35;
    const fineStep = 0.07;

    let best = { shift: x0, rms: Infinity, n: 0 };

    function evalShift(shift) {
      computeVertices(surfaces, shift, sensorX);
      const rays = buildRays(surfaces, fieldAngle, rayCount);
      const traces = rays.map((r) => traceRayForward(clone(r), surfaces, wavePreset));
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

    scan(x0, range, coarseStep);
    if (Number.isFinite(best.rms)) scan(best.shift, 2.4, fineStep);
    if (!Number.isFinite(best.rms) || best.n < 5) return { shift: 0, ok: false, rms: null };
    return { shift: best.shift, ok: true, rms: best.rms };
  }

  function autoFocus() {
    if (ui.focusMode) ui.focusMode.value = "lens";
    if (ui.sensorOffset) ui.sensorOffset.value = "0";

    const fieldAngle = Number(ui.fieldAngle?.value || 0);
    const rayCount = Number(ui.rayCount?.value || 31);
    const wavePreset = ui.wavePreset?.value || "d";

    const res = bestLensShiftForDesign(lens.surfaces, fieldAngle, rayCount, wavePreset);

    if (!res.ok) {
      if (ui.footerWarn) ui.footerWarn.textContent =
        "Auto focus (lens) failed (too few valid rays). Try more rays / larger apertures.";
      renderAll();
      return;
    }

    if (ui.lensFocus) ui.lensFocus.value = res.shift.toFixed(2);
    if (ui.footerWarn) ui.footerWarn.textContent =
      `Auto focus (LENS): lensFocus=${res.shift.toFixed(2)}mm • RMS=${res.rms.toFixed(3)}mm`;

    renderAll();
  }

  // -------------------- merit (v1) --------------------
  // Lower = better.
  const MERIT_CFG = {
    rmsNorm: 0.05,            // 0.05mm RMS = "ok" baseline
    vigWeight: 4.5,
    centerVigWeight: 20.0,
    midVigWeight: 10.0,
    covPenalty: 55.0,
    intrusionWeight: 20.0,
    fieldWeights: [1.0, 1.5, 2.0],

    // target terms (optimizer uses these)
    eflWeight: 0.25,          // penalty per mm error (squared)
    tWeight: 18.0,            // penalty per T error (squared)
    bflMin: 52.0,             // for PL: discourage too-short backfocus
    bflWeight: 14.0,
    lowValidPenalty: 28.0,
    hardInvalidPenalty: 650.0,
    covShortfallWeight: 26.0,
    distTargetPct: 2.0,
    distEdgeWeight: 1.2,
    distRmsWeight: 0.7,
    physPenaltyScale: 0.045,
    eflBandFrac: 0.22,
    eflBandWeight: 12.0,
    tBandAbs: 1.15,
    tBandWeight: 18.0,
    intrusionHardMm: 0.75,
    intrusionHardPenalty: 260.0,
  };

  function traceBundleAtField(surfaces, fieldDeg, rayCount, wavePreset, sensorX){
    const rays = buildRays(surfaces, fieldDeg, rayCount);
    const traces = rays.map((r) => traceRayForward(clone(r), surfaces, wavePreset));
    const vCount = traces.filter((t) => t.vignetted).length;
    const vigFrac = traces.length ? (vCount / traces.length) : 1;
    const { rms, n } = spotRmsAtSensorX(traces, sensorX);
    return { traces, rms, n, vigFrac, vCount };
  }

  function computeMeritV1({
    surfaces,
    wavePreset,
    sensorX,
    rayCount,
    fov, maxField, covers, req,
    intrusion,
    efl, T, bfl,
    distEdgePct = null,
    distRmsPct = null,
    targetEfl = null,
    targetT = null,
    physPenalty = 0,
    hardInvalid = false,
  }){
    const edge = Number.isFinite(req) ? Math.min(maxField, req) : maxField;
    const f0 = 0;
    const f1 = edge * 0.65;
    const f2 = edge * 0.95;

    const fields = [f0, f1, f2];
    const fieldWeights = MERIT_CFG.fieldWeights;

    let merit = 0;
    let rmsCenter = null, rmsEdge = null;
    let vigAvg = 0;
    let vigCenter = 1;
    let vigMid = 1;
    let validMin = 999;

    for (let k = 0; k < fields.length; k++){
      const fa = fields[k];
      const pack = traceBundleAtField(surfaces, fa, rayCount, wavePreset, sensorX);

      validMin = Math.min(validMin, pack.n || 0);
      vigAvg += pack.vigFrac / fields.length;

      const rms = Number.isFinite(pack.rms) ? pack.rms : 999;
      if (k === 0) rmsCenter = rms;
      if (k === fields.length - 1) rmsEdge = rms;
      if (k === 0) vigCenter = pack.vigFrac;
      if (k === 1) vigMid = pack.vigFrac;

      const rn = rms / MERIT_CFG.rmsNorm;
      merit += fieldWeights[k] * (rn * rn);
    }

    merit += MERIT_CFG.vigWeight * (vigAvg * vigAvg);
    merit += MERIT_CFG.centerVigWeight * (vigCenter * vigCenter);
    merit += MERIT_CFG.midVigWeight * (vigMid * vigMid);
    if (!covers) merit += MERIT_CFG.covPenalty;
    if (Number.isFinite(req) && Number.isFinite(maxField) && maxField < req) {
      const d = req - maxField;
      merit += MERIT_CFG.covShortfallWeight * (d * d);
    }

    if (Number.isFinite(intrusion) && intrusion > 0){
      const x = intrusion / 1.0;
      merit += MERIT_CFG.intrusionWeight * (x * x);
      if (intrusion > MERIT_CFG.intrusionHardMm) {
        const d = intrusion - MERIT_CFG.intrusionHardMm;
        merit += MERIT_CFG.intrusionHardPenalty + 45.0 * d * d;
      }
    }

    if (Number.isFinite(distEdgePct)) {
      const x = Math.abs(distEdgePct) / Math.max(0.25, MERIT_CFG.distTargetPct);
      merit += MERIT_CFG.distEdgeWeight * (x * x);
    }
    if (Number.isFinite(distRmsPct)) {
      const x = Math.abs(distRmsPct) / Math.max(0.25, MERIT_CFG.distTargetPct);
      merit += MERIT_CFG.distRmsWeight * (x * x);
    }

    // BFL soft-constraint (paraxial) – helps keep designs physically plausible
    if (Number.isFinite(bfl) && bfl < MERIT_CFG.bflMin){
      const d = (MERIT_CFG.bflMin - bfl);
      merit += MERIT_CFG.bflWeight * (d * d);
    }

    // Targets (optional)
    if (Number.isFinite(targetEfl) && Number.isFinite(efl)){
      const d = (efl - targetEfl);
      merit += MERIT_CFG.eflWeight * (d * d);
      const band = Math.max(3.0, Math.abs(targetEfl) * MERIT_CFG.eflBandFrac);
      if (Math.abs(d) > band) {
        const x = Math.abs(d) - band;
        merit += MERIT_CFG.eflBandWeight * (x * x);
      }
    }
    if (Number.isFinite(targetT) && Number.isFinite(T)){
      const d = (T - targetT);
      merit += MERIT_CFG.tWeight * (d * d);
      if (Math.abs(d) > MERIT_CFG.tBandAbs) {
        const x = Math.abs(d) - MERIT_CFG.tBandAbs;
        merit += MERIT_CFG.tBandWeight * (x * x);
      }
    }

    const minValidTarget = Math.max(7, Math.floor(rayCount * 0.45));
    if (validMin < minValidTarget) {
      const d = (minValidTarget - validMin);
      merit += MERIT_CFG.lowValidPenalty + 4.0 * d * d;
    }

    if (Number.isFinite(physPenalty) && physPenalty > 0) merit += MERIT_CFG.physPenaltyScale * physPenalty;
    if (hardInvalid) merit += MERIT_CFG.hardInvalidPenalty;

    const breakdown = {
      rmsCenter, rmsEdge,
      vigPct: Math.round(vigAvg * 100),
      covers,
      intrusion: Number.isFinite(intrusion) ? intrusion : null,
      fields: fields.map(v => Number.isFinite(v) ? v : 0),
      vigCenterPct: Math.round(vigCenter * 100),
      vigMidPct: Math.round(vigMid * 100),
      distEdgePct: Number.isFinite(distEdgePct) ? distEdgePct : null,
      distRmsPct: Number.isFinite(distRmsPct) ? distRmsPct : null,
      physPenalty: Number.isFinite(physPenalty) ? physPenalty : 0,
      hardInvalid: !!hardInvalid,
    };

    return { merit, breakdown };
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
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
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
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
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
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(220,235,255,0.55)";
    ctx.shadowColor = "rgba(70,140,255,0.35)";
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();
  }

  function drawElementsClosed(world, surfaces) {
    let minNonOverlap = Infinity;

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
        minNonOverlap = Math.min(minNonOverlap, nonOverlap);
        apRegion = Math.min(apRegion, nonOverlap);
      }

      drawElementBody(world, sA, sB, apRegion);
    }

    if (Number.isFinite(minNonOverlap) && minNonOverlap < 0.5 && ui.footerWarn) {
      ui.footerWarn.textContent =
        "WARNING: element surfaces overlap / too thin somewhere — increase t or reduce curvature/aperture.";
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
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
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
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
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
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.setLineDash([3, 6]);
    ctx.lineWidth = 1.25;
    const l1 = worldToScreen({ x: sensorX - 2.5, y: halfH }, world);
    const l2 = worldToScreen({ x: sensorX + 2.5, y: halfH }, world);
    const l3 = worldToScreen({ x: sensorX - 2.5, y: -halfH }, world);
    const l4 = worldToScreen({ x: sensorX + 2.5, y: -halfH }, world);

    ctx.beginPath();
    ctx.moveTo(l1.x, l1.y);
    ctx.lineTo(l2.x, l2.y);
    ctx.moveTo(l3.x, l3.y);
    ctx.lineTo(l4.x, l4.y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
  }

  // -------- PL mount visuals ----------
  const PL_FFD = 52.0;
  const PL_LENS_LIP = 3.0;

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

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawPLMountCutout(world, xFlange, opts = {}) {
    if (!ctx) return;

    const throatR = Number.isFinite(opts.throatR) ? opts.throatR : 27;
    const outerR  = Number.isFinite(opts.outerR)  ? opts.outerR  : 31;
    const camDepth= Number.isFinite(opts.camDepth)? opts.camDepth: 14;
    const lensLip = Number.isFinite(opts.lensLip) ? opts.lensLip : 3;
    const flangeT = Number.isFinite(opts.flangeT) ? opts.flangeT : 2.0;

    const P = (x, y) => worldToScreen({ x, y }, world);

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.fillStyle = "rgba(255,255,255,.02)";

    // flange face
    {
      const a = P(xFlange, -outerR);
      const b = P(xFlange, outerR);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // flange thickness
    {
      const a = P(xFlange, -outerR);
      const b = P(xFlange + flangeT, -outerR);
      const c = P(xFlange + flangeT, outerR);
      const d = P(xFlange, outerR);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // throat tube
    {
      const a = P(xFlange - lensLip, -throatR);
      const b = P(xFlange + camDepth, -throatR);
      const c = P(xFlange + camDepth, throatR);
      const d = P(xFlange - lensLip, throatR);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.stroke();

      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.restore();
    }

    // tiny shoulder
    {
      const shoulderX = xFlange + flangeT;
      const a = P(shoulderX, -outerR);
      const b = P(shoulderX + 3.0, -outerR);
      const c = P(shoulderX + 3.0, outerR);
      const d = P(shoulderX, outerR);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const mono = (getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace").trim();
    ctx.font = `11px ${mono}`;
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const lab = P(xFlange - lensLip + 1.5, outerR + 6);
    ctx.fillText("PL mount • Ø54 throat • flange @ -52mm", lab.x, lab.y);

    ctx.restore();
  }

  function drawTitleOverlay(partsOrText) {
    if (!ctx || !canvas) return;

    const mono = (getComputedStyle(document.documentElement).getPropertyValue("--mono") || "ui-monospace").trim();
    const r = canvas.getBoundingClientRect();

    const padX = 14;
    const padY = 10;
    const maxW = r.width - padX * 2;

    const fontSize = 13;
    const lineH = 17;
    const maxLines = 3;

    let parts = [];
    if (Array.isArray(partsOrText)) {
      parts = partsOrText.map(s => String(s || "").trim()).filter(Boolean);
    } else {
      parts = String(partsOrText || "")
        .split(" • ")
        .map(s => s.trim())
        .filter(Boolean);
    }

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
        if (lines.length >= maxLines) break;
      }
    }
    if (lines.length < maxLines && cur) lines.push(cur);

    if (lines.length === maxLines && parts.length) {
      let last = lines[maxLines - 1];
      while (ctx.measureText(last + " …").width > maxW && last.length > 0) last = last.slice(0, -1);
      lines[maxLines - 1] = last + " …";
    }

    const barH = padY * 2 + lines.length * lineH;

    ctx.fillStyle = "rgba(0,0,0,.62)";
    ctx.fillRect(8, 6, r.width - 16, barH);

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], padX, 6 + padY + i * lineH);
    }
    ctx.restore();
  }

  // -------------------- render scheduler --------------------
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
    if (ui.footerWarn) ui.footerWarn.textContent = "";

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

    const covMode = COVERAGE_CFG.mode;
    const covHalfMm = coverageHalfSizeWithFloorMm(sensorW, sensorH, covMode);
    const maxFieldChief = coverageTestMaxFieldDeg(lens.surfaces, wavePreset, sensorX, covHalfMm);
    const maxFieldUsable = usableCoverageFieldDeg(lens.surfaces, wavePreset, sensorX, covHalfMm, rayCount);
    const maxField = Math.min(maxFieldChief, maxFieldUsable);
    const reqFloor = coverageRequirementDeg(efl, sensorW, sensorH, covMode);
    const reqFromFov = coversSensorYesNo({ fov, maxField, mode: covMode, marginDeg: COVERAGE_CFG.marginDeg }).req;
    const req = Number.isFinite(reqFloor) ? reqFloor : reqFromFov;
    const covers = Number.isFinite(req) ? (maxField + COVERAGE_CFG.marginDeg >= req) : false;
    const dist = computeDistortionMetrics(lens.surfaces, wavePreset, sensorX, efl, req, maxField);

    const covTxt = !fov
      ? "COV(D): —"
      : `COV(D): ±${maxField.toFixed(1)}° • REQ(D): ${(req ?? 0).toFixed(1)}° • ${covers ? "COVERS ✅" : "NO ❌"}`;

    const rearVx = lastPhysicalVertexX(lens.surfaces);
    const intrusion = rearVx - plX;
    const phys = evaluatePhysicalConstraints(lens.surfaces);

    const meritRes = computeMeritV1({
      surfaces: lens.surfaces,
      wavePreset,
      sensorX,
      rayCount,
      fov, maxField, covers, req,
      intrusion,
      efl, T, bfl,
      distEdgePct: dist.edgePct,
      distRmsPct: dist.rmsPct,
      targetEfl: Number(ui.optTargetFL?.value || NaN),
      targetT: Number(ui.optTargetT?.value || NaN),
      physPenalty: phys.penalty,
      hardInvalid: phys.hardFail,
    });

    const m = meritRes.merit;
    const bd = meritRes.breakdown;

    const meritTxt =
      `Merit: ${Number.isFinite(m) ? m.toFixed(2) : "—"} ` +
      `(RMS0 ${bd.rmsCenter?.toFixed?.(3) ?? "—"}mm • RMSedge ${bd.rmsEdge?.toFixed?.(3) ?? "—"}mm • Vig ${bd.vigPct}%` +
      `${Number.isFinite(bd.vigCenterPct) ? ` • V0 ${bd.vigCenterPct}%` : ""}` +
      `${Number.isFinite(bd.vigMidPct) ? ` • Vmid ${bd.vigMidPct}%` : ""}` +
      `${Number.isFinite(bd.distEdgePct) ? ` • DistE ${bd.distEdgePct.toFixed(2)}%` : ""}` +
      `${bd.intrusion != null && bd.intrusion > 0 ? ` • INTR +${bd.intrusion.toFixed(2)}mm` : ""}` +
      `${bd.physPenalty > 0 ? ` • PHYS +${bd.physPenalty.toFixed(1)}` : ""}` +
      `${bd.hardInvalid ? " • INVALID ❌" : ""})`;

    if (ui.merit) ui.merit.textContent = `Merit: ${Number.isFinite(m) ? m.toFixed(2) : "—"}`;
    if (ui.meritTop) ui.meritTop.textContent = `Merit: ${Number.isFinite(m) ? m.toFixed(2) : "—"}`;

    const rearTxt = (intrusion > 0)
      ? `REAR INTRUSION: +${intrusion.toFixed(2)}mm ❌`
      : `REAR CLEAR: ${Math.abs(intrusion).toFixed(2)}mm ✅`;

    const frontVx = firstPhysicalVertexX(lens.surfaces);
    const lenToFlange = plX - frontVx;
    const totalLen = lenToFlange + PL_LENS_LIP;
    const lenTxt = (Number.isFinite(totalLen) && totalLen > 0)
      ? `LEN≈ ${totalLen.toFixed(1)}mm (front→PL + mount)`
      : `LEN≈ —`;

    if (ui.efl) ui.efl.textContent = `Focal Length: ${efl == null ? "—" : efl.toFixed(2)}mm`;
    if (ui.bfl) ui.bfl.textContent = `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
    if (ui.tstop) ui.tstop.textContent = `T≈ ${T == null ? "—" : "T" + T.toFixed(2)}`;
    if (ui.vig) ui.vig.textContent = `Vignette: ${vigPct}%`;
    if (ui.dist) ui.dist.textContent = `Dist: ${Number.isFinite(dist.edgePct) ? dist.edgePct.toFixed(2) + "%" : "—"}`;
    if (ui.fov) ui.fov.textContent = fovTxt;
    if (ui.cov) ui.cov.textContent = covers ? "COV: YES" : "COV: NO";

    if (ui.eflTop) ui.eflTop.textContent = ui.efl?.textContent || `EFL: ${efl == null ? "—" : efl.toFixed(2)}mm`;
    if (ui.bflTop) ui.bflTop.textContent = ui.bfl?.textContent || `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
    if (ui.tstopTop) ui.tstopTop.textContent = ui.tstop?.textContent || `T≈ ${T == null ? "—" : "T" + T.toFixed(2)}`;
    if (ui.fovTop) ui.fovTop.textContent = fovTxt;
    if (ui.covTop) ui.covTop.textContent = ui.cov?.textContent || (covers ? "COV: YES" : "COV: NO");
    if (ui.distTop) ui.distTop.textContent = ui.dist?.textContent || `Dist: ${Number.isFinite(dist.edgePct) ? dist.edgePct.toFixed(2) + "%" : "—"}`;

    if (phys.hardFail && ui.footerWarn) {
      ui.footerWarn.textContent =
        `INVALID geometry: overlap/clearance issue (overlap ${phys.worstOverlap.toFixed(2)}mm, pinch ${phys.worstPinch.toFixed(2)}mm).`;
    } else if (phys.airGapCount < PHYS_CFG.minAirGapsPreferred && ui.footerWarn) {
      ui.footerWarn.textContent =
        `Few air gaps (${phys.airGapCount}); aim for >= ${PHYS_CFG.minAirGapsPreferred} for practical designs.`;
    } else if (tirCount > 0 && ui.footerWarn) {
      ui.footerWarn.textContent = `TIR on ${tirCount} rays (check glass / curvature).`;
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
    drawPLMountCutout(world, plX);
    drawSensor(world, sensorX, halfH);

    const eflTxt = efl == null ? "—" : `${efl.toFixed(2)}mm`;
    const tTxt   = T == null ? "—" : `T${T.toFixed(2)}`;
    const focusTxt = (focusMode === "cam")
      ? `CamFocus ${sensorX.toFixed(2)}mm`
      : `LensFocus ${lensShift.toFixed(2)}mm`;

    drawTitleOverlay([
      lens?.name || "Lens",
      `EFL ${eflTxt}`,
      `BFL ${bfl == null ? "—" : bfl.toFixed(2) + "mm"}`,
      tTxt,
      fovTxt,
      covTxt,
      rearTxt,
      lenTxt,
      focusTxt,
    ]);
  }

  // -------------------- view controls (RAYS canvas) --------------------
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
      view.zoom = Math.max(0.12, Math.min(12, view.zoom * factor));
      renderAll();
    }, { passive: false });

    canvas.addEventListener("dblclick", () => {
      view.panX = 0; view.panY = 0; view.zoom = 1.0;
      renderAll();
    });
  }

  // -------------------- editing actions --------------------
  function isProtectedIndex(i) {
    const t = String(lens.surfaces[i]?.type || "").toUpperCase();
    return t === "OBJ" || t === "IMS";
  }

  function getIMSIndex() {
    return lens.surfaces.findIndex((s) => String(s.type).toUpperCase() === "IMS");
  }

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
    clampAllApertures(lens.surfaces);
    buildTable();
    applySensorToIMS();
    renderAll();
  }

  function insertAfterSelected(surfaceObj) {
    const at = safeInsertAtAfterSelected();
    insertSurface(at, surfaceObj);
  }

  function addSurface() {
    insertAfterSelected({ type: "", R: 0.0, t: 4.0, ap: 18.0, glass: "AIR", stop: false });
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
        { type: "STOP", R: 0.0, t: 20.0, ap: 8.0,  glass: "AIR", stop: true },
        { type: "IMS",  R: 0.0, t: 0.0,  ap: 12.77, glass: "AIR", stop: false },
      ],
    });
    toast("New / Clear");
  }

  // -------------------- element modal (+Element) --------------------
  function openElementModal() {
    if (!ui.elementModal) return;

    const opts = Object.keys(GLASS_DB)
      .filter(k => k !== "AIR")
      .map(k => `<option value="${k}">${k}</option>`)
      .join("");

    ui.elementModal.innerHTML = `
      <div class="modalCard" role="dialog" aria-modal="true" aria-label="Add Element">
        <div class="modalTop">
          <div>
            <div class="modalTitle">Add Element (2 surfaces)</div>
            <div class="modalSub">Front surface krijgt GLASS, back surface = AIR. Dikte = glasdikte (t) op de front surface.</div>
          </div>
          <button class="modalX" id="elClose" type="button">✕</button>
        </div>
        <div class="modalScroll">
          <div class="modalGrid">
            <div class="field">
              <label>Front R</label>
              <input id="elR1" type="number" step="0.01" value="40" />
            </div>
            <div class="field">
              <label>Back R</label>
              <input id="elR2" type="number" step="0.01" value="-60" />
            </div>
            <div class="field">
              <label>Glass thickness (t)</label>
              <input id="elT" type="number" step="0.01" value="6" />
            </div>
            <div class="field">
              <label>Air gap after element</label>
              <input id="elAir" type="number" step="0.01" value="2" />
            </div>
            <div class="field">
              <label>Aperture (semi-diam)</label>
              <input id="elAp" type="number" step="0.01" value="18" />
            </div>
            <div class="field">
              <label>Glass</label>
              <select id="elGlass">${opts}</select>
            </div>
            <div class="fieldFull">
              <div class="hint">Tip: wil je een achromaat? Zet 2 elementen achter elkaar met verschillende glassoorten (crown + flint) en speel met R.</div>
            </div>
          </div>
        </div>
        <div class="modalBottom">
          <button class="btn" id="elCancel" type="button">Cancel</button>
          <button class="btn btnPrimary" id="elAdd" type="button">Insert</button>
        </div>
      </div>
    `;

    ui.elementModal.classList.remove("hidden");
    ui.elementModal.setAttribute("aria-hidden","false");

    const close = () => {
      ui.elementModal.classList.add("hidden");
      ui.elementModal.setAttribute("aria-hidden","true");
      ui.elementModal.innerHTML = "";
    };

    ui.elementModal.querySelector("#elClose")?.addEventListener("click", close);
    ui.elementModal.querySelector("#elCancel")?.addEventListener("click", close);
    ui.elementModal.addEventListener("click", (e) => {
      if (e.target === ui.elementModal) close();
    });

    ui.elementModal.querySelector("#elAdd")?.addEventListener("click", () => {
      const R1 = num($("#elR1")?.value, 0);
      const R2 = num($("#elR2")?.value, 0);
      const tG = Math.max(0.01, num($("#elT")?.value, 4));
      const tAir = Math.max(0.01, num($("#elAir")?.value, 2));
      const ap = Math.max(0.5, num($("#elAp")?.value, 18));
      const g = resolveGlassName($("#elGlass")?.value || "N-BK7HT");

      const at = safeInsertAtAfterSelected();
      // front surface: after it is GLASS
      lens.surfaces.splice(at, 0, { type: "", R: R1, t: tG, ap, glass: g, stop: false });
      // back surface: after it is AIR
      lens.surfaces.splice(at + 1, 0, { type: "", R: R2, t: tAir, ap, glass: "AIR", stop: false });

      lens = sanitizeLens(lens);
      clampAllApertures(lens.surfaces);
      selectedIndex = at;
      buildTable();
      applySensorToIMS();
      renderAll();
      close();
      toast("Element inserted");
    });
  }

  // -------------------- Scale → FL + Set T --------------------
  function scaleToFocal() {
    const target = num(prompt("Target focal length (mm)?", String(ui.optTargetFL?.value || "75")), NaN);
    if (!Number.isFinite(target) || target <= 1) return;

    const wave = ui.wavePreset?.value || "d";
    computeVertices(lens.surfaces, 0, 0);
    const { efl } = estimateEflBflParaxial(lens.surfaces, wave);
    if (!Number.isFinite(efl) || efl <= 1) return toast("Scale failed (EFL not solvable)");

    const k = target / efl;

    for (let i = 0; i < lens.surfaces.length; i++) {
      const s = lens.surfaces[i];
      const t = String(s.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;

      // scale geometry
      s.R = Number(s.R) * k;
      s.t = Number(s.t) * k;
      s.ap = Number(s.ap) * k;
    }

    // keep sensor half-height (IMS ap)
    applySensorToIMS();
    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    toast(`Scaled ×${k.toFixed(3)} → ${target.toFixed(1)}mm`);
  }

  function setTStop() {
    const targetT = num(prompt("Target T-stop?", String(ui.optTargetT?.value || "2.0")), NaN);
    if (!Number.isFinite(targetT) || targetT <= 0.2) return;

    const stopIdx = findStopSurfaceIndex(lens.surfaces);
    if (stopIdx < 0) return toast("No STOP surface selected");

    const wave = ui.wavePreset?.value || "d";
    computeVertices(lens.surfaces, 0, 0);
    const { efl } = estimateEflBflParaxial(lens.surfaces, wave);
    if (!Number.isFinite(efl) || efl <= 1) return toast("Set T failed (EFL not solvable)");

    const desiredStopAp = efl / (2 * targetT);
    lens.surfaces[stopIdx].ap = clamp(desiredStopAp, 0.2, maxApForSurface(lens.surfaces[stopIdx]));

    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    toast(`STOP ap → ${lens.surfaces[stopIdx].ap.toFixed(2)} (T≈${targetT.toFixed(2)})`);
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

  // -------------------- fullscreen (rays) --------------------
  function toggleFullscreen(el) {
    if (!el) return;
    const isFS = document.fullscreenElement;
    if (!isFS) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  // ===========================
  // OPTIMIZER
  // ===========================
  let optRunning = false;
  let optBest = null; // {lens, score, meta}

  function setOptLog(lines){
    if (!ui.optLog) return;
    ui.optLog.value = String(lines || "");
  }

  function randn(){
    // Box–Muller
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  function pick(arr){ return arr[(Math.random() * arr.length) | 0]; }

  function surfaceIsLocked(s){
    const t = String(s?.type || "").toUpperCase();
    return t === "OBJ" || t === "IMS";
  }

  function lensHasStop(surfaces){
    return findStopSurfaceIndex(surfaces) >= 0;
  }

  function ensureStopExists(surfaces){
    if (lensHasStop(surfaces)) return;
    // set first non-OBJ non-IMS surface as stop
    for (let i=0;i<surfaces.length;i++){
      const t = String(surfaces[i]?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      surfaces[i].stop = true;
      surfaces[i].type = "STOP";
      break;
    }
  }

  function quickSanity(surfaces){
    // avoid negative thickness & crazy apertures
    for (const s of surfaces){
      const t = String(s.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      s.t = Math.max(PHYS_CFG.minThickness, Number(s.t || 0));
      s.ap = Math.max(PHYS_CFG.minAperture, Number(s.ap || 0));
      s.glass = resolveGlassName(s.glass);
      clampSurfaceAp(s);
    }

    // discourage abrupt aperture pinches (common optimizer failure mode)
    for (let i = 1; i < surfaces.length - 1; i++) {
      const a = surfaces[i - 1], b = surfaces[i], c = surfaces[i + 1];
      const ta = String(a?.type || "").toUpperCase();
      const tb = String(b?.type || "").toUpperCase();
      const tc = String(c?.type || "").toUpperCase();
      if (ta === "OBJ" || tb === "OBJ" || tc === "OBJ") continue;
      if (ta === "IMS" || tb === "IMS" || tc === "IMS") continue;
      const ref = Math.min(Number(a.ap || 0), Number(c.ap || 0));
      if (ref > 0.5 && Number(b.ap || 0) < 0.45 * ref) b.ap = 0.45 * ref;
      clampSurfaceAp(b);
    }
  }

  function captureTopology(lensObj) {
    const s = lensObj?.surfaces || [];
    return {
      count: s.length,
      media: s.map((x) => String(resolveGlassName(x?.glass)).toUpperCase() === "AIR" ? "AIR" : "GLASS"),
      stopIdx: findStopSurfaceIndex(s),
    };
  }

  function enforceTopology(surfaces, topo) {
    if (!Array.isArray(surfaces) || !topo) return false;
    if (!Number.isFinite(topo.count) || surfaces.length !== topo.count) return false;

    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;

      const want = topo.media?.[i];
      if (want === "AIR") {
        s.glass = "AIR";
      } else if (want === "GLASS") {
        // keep glass family but never collapse to AIR
        const g = resolveGlassName(s.glass);
        s.glass = (String(g).toUpperCase() === "AIR") ? "N-BK7HT" : g;
      }
    }

    const lockStop = Number.isFinite(topo.stopIdx) ? topo.stopIdx : -1;
    surfaces.forEach((s, i) => {
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") {
        s.stop = false;
        return;
      }
      s.stop = (i === lockStop);
      if (s.stop) s.type = "STOP";
    });
    return true;
  }

  function mutateLens(baseLens, mode, topo = null){
    const L = clone(baseLens);
    L.name = baseLens.name;

    const s = L.surfaces;

    // occasionally: add/remove a surface (wild mode)
    if (!topo && mode === "wild" && Math.random() < 0.03){
      const imsIdx = s.findIndex(x => String(x.type).toUpperCase()==="IMS");
      const canRemove = s.length > 6;

      if (canRemove && Math.random() < 0.5){
        // remove a random non-locked surface
        const idxs = s.map((x,i)=>({x,i})).filter(o=>!surfaceIsLocked(o.x));
        if (idxs.length){
          const ri = pick(idxs).i;
          s.splice(ri,1);
        }
      } else {
        // insert a random surface before IMS
        const at = Math.max(1, Math.min(imsIdx >= 0 ? imsIdx : s.length-1, 1 + ((Math.random()*Math.max(1,(s.length-2)))|0)));
        s.splice(at,0,{ type:"", R: (Math.random()<0.5?1:-1)*(16+Math.random()*160), t: 0.4+Math.random()*8, ap: 4+Math.random()*20, glass: (Math.random()<0.15?"AIR":pick(GLASS_LIST)), stop:false });
      }
    }

    // main: perturb a few parameters
    const kChanges = mode === "wild" ? 6 : 3;
    for (let c=0;c<kChanges;c++){
      const idxs = s.map((x,i)=>({x,i})).filter(o=>!surfaceIsLocked(o.x));
      if (!idxs.length) break;
      const o = pick(idxs);
      const ss = o.x;

      const choice = Math.random();
      if (choice < 0.45){
        // radius tweak
        const scale = mode === "wild" ? 0.35 : 0.18;
        const d = randn() * scale;
        const R = Number(ss.R || 0);
        const absR = Math.max(PHYS_CFG.minRadius, Math.abs(R));
        const newAbs = absR * (1 + d);
        ss.R = (R >= 0 ? 1 : -1) * clamp(newAbs, PHYS_CFG.minRadius, 450);
      } else if (choice < 0.70){
        // thickness tweak
        const scale = mode === "wild" ? 0.55 : 0.25;
        const d = randn() * scale;
        ss.t = clamp(Number(ss.t||0) * (1 + d), PHYS_CFG.minThickness, 42);
      } else if (choice < 0.88){
        // aperture tweak
        const scale = ss.stop ? (mode === "wild" ? 0.65 : 0.32) : (mode === "wild" ? 0.45 : 0.20);
        const d = randn() * scale;
        ss.ap = clamp(Number(ss.ap||0) * (1 + d), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
      } else {
        // glass swap
        const lock = topo?.media?.[o.i];
        if (lock === "AIR") ss.glass = "AIR";
        else ss.glass = pick(GLASS_LIST);
      }

      // sometimes toggle stop
      if (!topo && mode === "wild" && Math.random() < 0.015){
        ss.stop = !ss.stop;
        if (ss.stop) ss.type = "STOP";
      }
    }

    ensureStopExists(s);
    // enforce single stop
    const firstStop = s.findIndex(x => !!x.stop);
    if (firstStop >= 0) s.forEach((x,i)=>{ if (i!==firstStop) x.stop=false; });

    // keep OBJ/IMS types correct
    if (s.length) s[0].type = "OBJ";
    if (s.length) s[s.length-1].type = "IMS";

    if (topo) enforceTopology(s, topo);
    quickSanity(s);
    if (topo) enforceTopology(s, topo);
    return sanitizeLens(L);
  }

  function evalLensMerit(lensObj, {targetEfl, targetT, fieldAngle, rayCount, wavePreset, sensorW, sensorH}){
    const tmp = clone(lensObj);
    const surfaces = tmp.surfaces;

    // IMS ap = half height
    const halfH = Math.max(0.1, sensorH * 0.5);
    const ims = surfaces[surfaces.length-1];
    if (ims && String(ims.type).toUpperCase()==="IMS") ims.ap = halfH;

    // Keep optimizer evaluation in fixed mount geometry.
    // Lens-shift autofocus can move designs behind the PL flange and break physical ranking.
    const lensShift = 0;

    const sensorX = 0.0;
    computeVertices(surfaces, lensShift, sensorX);
    const phys = evaluatePhysicalConstraints(surfaces);
    const rearVxPre = lastPhysicalVertexX(surfaces);
    const intrusionPre = rearVxPre - (-PL_FFD);
    const hardMountFail = Number.isFinite(intrusionPre) && intrusionPre > MERIT_CFG.intrusionHardMm;

    if (phys.hardFail || hardMountFail) {
      const mountPenalty = hardMountFail ? (MERIT_CFG.intrusionHardPenalty + 50 * Math.pow(intrusionPre - MERIT_CFG.intrusionHardMm, 2)) : 0;
      const score = MERIT_CFG.hardInvalidPenalty + MERIT_CFG.physPenaltyScale * Math.max(0, Number(phys.penalty || 0)) + mountPenalty;
      return {
        score,
        efl: null,
        T: null,
        bfl: null,
        covers: false,
        intrusion: Number.isFinite(intrusionPre) ? intrusionPre : 0,
        vigFrac: 1,
        lensShift,
        rms0: null,
        rmsE: null,
        breakdown: {
          rmsCenter: null,
          rmsEdge: null,
          vigPct: 100,
          covers: false,
          intrusion: null,
          fields: [0, 0, 0],
          distEdgePct: null,
          distRmsPct: null,
          physPenalty: Number((phys.penalty || 0) + mountPenalty),
          hardInvalid: true,
        },
      };
    }

    const rays = buildRays(surfaces, fieldAngle, rayCount);
    const traces = rays.map(r => traceRayForward(clone(r), surfaces, wavePreset));

    const vCount = traces.filter(t=>t.vignetted).length;
    const vigFrac = traces.length ? (vCount / traces.length) : 1;

    const { efl, bfl } = estimateEflBflParaxial(surfaces, wavePreset);
    const T = estimateTStopApprox(efl, surfaces);

    const fov = computeFovDeg(efl, sensorW, sensorH);
    const covMode = COVERAGE_CFG.mode;
    const covHalfMm = coverageHalfSizeWithFloorMm(sensorW, sensorH, covMode);
    const maxFieldChief = coverageTestMaxFieldDeg(surfaces, wavePreset, sensorX, covHalfMm);
    const maxFieldUsable = usableCoverageFieldDeg(surfaces, wavePreset, sensorX, covHalfMm, rayCount);
    const maxField = Math.min(maxFieldChief, maxFieldUsable);
    const req = coverageRequirementDeg(efl, sensorW, sensorH, covMode);
    const covers = Number.isFinite(req) ? (maxField + COVERAGE_CFG.marginDeg >= req) : false;
    const dist = computeDistortionMetrics(surfaces, wavePreset, sensorX, efl, req, maxField);

    const rearVx = lastPhysicalVertexX(surfaces);
    const intrusion = rearVx - (-PL_FFD);

    const meritRes = computeMeritV1({
      surfaces,
      wavePreset,
      sensorX,
      rayCount,
      fov, maxField, covers, req,
      intrusion,
      efl, T, bfl,
      distEdgePct: dist.edgePct,
      distRmsPct: dist.rmsPct,
      targetEfl,
      targetT,
      physPenalty: phys.penalty,
      hardInvalid: phys.hardFail,
    });

    // tiny extra: hard fail if NaNs
    let score = Number.isFinite(meritRes.merit) ? meritRes.merit : 1e9;
    if (Number.isFinite(targetEfl) && Number.isFinite(efl) && targetEfl > 1) {
      const lo = 0.6 * targetEfl;
      const hi = 1.5 * targetEfl;
      if (efl < lo) score += 220 + 9 * Math.pow(lo - efl, 2);
      if (efl > hi) score += 220 + 9 * Math.pow(efl - hi, 2);
    }

    return {
      score,
      efl,
      T,
      bfl,
      covers,
      intrusion,
      vigFrac,
      lensShift,
      rms0: meritRes.breakdown.rmsCenter,
      rmsE: meritRes.breakdown.rmsEdge,
      breakdown: meritRes.breakdown,
    };
  }

  async function runOptimizer(){
    if (optRunning) return;
    optRunning = true;

    const targetEfl = num(ui.optTargetFL?.value, 75);
    const targetT = num(ui.optTargetT?.value, 2.0);
    const iters = Math.max(10, (num(ui.optIters?.value, 2000) | 0));
    const mode = (ui.optPop?.value || "safe");

    // snapshot sensor settings
    const { w: sensorW, h: sensorH } = getSensorWH();
    const fieldAngle = num(ui.fieldAngle?.value, 0);
    const rayCount = Math.max(9, Math.min(61, (num(ui.rayCount?.value, 31) | 0))); // limit for speed
    const wavePreset = ui.wavePreset?.value || "d";

    const startLens = sanitizeLens(lens);
    const topo = captureTopology(startLens);

    let cur = startLens;
    let curEval = evalLensMerit(cur, {targetEfl, targetT, fieldAngle, rayCount, wavePreset, sensorW, sensorH});
    let best = { lens: clone(cur), eval: curEval, iter: 0 };

    // annealing-ish (adaptive to current score scale)
    const scoreScale = Math.max(1.0, Math.sqrt(Math.max(1.0, curEval.score || 1)));
    let temp0 = (mode === "wild" ? 2.4 : 1.35) * scoreScale;
    let temp1 = (mode === "wild" ? 0.16 : 0.08) * scoreScale;

    const tStart = performance.now();

    const BATCH = 60;

    for (let i = 1; i <= iters; i++){
      if (!optRunning) break;

      const a = i / iters;
      const temp = temp0 * (1 - a) + temp1 * a;

      const cand = mutateLens(cur, mode, topo);
      const candEval = evalLensMerit(cand, {targetEfl, targetT, fieldAngle, rayCount, wavePreset, sensorW, sensorH});

      const d = candEval.score - curEval.score;
      const accept = (d <= 0) || (Math.random() < Math.exp(-d / Math.max(1e-9, temp)));
      if (accept){
        cur = cand;
        curEval = candEval;
      }

      if (candEval.score < best.eval.score){
        best = { lens: clone(cand), eval: candEval, iter: i };

        // UI update (rare)
        if (ui.optLog){
          setOptLog(
            `best @${i}/${iters}\n` +
            `score ${best.eval.score.toFixed(2)}\n` +
            `EFL ${Number.isFinite(best.eval.efl)?best.eval.efl.toFixed(2):"—"}mm (target ${targetEfl})\n` +
            `T ${Number.isFinite(best.eval.T)?best.eval.T.toFixed(2):"—"} (target ${targetT})\n` +
            `COV ${best.eval.covers?"YES":"NO"} • INTR ${best.eval.intrusion.toFixed(2)}mm\n` +
            `RMS0 ${best.eval.rms0?.toFixed?.(3) ?? "—"}mm • RMSedge ${best.eval.rmsE?.toFixed?.(3) ?? "—"}mm\n`
          );
        }
      }

      if (i % BATCH === 0){
        const tNow = performance.now();
        const dt = (tNow - tStart) / 1000;
        const ips = i / Math.max(1e-6, dt);
        if (ui.optLog){
          setOptLog(
            `running… ${i}/${iters}  (${ips.toFixed(1)} it/s)\n` +
            `current ${curEval.score.toFixed(2)} • best ${best.eval.score.toFixed(2)} @${best.iter}\n` +
            `best: EFL ${Number.isFinite(best.eval.efl)?best.eval.efl.toFixed(2):"—"}mm • T ${Number.isFinite(best.eval.T)?best.eval.T.toFixed(2):"—"} • COV ${best.eval.covers?"YES":"NO"} • INTR ${best.eval.intrusion.toFixed(2)}mm\n`
          );
        }
        // yield to UI
        await new Promise(r => setTimeout(r, 0));
      }
    }

    optBest = best;
    optRunning = false;

    const tEnd = performance.now();
    const sec = (tEnd - tStart) / 1000;
    if (ui.optLog){
      setOptLog(
        `done ${best.iter}/${iters}  (${(iters/Math.max(1e-6,sec)).toFixed(1)} it/s)\n` +
        `BEST score ${best.eval.score.toFixed(2)}\n` +
        `EFL ${Number.isFinite(best.eval.efl)?best.eval.efl.toFixed(2):"—"}mm (target ${targetEfl})\n` +
        `T ${Number.isFinite(best.eval.T)?best.eval.T.toFixed(2):"—"} (target ${targetT})\n` +
        `COV ${best.eval.covers?"YES":"NO"} • INTR ${best.eval.intrusion.toFixed(2)}mm\n` +
        `RMS0 ${best.eval.rms0?.toFixed?.(3) ?? "—"}mm • RMSedge ${best.eval.rmsE?.toFixed?.(3) ?? "—"}mm\n` +
        `Click “Apply best” to load.`
      );
    }

    toast(optBest ? `Optimize done. Best merit ${optBest.eval.score.toFixed(2)}` : "Optimize stopped");
  }

  function stopOptimizer(){
    if (!optRunning) return;
    optRunning = false;
    toast("Stopping…");
  }

  function applyBest(){
    if (!optBest?.lens) return toast("No best yet");
    loadLens(optBest.lens);
    // set lensFocus from best
    if (ui.focusMode) ui.focusMode.value = "lens";
    if (ui.sensorOffset) ui.sensorOffset.value = "0";
    if (ui.lensFocus) ui.lensFocus.value = Number(optBest.eval.lensShift || 0).toFixed(2);
    renderAll();
    toast("Applied best");
  }

  function benchOptimizer(){
    const N = 200;
    const targetEfl = num(ui.optTargetFL?.value, 75);
    const targetT = num(ui.optTargetT?.value, 2.0);
    const { w: sensorW, h: sensorH } = getSensorWH();
    const fieldAngle = num(ui.fieldAngle?.value, 0);
    const rayCount = Math.max(9, Math.min(61, (num(ui.rayCount?.value, 31) | 0)));
    const wavePreset = ui.wavePreset?.value || "d";

    const t0 = performance.now();
    let best = Infinity;
    for (let i=0;i<N;i++){
      const res = evalLensMerit(lens, {targetEfl, targetT, fieldAngle, rayCount, wavePreset, sensorW, sensorH});
      if (res.score < best) best = res.score;
    }
    const t1 = performance.now();
    const sec = (t1 - t0)/1000;
    const eps = N / Math.max(1e-6, sec);
    setOptLog(`bench ${N} evals\n${eps.toFixed(1)} eval/s\nbest seen ${best.toFixed(2)}\n(rays=${rayCount}, field=${fieldAngle}°, wave=${wavePreset})`);
    toast(`Bench: ${eps.toFixed(1)} eval/s`);
  }

  // -------------------- init wiring --------------------
  function wireUI() {
    populateSensorPresetsSelect();
    applyPreset(ui.sensorPreset?.value || "ARRI Alexa Mini LF (LF)");

    ui.sensorPreset?.addEventListener("change", () => {
      applyPreset(ui.sensorPreset.value);
      renderAll();
    });
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
    ui.btnAddElement?.addEventListener("click", openElementModal);
    ui.btnDuplicate?.addEventListener("click", duplicateSelected);
    ui.btnMoveUp?.addEventListener("click", () => moveSelected(-1));
    ui.btnMoveDown?.addEventListener("click", () => moveSelected(+1));
    ui.btnRemove?.addEventListener("click", removeSelected);

    ui.btnScaleToFocal?.addEventListener("click", scaleToFocal);
    ui.btnSetTStop?.addEventListener("click", setTStop);

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

    // optimizer
    ui.btnOptStart?.addEventListener("click", runOptimizer);
    ui.btnOptStop?.addEventListener("click", stopOptimizer);
    ui.btnOptApply?.addEventListener("click", applyBest);
    ui.btnOptBench?.addEventListener("click", benchOptimizer);

    ["optTargetFL","optTargetT","optIters","optPop"].forEach((id)=>{
      ui[id]?.addEventListener("change", scheduleRenderAll);
      ui[id]?.addEventListener("input", () => {
        // don't rerender constantly for iters/preset; but update merit targets
        if (id === "optTargetFL" || id === "optTargetT") scheduleRenderAll();
      });
    });
  }

  // -------------------- boot --------------------
  function boot() {
    wireUI();

    // Force top on boot
    try {
      window.scrollTo(0, 0);
      document.querySelector(".leftScroll")?.scrollTo(0, 0);
      setTimeout(() => document.querySelector(".leftScroll")?.scrollTo(0, 0), 0);
    } catch(_) {}

    buildTable();
    applySensorToIMS();
    bindViewControls();
    renderAll();

    window.addEventListener("resize", () => renderAll());
    document.addEventListener("fullscreenchange", () => renderAll());
  }

  boot();
})();

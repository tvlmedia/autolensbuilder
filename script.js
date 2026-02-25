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
    softIC: $("#badgeSoftIC"),
    dist: $("#badgeDist"),
    fov: $("#badgeFov"),
    merit: $("#badgeMerit"),

    footerWarn: $("#footerWarn"),
    metaInfo: $("#metaInfo"),

    eflTop: $("#badgeEflTop"),
    bflTop: $("#badgeBflTop"),
    tstopTop: $("#badgeTTop"),
    softICTop: $("#badgeSoftICTop"),
    fovTop: $("#badgeFovTop"),
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
    optTargetIC: $("#optTargetIC"),
    optIters: $("#optIters"),
    optPop: $("#optPop"),
    optLog: $("#optLog"),

    btnOptStart: $("#btnOptStart"),
    btnOptStop: $("#btnOptStop"),
    btnOptApply: $("#btnOptApply"),
    btnOptBench: $("#btnOptBench"),
    btnBuildScratch: $("#btnBuildScratch"),

    newLensModal: $("#newLensModal"),
    elementModal: $("#elementModal"),
  };

  const AUTOSAVE_KEY = "tvl_lens_builder_autosave_v1";

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
    const w = num(ui.sensorW?.value, 36.7);
    const h = num(ui.sensorH?.value, 25.54);
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
    scheduleAutosave();
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
    scheduleAutosave();
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
    scheduleAutosave();
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
  const AP_MAX_PLANE = 45.0;
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
    maxAperture: 40.0,
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
  const MOUNT_TRACE_CFG = {
    enabled: true,
    throatR: 27.0,      // PL throat radius (Ø54)
    lensLip: 3.0,       // lens-side extension before flange plane
    camDepth: 14.0,     // camera-side depth after flange plane
    clearanceMm: 0.08,  // tiny safety clearance to avoid optimistic edge cases
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
  function mountClipHitAlongRay(ray, tMax = Infinity) {
    if (!MOUNT_TRACE_CFG.enabled) return null;
    const dx = ray?.d?.x;
    const dy = ray?.d?.y;
    const dz = Number(ray?.d?.z || 0);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz) || Math.abs(dx) < 1e-12) return null;

    const xFlange = -PL_FFD;
    const xA = xFlange - MOUNT_TRACE_CFG.lensLip;
    const xB = xFlange + MOUNT_TRACE_CFG.camDepth;

    const tA = (xA - ray.p.x) / dx;
    const tB = (xB - ray.p.x) / dx;

    let t0 = Math.max(1e-9, Math.min(tA, tB));
    let t1 = Math.max(tA, tB);
    if (Number.isFinite(tMax)) t1 = Math.min(t1, tMax - 1e-9);
    if (!(t1 >= t0)) return null;

    const py = Number(ray?.p?.y || 0);
    const pz = Number(ray?.p?.z || 0);
    const yAt = (t) => py + dy * t;
    const zAt = (t) => pz + dz * t;
    const r2At = (t) => {
      const yy = yAt(t);
      const zz = zAt(t);
      return yy * yy + zz * zz;
    };
    const lim = Math.max(0.1, MOUNT_TRACE_CFG.throatR - Math.max(0, MOUNT_TRACE_CFG.clearanceMm || 0));
    const lim2 = lim * lim;
    const r20 = r2At(t0);
    const r21 = r2At(t1);

    if (r20 <= lim2 + 1e-9 && r21 <= lim2 + 1e-9) return null;

    let tClip = t0;
    const A = dy * dy + dz * dz;
    if (A > 1e-14) {
      const B = 2 * (py * dy + pz * dz);
      const C = py * py + pz * pz - lim2;
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        const sd = Math.sqrt(disc);
        const rt1 = (-B - sd) / (2 * A);
        const rt2 = (-B + sd) / (2 * A);
        const roots = [rt1, rt2].filter((t) => t >= t0 - 1e-9 && t <= t1 + 1e-9);
        if (roots.length) tClip = Math.max(t0, Math.min(...roots));
      }
    }

    return {
      t: tClip,
      hit: { x: ray.p.x + dx * tClip, y: yAt(tClip), z: zAt(tClip) },
    };
  }

  function traceRayForward(ray, surfaces, wavePreset, opts = {}) {
    const skipIMS = !!opts.skipIMS;

    let pts = [];
    let vignetted = false;
    let tir = false;
    let clippedByMount = false;

    pts.push({ x: ray.p.x, y: ray.p.y });

    let nBefore = 1.0;

    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const type = String(s?.type || "").toUpperCase();
      const isIMS = type === "IMS";
      const isMECH = type === "MECH" || type === "BAFFLE" || type === "HOUSING";

      if (skipIMS && isIMS) continue;

      const hitInfo = intersectSurface(ray, s);
      const mountHit = (!skipIMS && nBefore <= 1.000001)
        ? mountClipHitAlongRay(ray, hitInfo?.t ?? Infinity)
        : null;
      if (mountHit) { pts.push(mountHit.hit); vignetted = true; clippedByMount = true; break; }

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

    return { pts, vignetted, tir, clippedByMount, endRay: ray };
  }

  // -------------------- ray bundles --------------------
  const RAY_BUNDLE_CFG = {
    apFill: 0.999, // sample almost full clear aperture (avoid optimistic vignette estimates)
  };
  const RAY_CROSS_CFG = {
    minGlassN: 1.0005,
    minOverlapX: 1e-4,
    edgePadFrac: 0.08,
    edgePadMaxMm: 0.03,
    yTol: 5e-4,
  };

  function getRayReferencePlane(surfaces) {
    const apFill = Math.max(0.5, Math.min(1.0, Number(RAY_BUNDLE_CFG.apFill || 1.0)));
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx >= 0) {
      const s = surfaces[stopIdx];
      return { xRef: s.vx, apRef: Math.max(1e-3, Number(s.ap || 10) * apFill), refIdx: stopIdx };
    }
    let refIdx = 1;
    if (!surfaces[refIdx] || String(surfaces[refIdx].type).toUpperCase() === "IMS") refIdx = 0;
    const s = surfaces[refIdx] || surfaces[0];
    return { xRef: s.vx, apRef: Math.max(1e-3, Number(s.ap || 10) * apFill), refIdx };
  }

  function buildRays(surfaces, fieldAngleDeg, count) {
    const n = Math.max(3, Math.min(101, count | 0));
    const theta = (fieldAngleDeg * Math.PI) / 180;
    const dir = normalize({ x: Math.cos(theta), y: Math.sin(theta) });

    const xStart = (surfaces[0]?.vx ?? 0) - 80;
    const { xRef, apRef } = getRayReferencePlane(surfaces);

    const hMax = apRef;
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

  function segmentYAtX(p0, p1, x) {
    const x0 = Number(p0?.x), y0 = Number(p0?.y);
    const x1 = Number(p1?.x), y1 = Number(p1?.y);
    if (![x0, y0, x1, y1, x].every(Number.isFinite)) return null;
    const dx = x1 - x0;
    if (Math.abs(dx) < 1e-12) return null;
    const t = (x - x0) / dx;
    return y0 + (y1 - y0) * t;
  }

  function segmentPairCrossesInside(a0, a1, b0, b1) {
    const ax0 = Number(a0?.x), ax1 = Number(a1?.x);
    const bx0 = Number(b0?.x), bx1 = Number(b1?.x);
    if (![ax0, ax1, bx0, bx1].every(Number.isFinite)) return false;

    const xL = Math.max(Math.min(ax0, ax1), Math.min(bx0, bx1));
    const xR = Math.min(Math.max(ax0, ax1), Math.max(bx0, bx1));
    const span = xR - xL;
    if (!(span > Number(RAY_CROSS_CFG.minOverlapX || 1e-4))) return false;

    const pad = Math.min(
      Number(RAY_CROSS_CFG.edgePadMaxMm || 0.03),
      span * Math.max(0.01, Number(RAY_CROSS_CFG.edgePadFrac || 0.08))
    );
    const xA = xL + pad;
    const xB = xR - pad;
    if (!(xB > xA)) return false;

    const yA0 = segmentYAtX(a0, a1, xA);
    const yA1 = segmentYAtX(a0, a1, xB);
    const yB0 = segmentYAtX(b0, b1, xA);
    const yB1 = segmentYAtX(b0, b1, xB);
    if (![yA0, yA1, yB0, yB1].every(Number.isFinite)) return false;

    const d0 = yA0 - yB0;
    const d1 = yA1 - yB1;
    const tol = Math.max(1e-6, Number(RAY_CROSS_CFG.yTol || 5e-4));

    if (Math.abs(d0) <= tol || Math.abs(d1) <= tol) {
      const xm = 0.5 * (xA + xB);
      const yAm = segmentYAtX(a0, a1, xm);
      const yBm = segmentYAtX(b0, b1, xm);
      if (Number.isFinite(yAm) && Number.isFinite(yBm) && Math.abs(yAm - yBm) <= tol) return true;
    }
    return (d0 * d1) < -(tol * tol);
  }

  function detectInternalRayCrossings(traces, surfaces, wavePreset) {
    const out = {
      validRayCount: 0,
      checkedSegments: 0,
      checkedPairs: 0,
      crossPairs: 0,
      crossSegments: 0,
      invalid: false,
    };
    if (!Array.isArray(traces) || !Array.isArray(surfaces) || surfaces.length < 3) return out;

    const glassSegmentIdx = [];
    for (let i = 0; i < surfaces.length - 1; i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS" || t === "MECH" || t === "BAFFLE" || t === "HOUSING") continue;
      const nAfter = glassN(String(s?.glass || "AIR"), wavePreset);
      if (!(Number.isFinite(nAfter) && nAfter > Number(RAY_CROSS_CFG.minGlassN || 1.0005))) continue;
      glassSegmentIdx.push(i);
    }
    if (!glassSegmentIdx.length) return out;

    const valid = traces.filter((tr) =>
      tr && !tr.vignetted && !tr.tir && Array.isArray(tr.pts) && tr.pts.length >= 4
    );
    out.validRayCount = valid.length;
    if (valid.length < 2) return out;

    const crossedSeg = new Set();
    for (const segIdx of glassSegmentIdx) {
      let segPairs = 0;
      let segHasCross = false;
      for (let r = 0; r < valid.length - 1; r++) {
        const ta = valid[r];
        const tb = valid[r + 1];
        const a0 = ta.pts[segIdx + 1];
        const a1 = ta.pts[segIdx + 2];
        const b0 = tb.pts[segIdx + 1];
        const b1 = tb.pts[segIdx + 2];
        if (!a0 || !a1 || !b0 || !b1) continue;
        segPairs++;
        if (segmentPairCrossesInside(a0, a1, b0, b1)) {
          out.crossPairs++;
          segHasCross = true;
        }
      }
      if (segPairs > 0) out.checkedSegments++;
      out.checkedPairs += segPairs;
      if (segHasCross) crossedSeg.add(segIdx);
    }
    out.crossSegments = crossedSeg.size;
    out.invalid = out.crossPairs > 0;
    return out;
  }

  function rayHitYAtX(endRay, x) {
    if (!endRay?.d || Math.abs(endRay.d.x) < 1e-9) return null;
    const t = (x - endRay.p.x) / endRay.d.x;
    if (!Number.isFinite(t)) return null;
    return endRay.p.y + t * endRay.d.y;
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

  function measureCenterThroughput(surfaces, wavePreset, sensorX, rayCount = 41) {
    const rays = buildRays(surfaces, 0, rayCount);
    let good = 0;
    const total = rays.length;

    for (const r of rays) {
      const tr = traceRayForward(clone(r), surfaces, wavePreset);
      if (!tr || tr.vignetted || tr.tir || !tr.endRay) continue;
      const y = rayHitYAtX(tr.endRay, sensorX);
      if (Number.isFinite(y)) good++;
    }

    const goodFrac = clamp(good / Math.max(1, total), 1e-6, 1.0);
    return { good, total, goodFrac };
  }

  function estimateEffectiveT(tGeom, goodFrac0) {
    if (!Number.isFinite(tGeom) || tGeom <= 0) return null;
    const g = clamp(Number(goodFrac0 || 0), 1e-6, 1.0);
    const tEff = tGeom / Math.sqrt(g);
    return Number.isFinite(tEff) ? tEff : null;
  }

  function tLossStops(tEff, tGeom) {
    if (!Number.isFinite(tEff) || !Number.isFinite(tGeom) || tEff <= 0 || tGeom <= 0) return null;
    const ds = Math.log2(tEff / tGeom);
    return Number.isFinite(ds) ? ds : null;
  }

  // -------------------- FOV --------------------
  function deg2rad(d) { return (d * Math.PI) / 180; }
  function rad2deg(r) { return (r * 180) / Math.PI; }
  function computeFovDeg(efl, sensorW, sensorH) {
    if (!Number.isFinite(efl) || efl <= 0) return null;
    const diag = Math.hypot(sensorW, sensorH);
    const hfov = 2 * Math.atan(sensorW / (2 * efl));
    const vfov = 2 * Math.atan(sensorH / (2 * efl));
    const dfov = 2 * Math.atan(diag / (2 * efl));
    return { hfov: rad2deg(hfov), vfov: rad2deg(vfov), dfov: rad2deg(dfov) };
  }

  const SENSOR_CLIP_TOL_MM = 0.02;

  function requiredHalfFieldDeg(efl, sensorW, sensorH, mode = "d") {
    const fov = computeFovDeg(efl, sensorW, sensorH);
    if (!fov) return null;
    if (mode === "h") return fov.hfov * 0.5;
    if (mode === "v") return fov.vfov * 0.5;
    return fov.dfov * 0.5;
  }

  function coverageHalfSizeMm(sensorW, sensorH, mode = "d") {
    if (mode === "h") return Math.max(0.1, sensorW * 0.5);
    if (mode === "v") return Math.max(0.1, sensorH * 0.5);
    const d = Math.hypot(sensorW, sensorH);
    return Math.max(0.1, d * 0.5);
  }

  const SOFT_IC_CFG = {
    thresholdRel: 0.36, // usable circle @ 36% of center illumination
    bgOverscan: 1.6,     // match Render Engine OV mapping
    bgLutSamples: 900,   // match Render Engine LUT density
    bgPupilSqrt: 16,     // denser pupil sampling for tighter edge estimate
    bgObjDistMm: 2000,   // object plane distance for reverse ray hit test
    bgStartEpsMm: 0.05,  // avoid exact sensor plane degeneracy
    minSamplesForCurve: 8,
    smoothingHalfWindow: 3,
    eps: 1e-6,
  };

  // Faster IC estimator for optimizer loop (keeps search responsive).
  const OPT_IC_CFG = {
    bgLutSamples: 96,
    bgPupilSqrt: 5,
    smoothingHalfWindow: 2,
  };

  // Very cheap IC settings for fast-tier candidate ranking.
  const FAST_OPT_IC_CFG = {
    bgLutSamples: 40,
    bgPupilSqrt: 3,
    smoothingHalfWindow: 1,
    minSamplesForCurve: 4,
    thetaStepDeg: 2.0,
    maxFieldDeg: 42,
    bgObjDistMm: 1400,
  };

  const OPT_STAGE_CFG = {
    flBandRel: 0.05,      // once FL is in +/-5%, keep all accepted updates in this band
    flStageRel: 0.01,     // do not leave FL phase until within +/-1%
    flPreferRel: 0.002,   // in later phases, do not accept >0.2% FL degradation
    flHoldRel: 0.05,      // hard FL hold after lock (within +/-5%)
    polishFlDriftRel: 0.0008, // in fine tune, keep FL nearly locked while reducing residual distortion
    icStageDriftRel: 0.006, // allow a bit more FL drift during IC growth
    bflHardShortMm: 0.80, // hard fail when BFL is too short for mount
    tCoarseAbs: 0.75,     // before IC growth, first reduce too-slow T overshoot
    icPassFrac: 1.00,     // IC is only good when measured IC >= requested IC
    tGoodAbs: 0.25,       // T phase considered good when too-slow T overshoot <= 0.25
  };

  const OPT_EVAL_CFG = {
    fastRayCount: 15,
    fastAutofocusEvery: 120,
    fastIcEvery: 10,
    accurateAuditEvery: 90,
    fastAfRange: 3.0,
    fastAfCoarseStep: 0.60,
    fastAfFineHalf: 0.90,
    fastAfFineStep: 0.20,
    accurateAfRange: 6.0,
    accurateAfCoarseStep: 0.30,
    accurateAfFineHalf: 1.60,
    accurateAfFineStep: 0.08,
  };

  const SCRATCH_CFG = {
    autoFamilyWideMaxMm: 35,
    autoFamilyNormalMaxMm: 85,
    effortMin: 0.60,
    effortMax: 4.00,
    effortDefault: 1.00,
    maxGrowCycles: {
      safe: 2,
      normal: 4,
      wild: 6,
    },
    stageIters: {
      safe:   { A: 800,  B: 900,  C: 1400, D: 1700 },
      normal: { A: 1100, B: 1300, C: 2300, D: 2800 },
      wild:   { A: 1500, B: 1900, C: 3400, D: 4200 },
    },
    plateauImproveFrac: 0.010,
    acceptableFlRel: 0.020,
    acceptableTAbs: 0.35,
    acceptableIcNeedMm: 0.60,
    acceptableIcNeedFrac: 0.03,
    strictDistRmsPct: 1.00,
    strictDistMaxPct: 2.00,
    acceptableDistRmsPct: 2.20,
    acceptableDistMaxPct: 4.20,
    minElements: 3,
    maxElementsHardCap: 14,
  };

  function softIcLabel(cfg = SOFT_IC_CFG) {
    const pct = Math.round(Number(cfg?.thresholdRel ?? 0) * 100);
    return `IC${pct}%`;
  }

  let _softIcCacheKey = "";
  let _softIcCacheVal = null;
  let _distCacheKey = "";
  let _distCacheVal = null;

  function chiefRadiusAtFieldDeg(workSurfaces, fieldDeg, wavePreset, sensorX) {
    const chief = buildChiefRay(workSurfaces, fieldDeg);
    const tr = traceRayForward(clone(chief), workSurfaces, wavePreset);
    if (!tr || !tr.endRay || tr.tir) return null;
    const y = rayHitYAtX(tr.endRay, sensorX);
    return Number.isFinite(y) ? Math.abs(y) : null;
  }

  // -------------------- IC-only background helpers (ported from Render Engine) --------------------
  function normalize3(v) {
    const m = Math.hypot(v.x, v.y, v.z);
    if (m < 1e-12) return { x: 0, y: 0, z: 0 };
    return { x: v.x / m, y: v.y / m, z: v.z / m };
  }
  function dot3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function add3(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
  function mul3(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }

  function refract3(I, N, n1, n2) {
    I = normalize3(I);
    N = normalize3(N);
    if (dot3(I, N) > 0) N = mul3(N, -1);
    const cosi = -dot3(N, I);
    const eta = n1 / n2;
    const k = 1 - eta * eta * (1 - cosi * cosi);
    if (k < 0) return null;
    const T = add3(mul3(I, eta), mul3(N, eta * cosi - Math.sqrt(k)));
    return normalize3(T);
  }

  function intersectSurface3D(ray, surf) {
    const vx = surf.vx;
    const R = Number(surf.R || 0);
    const ap = Math.max(0, Number(surf.ap || 0));

    if (Math.abs(R) < 1e-9) {
      if (Math.abs(ray.d.x) < 1e-12) return null;
      const t = (vx - ray.p.x) / ray.d.x;
      if (!Number.isFinite(t) || t <= 1e-9) return null;
      const hit = add3(ray.p, mul3(ray.d, t));
      const r = Math.hypot(hit.y, hit.z);
      const vignetted = r > ap + 1e-9;
      return { hit, t, vignetted, normal: { x: -1, y: 0, z: 0 } };
    }

    const cx = vx + R;
    const rad = Math.abs(R);
    const px = ray.p.x - cx;
    const py = ray.p.y;
    const pz = ray.p.z;
    const dx = ray.d.x;
    const dy = ray.d.y;
    const dz = ray.d.z;

    const A = dx * dx + dy * dy + dz * dz;
    const B = 2 * (px * dx + py * dy + pz * dz);
    const C = px * px + py * py + pz * pz - rad * rad;
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

    const hit = add3(ray.p, mul3(ray.d, t));
    const r = Math.hypot(hit.y, hit.z);
    const vignetted = r > ap + 1e-9;
    const normal = normalize3({ x: hit.x - cx, y: hit.y, z: hit.z });
    return { hit, t, vignetted, normal };
  }

  function traceRayReverse3D(ray, surfaces, wavePreset) {
    let vignetted = false;
    let tir = false;

    for (let i = surfaces.length - 1; i >= 0; i--) {
      const s = surfaces[i];
      const type = String(s?.type || "").toUpperCase();
      const isIMS = type === "IMS";
      const isMECH = type === "MECH" || type === "BAFFLE" || type === "HOUSING";

      const hitInfo = intersectSurface3D(ray, s);
      if (!hitInfo) { vignetted = true; break; }
      if (!isIMS && hitInfo.vignetted) { vignetted = true; break; }

      if (isIMS || isMECH) {
        ray = { p: hitInfo.hit, d: ray.d };
        continue;
      }

      const nRight = glassN(String(s.glass || "AIR"), wavePreset);
      const nLeft = (i === 0) ? 1.0 : glassN(String(surfaces[i - 1].glass || "AIR"), wavePreset);

      if (Math.abs(nLeft - nRight) < 1e-9) {
        ray = { p: hitInfo.hit, d: ray.d };
        continue;
      }

      const newDir = refract3(ray.d, hitInfo.normal, nRight, nLeft);
      if (!newDir) { tir = true; break; }
      ray = { p: hitInfo.hit, d: newDir };
    }

    return { vignetted, tir, endRay: ray };
  }

  function intersectPlaneX3D(ray, xPlane) {
    if (!ray?.d || Math.abs(ray.d.x) < 1e-12) return null;
    const t = (xPlane - ray.p.x) / ray.d.x;
    if (!Number.isFinite(t) || t <= 1e-9) return null;
    return add3(ray.p, mul3(ray.d, t));
  }

  function samplePupilDisk(stopAp, u, v) {
    const a = u * 2 - 1;
    const b = v * 2 - 1;
    let r, phi;
    if (a === 0 && b === 0) { r = 0; phi = 0; }
    else if (Math.abs(a) > Math.abs(b)) { r = a; phi = (Math.PI / 4) * (b / a); }
    else { r = b; phi = (Math.PI / 2) - (Math.PI / 4) * (a / b); }

    const rr = Math.abs(r) * Math.max(1e-6, Number(stopAp || 0));
    return { y: rr * Math.cos(phi), z: rr * Math.sin(phi) };
  }

  function naturalCos4AtSensorRadius(surfaces, sensorX, rMm) {
    const stopIdx = findStopSurfaceIndex(surfaces);
    const stopSurf = stopIdx >= 0 ? surfaces[stopIdx] : surfaces[0];
    const xStop = Number(stopSurf?.vx);
    const sx = Number(sensorX) + Number(SOFT_IC_CFG.bgStartEpsMm || 0.05);
    if (!Number.isFinite(xStop) || !Number.isFinite(sx)) return 1.0;
    const rr = Math.max(0, Number(rMm || 0));
    const dir = normalize3({ x: xStop - sx, y: -rr, z: 0 });
    const c = clamp(Math.abs(dir.x), 0, 1);
    return c * c * c * c;
  }

  function estimateUsableCircleBackgroundLut(
    surfaces,
    sensorW,
    sensorH,
    wavePreset,
    rayCount,
    cfgOverride = null,
    focusOpts = null
  ) {
    const cfg = { ...SOFT_IC_CFG, ...(cfgOverride || {}) };
    const sensorX = 0.0;
    const halfDiag = 0.5 * Math.hypot(sensorW, sensorH);
    const ov = Math.max(1.0, Number(cfg.bgOverscan || 1.6));
    const work = clone(surfaces);
    const useFocusedGeometry = !!focusOpts?.useCurrentGeometry;
    let lensShift = Number(focusOpts?.lensShift || 0);

    if (!useFocusedGeometry) {
      const af = bestLensShiftForDesign(work, 0, Math.max(21, rayCount | 0), wavePreset);
      if (!af.ok) {
        return {
          softICmm: 0, rEdge: 0,
          relMin: Number(cfg.thresholdRel || 0.35),
          thresholdRel: Number(cfg.thresholdRel || 0.35),
          usableCircleDiameterMm: 0,
          usableCircleRadiusMm: 0,
          relAtCutoff: 0,
          centerGoodFrac: 0,
          samples: [],
          focusLensShift: 0,
          focusFailed: true,
          drasticDropRadiusMm: null,
        };
      }

      lensShift = af.shift;
      computeVertices(work, lensShift, sensorX);
    }

    const stopIdx = findStopSurfaceIndex(work);
    const stopSurf = stopIdx >= 0 ? work[stopIdx] : work[0];
    const stopAp = Math.max(1e-6, Number(stopSurf?.ap || 0));
    const xStop = Number(stopSurf?.vx);
    if (!(stopAp > 0) || !Number.isFinite(xStop)) {
      return {
        softICmm: 0, rEdge: 0,
        relMin: Number(cfg.thresholdRel || 0.35),
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        usableCircleDiameterMm: 0,
        usableCircleRadiusMm: 0,
        relAtCutoff: 0,
        centerGoodFrac: 0,
        samples: [],
        focusLensShift: lensShift,
        focusFailed: false,
        drasticDropRadiusMm: null,
      };
    }

    const lutMin = Math.max(8, Number(cfg.bgLutMin || 24) | 0);
    const pupilMin = Math.max(2, Number(cfg.bgPupilMin || 2) | 0);
    const lutN = Math.max(lutMin, Math.min(1200, Number(cfg.bgLutSamples || 900) | 0));
    const pupilSqrt = Math.max(pupilMin, Math.min(28, Number(cfg.bgPupilSqrt || 14) | 0));
    const startX = sensorX + Number(cfg.bgStartEpsMm || 0.05);
    const xObjPlane = (work[0]?.vx ?? 0) - Math.max(100, Number(cfg.bgObjDistMm || 2000));
    const sensorWv = Number(sensorW) * ov;
    const sensorHv = Number(sensorH) * ov;
    const rMaxSensor = Math.hypot(sensorWv * 0.5, sensorHv * 0.5);

    const radialMm = new Float64Array(lutN);
    const gainCurve = new Float64Array(lutN);

    for (let k = 0; k < lutN; k++) {
      const a = lutN > 1 ? (k / (lutN - 1)) : 0;
      const rS = a * rMaxSensor;
      radialMm[k] = rS / ov;

      const pS = { x: startX, y: rS, z: 0 };
      const natural = naturalCos4AtSensorRadius(work, sensorX, rS);

      let ok = 0;
      let total = 0;
      for (let iy = 0; iy < pupilSqrt; iy++) {
        for (let ix = 0; ix < pupilSqrt; ix++) {
          const uu = (ix + 0.5) / pupilSqrt;
          const vv = (iy + 0.5) / pupilSqrt;
          const pp = samplePupilDisk(stopAp, uu, vv);
          const target = { x: xStop, y: pp.y, z: pp.z };
          const dir = normalize3({ x: target.x - pS.x, y: target.y - pS.y, z: target.z - pS.z });

          const tr = traceRayReverse3D({ p: pS, d: dir }, work, wavePreset);
          total++;
          if (tr.vignetted || tr.tir || !tr.endRay) continue;
          const hitObj = intersectPlaneX3D(tr.endRay, xObjPlane);
          if (!hitObj) continue;
          ok++;
        }
      }

      const trans = total ? (ok / total) : 0;
      gainCurve[k] = clamp(trans * natural, 0, 1);
    }

    const uc = computeUsableCircleFromRadialCurve(radialMm, gainCurve, cfg);
    const relCurve = uc.relCurve?.length === lutN ? uc.relCurve : Array.from({ length: lutN }, () => 0);

    const samples = Array.from({ length: lutN }, (_, i) => {
      const relIllum = clamp(Number(relCurve[i] || 0), 0, 1);
      return {
        rMm: Number(radialMm[i] || 0),
        thetaDeg: null,
        gain: Number(gainCurve[i] || 0),
        relIllum,
        stopsDown: relIllum > cfg.eps ? -Math.log2(relIllum) : Infinity,
      };
    });

    const rEdge = uc.valid ? clamp(Number(uc.radiusMm || 0), 0, halfDiag) : 0;
    const softICmm = uc.valid ? clamp(Number(uc.diameterMm || 0), 0, 2 * halfDiag) : 0;
    const centerGoodFrac = gainCurve.length ? clamp(Number(gainCurve[0] || 0), 0, 1) : 0;

    return {
      softICmm,
      rEdge,
      relMin: Number(uc.thresholdRel || cfg.thresholdRel || 0.35),
      thresholdRel: Number(uc.thresholdRel || cfg.thresholdRel || 0.35),
      usableCircleDiameterMm: softICmm,
      usableCircleRadiusMm: rEdge,
      relAtCutoff: Number(uc.relAtCutoff || 0),
      centerGoodFrac,
      samples,
      focusLensShift: lensShift,
      focusFailed: false,
      drasticDropRadiusMm: null,
    };
  }

  function traceBundleAtFieldForSoftIc(surfaces, fieldDeg, wavePreset, sensorX, raysPerBundle) {
    const rays = buildRays(surfaces, fieldDeg, raysPerBundle);
    const total = rays.length;
    const rChief = chiefRadiusAtFieldDeg(surfaces, fieldDeg, wavePreset, sensorX);
    const bandMm = Math.max(0.05, Number(SOFT_IC_CFG.localBandMm || 1.0));
    if (total < 3) {
      return {
        total,
        good: 0,
        goodFrac: 0,
        localGood: 0,
        localFrac: 0,
        mountClipped: 0,
        mountFrac: 1,
        rMm: null,
        rChief: Number.isFinite(rChief) ? rChief : null,
        yHits: [],
        valid: false,
      };
    }

    let good = 0;
    let localGood = 0;
    let mountClipped = 0;
    const yHits = [];

    for (const ray of rays) {
      const tr = traceRayForward(clone(ray), surfaces, wavePreset);
      if (!tr || tr.tir || !tr.endRay) continue;
      if (tr.clippedByMount) mountClipped++;
      if (tr.vignetted) continue;
      const y = rayHitYAtX(tr.endRay, sensorX);
      if (!Number.isFinite(y)) continue;
      good++;
      const absY = Math.abs(y);
      yHits.push(absY);
      if (Number.isFinite(rChief) && Math.abs(absY - rChief) <= bandMm) localGood++;
    }

    const rMm = Number.isFinite(rChief) ? rChief : null;
    return {
      total,
      good,
      goodFrac: good / Math.max(1, total),
      localGood,
      localFrac: localGood / Math.max(1, total),
      mountClipped,
      mountFrac: mountClipped / Math.max(1, total),
      rMm: Number.isFinite(rMm) ? rMm : null,
      rChief: Number.isFinite(rChief) ? rChief : null,
      yHits,
      valid: true,
    };
  }

  function estimateUsableCircleFastProxy(
    surfaces,
    sensorW,
    sensorH,
    wavePreset,
    rayCount,
    cfgOverride = null
  ) {
    const cfg = { ...SOFT_IC_CFG, ...(cfgOverride || {}) };
    const sensorX = 0;
    const halfDiag = 0.5 * Math.hypot(sensorW, sensorH);
    const raysPerBundle = Math.max(7, Math.min(21, Number(rayCount || 15) | 0));
    const stepDeg = Math.max(0.5, Number(cfg.thetaStepDeg || 2.0));
    const maxFieldDeg = Math.max(stepDeg, Number(cfg.maxFieldDeg || 42));
    const eps = Math.max(1e-6, Number(cfg.eps || 1e-6));

    const centerPack = traceBundleAtFieldForSoftIc(surfaces, 0, wavePreset, sensorX, raysPerBundle);
    const centerGood = Math.max(eps, Number(centerPack.goodFrac || 0));
    if (!(centerGood > eps)) {
      return {
        softICmm: 0,
        usableCircleDiameterMm: 0,
        usableCircleRadiusMm: 0,
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        centerGoodFrac: 0,
        samples: [],
      };
    }

    const radial = [];
    const gain = [];
    let beyondRun = 0;

    for (let th = 0; th <= maxFieldDeg + 1e-9; th += stepDeg) {
      const pack = th <= 1e-9
        ? centerPack
        : traceBundleAtFieldForSoftIc(surfaces, th, wavePreset, sensorX, raysPerBundle);
      if (!pack?.valid) continue;
      const rMm = Number(pack.rChief);
      if (!Number.isFinite(rMm)) continue;
      const natural = naturalCos4AtSensorRadius(surfaces, sensorX, rMm);
      radial.push(Math.max(0, rMm));
      gain.push(clamp(Number(pack.goodFrac || 0) * natural, 0, 1));
      if (rMm > halfDiag + 1.2) beyondRun++;
      else beyondRun = 0;
      if (beyondRun >= 2 && gain[gain.length - 1] < centerGood * 0.4) break;
    }

    if (radial.length < 4) {
      return {
        softICmm: 0,
        usableCircleDiameterMm: 0,
        usableCircleRadiusMm: 0,
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        centerGoodFrac: centerGood,
        samples: [],
      };
    }

    const uc = computeUsableCircleFromRadialCurve(radial, gain, {
      ...cfg,
      minSamplesForCurve: 4,
      smoothingHalfWindow: Math.min(1, Number(cfg.smoothingHalfWindow || 1) | 0),
    });

    const rEdge = uc.valid ? clamp(Number(uc.radiusMm || 0), 0, halfDiag) : 0;
    const softICmm = uc.valid ? clamp(Number(uc.diameterMm || 0), 0, 2 * halfDiag) : 0;
    return {
      softICmm,
      usableCircleDiameterMm: softICmm,
      usableCircleRadiusMm: rEdge,
      thresholdRel: Number(uc.thresholdRel || cfg.thresholdRel || 0.35),
      centerGoodFrac: centerGood,
      samples: radial.map((rMm, i) => ({
        rMm,
        gain: gain[i],
      })),
    };
  }

  function computeUsableCircleFromRadialCurve(radialMm, gainCurve, cfg = SOFT_IC_CFG) {
    const minN = Math.max(3, Number(cfg.minSamplesForCurve || 8) | 0);
    const n = Math.min(radialMm?.length || 0, gainCurve?.length || 0);
    if (n < minN) {
      return {
        valid: false,
        radiusMm: 0,
        diameterMm: 0,
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        relAtCutoff: 0,
        radialMm: [],
        relCurve: [],
        smoothedCurve: [],
      };
    }

    const pairs = [];
    for (let i = 0; i < n; i++) {
      const ri = Number(radialMm[i]);
      const gi = Number(gainCurve[i]);
      if (!Number.isFinite(ri) || !Number.isFinite(gi) || ri < 0) continue;
      pairs.push({ r: ri, g: Math.max(0, gi) });
    }
    if (pairs.length < minN) {
      return {
        valid: false,
        radiusMm: 0,
        diameterMm: 0,
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        relAtCutoff: 0,
        radialMm: [],
        relCurve: [],
        smoothedCurve: [],
      };
    }

    pairs.sort((a, b) => a.r - b.r);
    const r = [];
    const g = [];
    for (const p of pairs) {
      if (r.length && p.r <= r[r.length - 1] + 1e-6) {
        // Conservative merge for near-duplicate radius samples.
        g[g.length - 1] = Math.min(g[g.length - 1], p.g);
        continue;
      }
      r.push(p.r);
      g.push(p.g);
    }
    if (r.length < minN) {
      return {
        valid: false,
        radiusMm: 0,
        diameterMm: 0,
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        relAtCutoff: 0,
        radialMm: [],
        relCurve: [],
        smoothedCurve: [],
      };
    }

    const m = r.length;
    const halfWin = Math.max(0, Number(cfg.smoothingHalfWindow || 3) | 0);
    const smoothed = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      let sum = 0;
      let cnt = 0;
      for (let k = -halfWin; k <= halfWin; k++) {
        const j = i + k;
        if (j < 0 || j >= m) continue;
        sum += g[j];
        cnt++;
      }
      smoothed[i] = cnt ? (sum / cnt) : g[i];
    }

    const refN = Math.max(6, Math.min(m, Math.floor(m * 0.06)));
    let ref = 0;
    for (let i = 0; i < refN; i++) ref += smoothed[i];
    ref /= Math.max(1, refN);
    if (!(ref > Number(cfg.eps || 1e-6))) {
      return {
        valid: false,
        radiusMm: 0,
        diameterMm: 0,
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        relAtCutoff: 0,
        radialMm: r,
        relCurve: Array.from({ length: m }, () => 0),
        smoothedCurve: Array.from(smoothed),
      };
    }

    const rel = new Float64Array(m);
    rel[0] = smoothed[0] / ref;
    for (let i = 1; i < m; i++) {
      const v = smoothed[i] / ref;
      // Match render-engine behavior: force monotone non-increasing falloff.
      rel[i] = Math.min(v, rel[i - 1]);
    }

    const thr = clamp(Number(cfg.thresholdRel || 0.35), Number(cfg.eps || 1e-6), 1);
    let cutR = r[m - 1];
    let relAtCut = rel[m - 1];

    if (rel[0] <= thr) {
      cutR = 0;
      relAtCut = rel[0];
    } else {
      for (let i = 1; i < m; i++) {
        if (rel[i] > thr) continue;
        const g0 = rel[i - 1];
        const g1 = rel[i];
        const r0 = r[i - 1];
        const r1 = r[i];
        const denom = (g1 - g0);
        const t = Math.abs(denom) > 1e-9 ? clamp((thr - g0) / denom, 0, 1) : 0;
        cutR = r0 + (r1 - r0) * t;
        relAtCut = g0 + (g1 - g0) * t;
        break;
      }
    }

    const valid = cutR > 0.1;
    return {
      valid,
      radiusMm: valid ? cutR : 0,
      diameterMm: valid ? (cutR * 2) : 0,
      thresholdRel: thr,
      relAtCutoff: valid ? relAtCut : 0,
      radialMm: r,
      relCurve: Array.from(rel),
      smoothedCurve: Array.from(smoothed),
    };
  }

  function estimateSoftImageCircleStandalone(surfaces, sensorW, sensorH, wavePreset, rayCount) {
    const cfg = SOFT_IC_CFG;
    const sensorX = 0.0;
    const halfDiag = 0.5 * Math.hypot(sensorW, sensorH);
    const work = clone(surfaces);

    const af = bestLensShiftForDesign(work, 0, rayCount, wavePreset);
    if (!af.ok) {
      return {
        softICmm: 0,
        rEdge: 0,
        relMin: Number(cfg.thresholdRel || 0.35),
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        usableCircleDiameterMm: 0,
        usableCircleRadiusMm: 0,
        relAtCutoff: 0,
        centerGoodFrac: 0,
        samples: [],
        focusLensShift: 0,
        focusFailed: true,
        drasticDropRadiusMm: null,
      };
    }

    const lensShift = af.shift;
    computeVertices(work, lensShift, sensorX);

    const centerPack = traceBundleAtFieldForSoftIc(work, 0, wavePreset, sensorX, cfg.raysPerBundle);
    const centerLocalFrac = Math.max(cfg.eps, Number(centerPack.localFrac || 0));
    if (centerLocalFrac <= cfg.eps * 1.01) {
      return {
        softICmm: 0,
        rEdge: 0,
        relMin: Number(cfg.thresholdRel || 0.35),
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        usableCircleDiameterMm: 0,
        usableCircleRadiusMm: 0,
        relAtCutoff: 0,
        centerGoodFrac: centerLocalFrac,
        centerLocalFrac,
        samples: [],
        focusLensShift: lensShift,
        focusFailed: false,
        drasticDropRadiusMm: null,
      };
    }

    const fieldSamples = [];
    let mapFailRun = 0;
    let beyondDiagRun = 0;

    const stepDeg = Math.max(0.1, Number(cfg.thetaStepDeg || 0.5));
    const maxFieldDeg = Math.max(stepDeg, Number(cfg.maxFieldDeg || 60));
    const minSamplesForBreak = Math.max(3, Number(cfg.minSamplesForBreak || 10) | 0);
    const maxConsecutiveMapFails = Math.max(2, Number(cfg.maxConsecutiveMapFails || 8) | 0);

    for (let thetaDeg = 0; thetaDeg <= maxFieldDeg + 1e-9; thetaDeg += stepDeg) {
      const pack = thetaDeg <= 1e-9
        ? centerPack
        : traceBundleAtFieldForSoftIc(work, thetaDeg, wavePreset, sensorX, cfg.raysPerBundle);
      if (!pack.valid) continue;
      const rMm = Number.isFinite(pack.rMm) ? pack.rMm : null;
      if (!Number.isFinite(rMm)) {
        mapFailRun++;
        if (fieldSamples.length >= minSamplesForBreak && mapFailRun >= maxConsecutiveMapFails) break;
        continue;
      }
      mapFailRun = 0;

      const goodFrac = clamp(pack.goodFrac, 0, 1);
      const localFrac = clamp(Number(pack.localFrac || 0), 0, 1);
      fieldSamples.push({
        rMm,
        thetaDeg,
        goodFrac,
        localFrac,
        rawRel: clamp(localFrac / centerLocalFrac, 0, 1),
        mountFrac: pack.mountFrac,
      });

      if (Number.isFinite(rMm) && rMm > halfDiag + Math.max(0.1, Number(cfg.diagMarginMm || 0))) {
        beyondDiagRun++;
      } else {
        beyondDiagRun = 0;
      }
      if (fieldSamples.length >= minSamplesForBreak && beyondDiagRun >= 2) break;
    }

    const ordered = fieldSamples
      .filter((s) => Number.isFinite(s.rMm))
      .sort((a, b) => a.rMm - b.rMm);
    if (!ordered.length) {
      return {
        softICmm: 0,
        rEdge: 0,
        relMin: Number(cfg.thresholdRel || 0.35),
        thresholdRel: Number(cfg.thresholdRel || 0.35),
        usableCircleDiameterMm: 0,
        usableCircleRadiusMm: 0,
        relAtCutoff: 0,
        centerGoodFrac: centerLocalFrac,
        centerLocalFrac,
        samples: [],
        focusLensShift: lensShift,
        focusFailed: false,
        drasticDropRadiusMm: null,
      };
    }

    const merged = [];
    for (const s of ordered) {
      const prev = merged[merged.length - 1];
      if (prev && s.rMm <= prev.rMm + 1e-6) {
        prev.goodFrac = Math.min(prev.goodFrac, s.goodFrac);
        prev.localFrac = Math.min(prev.localFrac, s.localFrac);
        prev.rawRel = Math.min(prev.rawRel, s.rawRel);
        prev.mountFrac = Math.max(prev.mountFrac, s.mountFrac);
        prev.thetaDeg = Math.max(prev.thetaDeg, s.thetaDeg);
        continue;
      }
      merged.push({ ...s });
    }

    if (!merged.length || merged[0].rMm > 1e-6) {
      merged.unshift({
        rMm: 0,
        thetaDeg: 0,
        goodFrac: Math.max(0, Number(centerPack.goodFrac || 0)),
        localFrac: centerLocalFrac,
        rawRel: 1,
        mountFrac: centerPack.mountFrac,
      });
    } else {
      merged[0].rMm = 0;
      merged[0].goodFrac = Math.max(merged[0].goodFrac, Number(centerPack.goodFrac || 0));
      merged[0].localFrac = Math.max(merged[0].localFrac, centerLocalFrac);
      merged[0].rawRel = 1;
    }

    const radialMm = merged.map((s) => s.rMm);
    const relCurveRaw = merged.map((s) => clamp(s.rawRel, 0, 1));
    const uc = computeUsableCircleFromRadialCurve(radialMm, relCurveRaw, cfg);

    const relCurve = (uc.relCurve?.length === merged.length) ? uc.relCurve : relCurveRaw;
    const thr = Number(uc.thresholdRel || cfg.thresholdRel || 0.35);
    const samples = merged.map((s, i) => {
      const relIllum = clamp(Number(relCurve[i] ?? s.rawRel), 0, 1);
      return {
        rMm: s.rMm,
        thetaDeg: s.thetaDeg,
        goodFrac: s.goodFrac,
        localFrac: s.localFrac,
        relRaw: s.rawRel,
        relIllum,
        stopsDown: relIllum > cfg.eps ? -Math.log2(relIllum) : Infinity,
        mountFrac: s.mountFrac,
        pass: relIllum >= thr,
      };
    });

    let drasticDropRadiusMm = null;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const dr = b.rMm - a.rMm;
      if (dr <= 1e-9) continue;
      const slope = (a.relIllum - b.relIllum) / dr;
      if (slope > cfg.drasticSlopePerMm) {
        drasticDropRadiusMm = b.rMm;
        break;
      }
    }

    let rEdge = uc.valid ? Number(uc.radiusMm || 0) : 0;
    rEdge = clamp(rEdge, 0, halfDiag);
    const softICmm = uc.valid ? clamp(Number(uc.diameterMm || 0), 0, 2 * halfDiag) : 0;

    return {
      softICmm,
      rEdge,
      relMin: thr, // alias for backward compatibility
      thresholdRel: thr,
      usableCircleDiameterMm: softICmm,
      usableCircleRadiusMm: rEdge,
      relAtCutoff: Number(uc.relAtCutoff || 0),
      centerGoodFrac: centerLocalFrac,
      centerLocalFrac,
      samples,
      focusLensShift: lensShift,
      focusFailed: false,
      drasticDropRadiusMm,
    };
  }

  function getSoftIcForCurrentLens(surfaces, sensorW, sensorH, wavePreset, rayCount) {
    const keyObj = {
      wavePreset,
      rayCount,
      sensorW: Number(sensorW).toFixed(3),
      sensorH: Number(sensorH).toFixed(3),
      softCfg: {
        thresholdRel: Number(SOFT_IC_CFG.thresholdRel).toFixed(4),
        bgOverscan: Number(SOFT_IC_CFG.bgOverscan).toFixed(3),
        bgLutSamples: Number(SOFT_IC_CFG.bgLutSamples).toFixed(0),
        bgPupilSqrt: Number(SOFT_IC_CFG.bgPupilSqrt).toFixed(0),
        bgObjDistMm: Number(SOFT_IC_CFG.bgObjDistMm).toFixed(2),
        smoothingHalfWindow: Number(SOFT_IC_CFG.smoothingHalfWindow).toFixed(0),
      },
      surfaces: (surfaces || []).map((s) => ({
        type: String(s.type || ""),
        R: Number(s.R || 0).toFixed(6),
        t: Number(s.t || 0).toFixed(6),
        ap: Number(s.ap || 0).toFixed(6),
        glass: String(s.glass || "AIR"),
        stop: !!s.stop,
      })),
    };
    const key = JSON.stringify(keyObj);
    if (key === _softIcCacheKey && _softIcCacheVal) return _softIcCacheVal;
    const val = estimateUsableCircleBackgroundLut(surfaces, sensorW, sensorH, wavePreset, rayCount);
    _softIcCacheKey = key;
    _softIcCacheVal = val;
    return val;
  }

  function distortionFlavorFromEdgePct(edgePct) {
    const v = Number(edgePct);
    if (!Number.isFinite(v)) return "unknown";
    if (v <= -0.05) return "barrel";
    if (v >= 0.05) return "pincushion";
    return "neutral";
  }

  function measureDistortionChiefSamples(
    surfaces,
    wavePreset,
    sensorX,
    sensorW,
    sensorH,
    efl,
    mode = "d",
    fracs = null
  ) {
    const idealHalf = coverageHalfSizeMm(sensorW, sensorH, mode);
    if (!Number.isFinite(efl) || efl <= 1e-9 || !Number.isFinite(idealHalf) || idealHalf < 1e-9) return null;
    const fractions = Array.isArray(fracs) && fracs.length
      ? fracs.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
      : [0.25, 0.55, 0.85, 1.00];
    if (!fractions.length) return null;

    let sumSq = 0;
    let maxAbs = 0;
    let validSamples = 0;
    const samples = [];
    for (let i = 0; i < fractions.length; i++) {
      const frac = clamp(fractions[i], 1e-4, 1.25);
      const rIdeal = idealHalf * frac;
      if (!(Number.isFinite(rIdeal) && rIdeal > 1e-9)) continue;
      const thetaRad = Math.atan(rIdeal / efl);
      const thetaDeg = thetaRad * (180 / Math.PI);
      const chief = buildChiefRay(surfaces, thetaDeg);
      const tr = traceRayForward(clone(chief), surfaces, wavePreset);
      if (!tr || tr.vignetted || tr.tir || !tr.endRay) {
        samples.push({
          frac,
          thetaDeg,
          rIdeal,
          rActual: null,
          distRel: null,
          distPct: null,
          ok: false,
        });
        continue;
      }
      const y = rayHitYAtX(tr.endRay, sensorX);
      if (!Number.isFinite(y)) {
        samples.push({
          frac,
          thetaDeg,
          rIdeal,
          rActual: null,
          distRel: null,
          distPct: null,
          ok: false,
        });
        continue;
      }
      const rActual = Math.abs(y);
      const distRel = (rActual - rIdeal) / rIdeal;
      const distAbs = Math.abs(distRel);
      validSamples += 1;
      sumSq += distRel * distRel;
      if (distAbs > maxAbs) maxAbs = distAbs;
      samples.push({
        frac,
        thetaDeg,
        rIdeal,
        rActual,
        distRel,
        distPct: distRel * 100,
        ok: true,
      });
    }
    if (validSamples <= 0) return null;
    const rmsPct = Math.sqrt(sumSq / validSamples) * 100;
    const edgeSample = [...samples].reverse().find((s) => Number.isFinite(s?.distPct));
    const edgePct = Number.isFinite(edgeSample?.distPct) ? Number(edgeSample.distPct) : null;
    const sampleCount = fractions.length;
    const missingSamples = Math.max(0, sampleCount - validSamples);
    return {
      mode,
      sampleCount,
      validSamples,
      missingSamples,
      rmsPct,
      maxPct: maxAbs * 100,
      edgePct,
      flavor: distortionFlavorFromEdgePct(edgePct),
      samples,
    };
  }

  function getDistortionChiefStatsCached(
    surfaces,
    wavePreset,
    sensorX,
    sensorW,
    sensorH,
    efl,
    mode = "d",
    fracs = null
  ) {
    const fractions = Array.isArray(fracs) && fracs.length
      ? fracs.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
      : [0.25, 0.55, 0.85, 1.00];
    const keyObj = {
      wavePreset: String(wavePreset || "d"),
      sensorX: Number(sensorX || 0).toFixed(6),
      sensorW: Number(sensorW || 0).toFixed(4),
      sensorH: Number(sensorH || 0).toFixed(4),
      efl: Number(efl || 0).toFixed(6),
      mode: String(mode || "d"),
      fracs: fractions.map((x) => Number(x).toFixed(4)),
      surfaces: (surfaces || []).map((s) => ({
        type: String(s?.type || ""),
        R: Number(s?.R || 0).toFixed(6),
        ap: Number(s?.ap || 0).toFixed(6),
        t: Number(s?.t || 0).toFixed(6),
        vx: Number(s?.vx || 0).toFixed(6),
        glass: String(s?.glass || "AIR"),
        stop: !!s?.stop,
      })),
    };
    const key = JSON.stringify(keyObj);
    if (key === _distCacheKey) return _distCacheVal;
    const val = measureDistortionChiefSamples(
      surfaces,
      wavePreset,
      sensorX,
      sensorW,
      sensorH,
      efl,
      mode,
      fractions
    );
    _distCacheKey = key;
    _distCacheVal = val;
    return val;
  }

  function estimateDistortionPct(surfaces, wavePreset, sensorX, sensorW, sensorH, efl, mode = "d") {
    const stats = getDistortionChiefStatsCached(
      surfaces,
      wavePreset,
      sensorX,
      sensorW,
      sensorH,
      efl,
      mode
    );
    return Number.isFinite(stats?.edgePct) ? Number(stats.edgePct) : null;
  }

  function formatDistortionBadgeText(stats, compact = false) {
    if (!stats || !Number.isFinite(stats?.rmsPct) || !Number.isFinite(stats?.maxPct)) {
      return compact ? "Dist RMS — • MAX —" : "Dist RMS: — • MAX: —";
    }
    const rmsTxt = `${Number(stats.rmsPct).toFixed(2)}%`;
    const maxTxt = `${Number(stats.maxPct).toFixed(2)}%`;
    const flavor = String(stats?.flavor || "neutral");
    const tail = (flavor === "barrel" || flavor === "pincushion") ? ` • ${flavor}` : "";
    return compact
      ? `Dist RMS ${rmsTxt} • MAX ${maxTxt}${tail}`
      : `Dist RMS: ${rmsTxt} • MAX: ${maxTxt}${tail}`;
  }

  function distortionWeightForStage(stage) {
    const st = Number(stage);
    if (st === 0) return Number(MERIT_CFG.distStageWeights?.[0] || 0);
    if (st === 1) return Number(MERIT_CFG.distStageWeights?.[1] || 0);
    if (st === 2) return Number(MERIT_CFG.distStageWeights?.[2] || 0);
    if (st >= 3) return Number(MERIT_CFG.distStageWeights?.[3] || 0);
    return 0;
  }

  function distortionWeightForPriority(pri) {
    if (!pri || !pri.feasible) return 0;
    let w = distortionWeightForStage(pri.stage);
    if (!pri.flInBand) {
      w = Math.min(w, Number(MERIT_CFG.distStageWeights?.[0] || 0));
    }
    if (pri.stage >= 3 && !pri.tGood) {
      // Keep distortion gentle until T is also within its good band.
      w = Math.min(w, Number(MERIT_CFG.distStageWeights?.[1] || w));
    }
    return Math.max(0, w);
  }

  function distortionPenaltyFromStats(stats, distWeight = 0) {
    const weight = Math.max(0, Number(distWeight || 0));
    if (weight <= 0) {
      return {
        weight,
        baseTerm: 0,
        penalty: 0,
        rmsTerm: 0,
        maxTerm: 0,
        edgeTerm: 0,
        missingTerm: 0,
      };
    }
    if (!stats) {
      const baseTerm = Math.max(0, Number(MERIT_CFG.distNoDataTerm || 0));
      return {
        weight,
        baseTerm,
        penalty: baseTerm * weight,
        rmsTerm: 0,
        maxTerm: 0,
        edgeTerm: 0,
        missingTerm: baseTerm,
      };
    }
    const rmsPct = Number(stats?.rmsPct);
    const maxPct = Number(stats?.maxPct);
    const edgePct = Number(stats?.edgePct);
    const sampleCount = Math.max(1, Number(stats?.sampleCount || 1));
    const validSamples = Math.max(0, Number(stats?.validSamples || 0));
    const missingSamples = Math.max(0, sampleCount - validSamples);
    const missFrac = clamp(missingSamples / sampleCount, 0, 1);
    const missingTerm = Number(MERIT_CFG.distMissingWeight || 0) * (missFrac * missFrac);

    if (!Number.isFinite(rmsPct) || !Number.isFinite(maxPct)) {
      const noDataTerm = Math.max(0, Number(MERIT_CFG.distNoDataTerm || 0));
      const baseTerm = noDataTerm + missingTerm;
      return {
        weight,
        baseTerm,
        penalty: baseTerm * weight,
        rmsTerm: 0,
        maxTerm: 0,
        edgeTerm: 0,
        missingTerm,
      };
    }

    const rmsNorm = Math.max(1e-6, Number(MERIT_CFG.distNormPct || 1.0));
    const maxNorm = Math.max(1e-6, Number(MERIT_CFG.distMaxNormPct || 1.5));
    const edgeNorm = Math.max(1e-6, Number(MERIT_CFG.distEdgeNormPct || maxNorm));
    const rmsTerm = Math.pow(rmsPct / rmsNorm, 2);
    const maxTerm = 0.5 * Math.pow(maxPct / maxNorm, 2);
    const edgeTerm = Number.isFinite(edgePct)
      ? 0.35 * Math.pow(Math.abs(edgePct) / edgeNorm, 2)
      : 0;
    const baseTerm = rmsTerm + maxTerm + edgeTerm + missingTerm;
    return {
      weight,
      baseTerm,
      penalty: baseTerm * weight,
      rmsTerm,
      maxTerm,
      edgeTerm,
      missingTerm,
    };
  }

  function collectUiSnapshot() {
    return {
      sensorPreset: ui.sensorPreset?.value || "ARRI Alexa Mini LF (LF)",
      sensorW: ui.sensorW?.value || "",
      sensorH: ui.sensorH?.value || "",
      fieldAngle: ui.fieldAngle?.value || "0",
      rayCount: ui.rayCount?.value || "31",
      wavePreset: ui.wavePreset?.value || "d",
      sensorOffset: ui.sensorOffset?.value || "0",
      focusMode: ui.focusMode?.value || "cam",
      lensFocus: ui.lensFocus?.value || "0",
      renderScale: ui.renderScale?.value || "1.25",
      optTargetFL: ui.optTargetFL?.value || "75",
      optTargetT: ui.optTargetT?.value || "2.0",
      optTargetIC: ui.optTargetIC?.value || "0",
      optIters: ui.optIters?.value || "2000",
      optPop: ui.optPop?.value || "safe",
    };
  }

  function applyUiSnapshot(snap) {
    if (!snap || typeof snap !== "object") return;
    const set = (el, v) => { if (el != null && v != null) el.value = String(v); };
    set(ui.sensorPreset, snap.sensorPreset);
    set(ui.sensorW, snap.sensorW);
    set(ui.sensorH, snap.sensorH);
    set(ui.fieldAngle, snap.fieldAngle);
    set(ui.rayCount, snap.rayCount);
    set(ui.wavePreset, snap.wavePreset);
    set(ui.sensorOffset, snap.sensorOffset);
    set(ui.focusMode, snap.focusMode);
    set(ui.lensFocus, snap.lensFocus);
    set(ui.renderScale, snap.renderScale);
    set(ui.optTargetFL, snap.optTargetFL);
    set(ui.optTargetT, snap.optTargetT);
    set(ui.optTargetIC, snap.optTargetIC);
    set(ui.optIters, snap.optIters);
    set(ui.optPop, snap.optPop);
  }

  let _autosaveTimer = 0;
  function saveAutosaveNow() {
    try {
      const payload = {
        savedAt: Date.now(),
        lens: sanitizeLens(lens),
        ui: collectUiSnapshot(),
      };
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
    } catch (_) {}
  }
  function scheduleAutosave(ms = 320) {
    if (_autosaveTimer) clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(() => {
      _autosaveTimer = 0;
      saveAutosaveNow();
    }, ms);
  }
  function restoreAutosave() {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return false;
      const payload = JSON.parse(raw);
      if (!payload || !payload.lens) return false;
      applyUiSnapshot(payload.ui);
      lens = sanitizeLens(payload.lens);
      selectedIndex = 0;
      clampAllApertures(lens.surfaces);
      buildTable();
      applySensorToIMS();
      renderAll();
      toast("Autosave restored");
      return true;
    } catch (_) {
      return false;
    }
  }

  // -------------------- spot RMS + autofocus core --------------------
  function bundleStatsAtSensorX(traces, sensorX, sensorHalfMm = null) {
    const ys = [];
    let insideCount = 0;
    for (const tr of traces) {
      if (!tr || tr.vignetted || tr.tir) continue;
      const y = rayHitYAtX(tr.endRay, sensorX);
      if (y == null) continue;
      ys.push(y);
      if (Number.isFinite(sensorHalfMm) && Math.abs(y) <= sensorHalfMm + SENSOR_CLIP_TOL_MM) {
        insideCount++;
      }
    }
    if (ys.length < 5) {
      return {
        rms: null,
        n: ys.length,
        insideFrac: Number.isFinite(sensorHalfMm) ? (insideCount / Math.max(1, traces.length)) : null,
        insideCount,
        maxAbsY: ys.length ? Math.max(...ys.map((v) => Math.abs(v))) : null,
      };
    }
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    const rms = Math.sqrt(ys.reduce((acc, y) => acc + (y - mean) ** 2, 0) / ys.length);
    return {
      rms,
      n: ys.length,
      insideFrac: Number.isFinite(sensorHalfMm) ? (insideCount / Math.max(1, traces.length)) : null,
      insideCount,
      maxAbsY: ys.length ? Math.max(...ys.map((v) => Math.abs(v))) : null,
    };
  }

  function spotRmsAtSensorX(traces, sensorX) {
    const st = bundleStatsAtSensorX(traces, sensorX, null);
    return { rms: st.rms, n: st.n };
  }

  function bestLensShiftForDesign(surfaces, fieldAngle, rayCount, wavePreset, opts = null) {
    const o = opts || {};
    const sensorX = 0.0;
    const x0 = Number.isFinite(o.centerShift) ? Number(o.centerShift) : 0;
    const range = Math.max(0.4, Number.isFinite(o.coarseHalfRange) ? Number(o.coarseHalfRange) : 22);
    const coarseStep = Math.max(0.02, Number.isFinite(o.coarseStep) ? Number(o.coarseStep) : 0.35);
    const fineHalfRange = Math.max(0.08, Number.isFinite(o.fineHalfRange) ? Number(o.fineHalfRange) : 2.4);
    const fineStep = Math.max(0.02, Number.isFinite(o.fineStep) ? Number(o.fineStep) : 0.07);
    const afRayCount = Math.max(5, Math.min(61, Number.isFinite(o.rayCount) ? (Number(o.rayCount) | 0) : (rayCount | 0)));

    let best = { shift: x0, rms: Infinity, n: 0 };

    function evalShift(shift) {
      computeVertices(surfaces, shift, sensorX);
      const rays = buildRays(surfaces, fieldAngle, afRayCount);
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
    if (Number.isFinite(best.rms)) scan(best.shift, fineHalfRange, fineStep);
    if (!Number.isFinite(best.rms) || best.n < 5) return { shift: 0, ok: false, rms: null };
    return { shift: best.shift, ok: true, rms: best.rms };
  }

  function autoFocus() {
    if (ui.focusMode) ui.focusMode.value = "lens";
    if (ui.sensorOffset) ui.sensorOffset.value = "0";

    const fieldAngle = num(ui.fieldAngle?.value, 0);
    const rayCount = num(ui.rayCount?.value, 31);
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
    vigWeight: 16.0,
    centerVigWeight: 180.0,
    midVigWeight: 60.0,
    intrusionWeight: 16.0,
    fieldWeights: [1.0, 1.5, 2.0],
    distSampleFracs: [0.25, 0.55, 0.85, 1.00], // chief-ray samples across image height/diag
    distNormPct: 0.55,        // RMS distortion normalization target
    distMaxNormPct: 0.95,     // MAX distortion normalization target
    distEdgeNormPct: 0.60,    // edge distortion normalization target
    distMissingWeight: 3.0,   // penalize missing/invalid chief samples
    distNoDataTerm: 30.0,     // heavy penalty when distortion cannot be measured
    distStageWeights: [0.08, 0.22, 0.55, 6.50], // stage 0..3
    distFastMeasureOnlyInFlBand: true, // keep fast-tier evals lightweight outside FL lock band
    crossPairWeight: 3200.0,  // no internal ray crossing in glass
    crossSegWeight: 900.0,

    // target terms (optimizer uses these)
    eflWeight: 0.35,          // penalty per mm error (squared)
    eflRelWeight: 6000.0,     // relative EFL penalty (dominant vs absolute mm)
    eflBarrierRel: 0.05,      // beyond 5% FL error, apply hard barrier
    eflBarrierWeight: 280000.0,
    tWeight: 10.0,            // penalty per too-slow T overshoot (squared)
    tBarrierAbs: 0.50,        // beyond +0.5 too-slow T overshoot, apply hard barrier
    tBarrierWeight: 5200.0,
    bflMin: 52.0,             // for PL: discourage too-short backfocus
    bflWeight: 6.0,
    lowValidPenalty: 450.0,
    hardInvalidPenalty: 1_000_000.0,
  };

  function internalCrossPenaltyFromStats(stats) {
    const pairs = Math.max(0, Number(stats?.crossPairs || 0));
    const segs = Math.max(0, Number(stats?.crossSegments || 0));
    if (pairs <= 0) return 0;
    const wPair = Math.max(0, Number(MERIT_CFG.crossPairWeight || 0));
    const wSeg = Math.max(0, Number(MERIT_CFG.crossSegWeight || 0));
    return (wPair * pairs * pairs) + (wSeg * segs * segs);
  }

  function traceBundleAtField(surfaces, fieldDeg, rayCount, wavePreset, sensorX, sensorHalfMm = null){
    const rays = buildRays(surfaces, fieldDeg, rayCount);
    const traces = rays.map((r) => traceRayForward(clone(r), surfaces, wavePreset));
    const vCount = traces.filter((t) => t.vignetted).length;
    const vigFrac = traces.length ? (vCount / traces.length) : 1;
    const st = bundleStatsAtSensorX(traces, sensorX, sensorHalfMm);
    return {
      traces,
      rms: st.rms,
      n: st.n,
      vigFrac,
      vCount,
      insideFrac: st.insideFrac,
      insideCount: st.insideCount,
      maxAbsY: st.maxAbsY,
    };
  }

  function computeMeritV1({
    surfaces,
    wavePreset,
    sensorX,
    rayCount,
    fov,
    intrusion,
    efl, T, bfl,
    targetEfl = null,
    targetT = null,
    physPenalty = 0,
    hardInvalid = false,
    internalCrossPairs = 0,
    internalCrossSegments = 0,
    internalCrossPenalty = 0,
    distortionStats = null,
    distortionPenalty = 0,
    distortionWeight = 0,
  }){
    const edge = Number.isFinite(fov?.dfov) ? clamp(fov.dfov * 0.5, 4, 60) : 15;
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

    if (Number.isFinite(intrusion) && intrusion > 0){
      const x = intrusion / 1.0;
      merit += MERIT_CFG.intrusionWeight * (x * x);
    }

    // BFL soft-constraint (paraxial) – helps keep designs physically plausible
    if (Number.isFinite(bfl) && bfl < MERIT_CFG.bflMin){
      const d = (MERIT_CFG.bflMin - bfl);
      merit += MERIT_CFG.bflWeight * (d * d);
    }

    // Targets (optional)
    if (Number.isFinite(targetEfl) && targetEfl > 1e-9 && Number.isFinite(efl)){
      const d = (efl - targetEfl);
      const dRel = Math.abs(d) / targetEfl;
      merit += MERIT_CFG.eflWeight * (d * d);
      merit += MERIT_CFG.eflRelWeight * (dRel * dRel);
      if (dRel > MERIT_CFG.eflBarrierRel) {
        const x = dRel - MERIT_CFG.eflBarrierRel;
        merit += MERIT_CFG.eflBarrierWeight * (x * x);
      }
    }
    if (Number.isFinite(targetT) && Number.isFinite(T)){
      // Target T is treated as a maximum allowed value.
      // Faster lens (smaller T) is acceptable; only too-slow T is penalized.
      const dSlow = Math.max(0, T - targetT);
      merit += MERIT_CFG.tWeight * (dSlow * dSlow);
      if (dSlow > MERIT_CFG.tBarrierAbs) {
        const x = dSlow - MERIT_CFG.tBarrierAbs;
        merit += MERIT_CFG.tBarrierWeight * (x * x);
      }
    }

    const minValidTarget = Math.max(7, Math.floor(rayCount * 0.45));
    if (validMin < minValidTarget) {
      const d = (minValidTarget - validMin);
      merit += MERIT_CFG.lowValidPenalty + 32.0 * d * d;
    }

    if (Number.isFinite(physPenalty) && physPenalty > 0) merit += physPenalty;
    if (Number.isFinite(internalCrossPenalty) && internalCrossPenalty > 0) merit += internalCrossPenalty;
    if (hardInvalid) merit += MERIT_CFG.hardInvalidPenalty;
    if (Number.isFinite(distortionPenalty) && distortionPenalty > 0) merit += distortionPenalty;

    const breakdown = {
      rmsCenter, rmsEdge,
      vigPct: Math.round(vigAvg * 100),
      intrusion: Number.isFinite(intrusion) ? intrusion : null,
      fields: fields.map(v => Number.isFinite(v) ? v : 0),
      vigCenterPct: Math.round(vigCenter * 100),
      vigMidPct: Math.round(vigMid * 100),
      physPenalty: Number.isFinite(physPenalty) ? physPenalty : 0,
      hardInvalid: !!hardInvalid,
      internalCrossPairs: Math.max(0, Number(internalCrossPairs || 0)),
      internalCrossSegments: Math.max(0, Number(internalCrossSegments || 0)),
      internalCrossPenalty: Number.isFinite(internalCrossPenalty) ? Number(internalCrossPenalty) : 0,
      distRmsPct: Number.isFinite(distortionStats?.rmsPct) ? Number(distortionStats.rmsPct) : null,
      distMaxPct: Number.isFinite(distortionStats?.maxPct) ? Number(distortionStats.maxPct) : null,
      distEdgePct: Number.isFinite(distortionStats?.edgePct) ? Number(distortionStats.edgePct) : null,
      distFlavor: String(distortionStats?.flavor || "unknown"),
      distPenalty: Number.isFinite(distortionPenalty) ? Number(distortionPenalty) : 0,
      distWeight: Number.isFinite(distortionWeight) ? Number(distortionWeight) : 0,
      distSampleCount: Number.isFinite(distortionStats?.sampleCount) ? Number(distortionStats.sampleCount) : 0,
      distValidSamples: Number.isFinite(distortionStats?.validSamples) ? Number(distortionStats.validSamples) : 0,
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
    const base = num(ui.renderScale?.value, 1.25) * 3.2;
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

    const throatR = Number.isFinite(opts.throatR) ? opts.throatR : MOUNT_TRACE_CFG.throatR;
    const outerR  = Number.isFinite(opts.outerR)  ? opts.outerR  : 31;
    const camDepth= Number.isFinite(opts.camDepth)? opts.camDepth: MOUNT_TRACE_CFG.camDepth;
    const lensLip = Number.isFinite(opts.lensLip) ? opts.lensLip : MOUNT_TRACE_CFG.lensLip;
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

    const fieldAngle = num(ui.fieldAngle?.value, 0);
    const rayCount   = num(ui.rayCount?.value, 31);
    const wavePreset = ui.wavePreset?.value || "d";

    const { w: sensorW, h: sensorH, halfH } = getSensorWH();

    const focusMode = String(ui.focusMode?.value || "cam").toLowerCase();
    const sensorX = (focusMode === "cam") ? num(ui.sensorOffset?.value, 0) : 0.0;
    const lensShift = (focusMode === "lens") ? num(ui.lensFocus?.value, 0) : 0;

    computeVertices(lens.surfaces, lensShift, sensorX);

    const plX = -PL_FFD;

    const rays = buildRays(lens.surfaces, fieldAngle, rayCount);
    const traces = rays.map((r) => traceRayForward(clone(r), lens.surfaces, wavePreset));
    const rayCross = detectInternalRayCrossings(traces, lens.surfaces, wavePreset);
    const crossPenalty = internalCrossPenaltyFromStats(rayCross);

    const vCount = traces.filter((t) => t.vignetted).length;
    const tirCount = traces.filter((t) => t.tir).length;
    const vigPct = traces.length ? Math.round((vCount / traces.length) * 100) : 0;

    const { efl, bfl } = estimateEflBflParaxial(lens.surfaces, wavePreset);
    const Tgeom = estimateTStopApprox(efl, lens.surfaces);
    const centerTp = measureCenterThroughput(lens.surfaces, wavePreset, sensorX, Math.max(31, rayCount | 0));
    const T = estimateEffectiveT(Tgeom, centerTp.goodFrac);
    const tLoss = tLossStops(T, Tgeom);

    const fov = computeFovDeg(efl, sensorW, sensorH);
    const fovTxt = !fov
      ? "FOV: —"
      : `FOV: H ${fov.hfov.toFixed(1)}° • V ${fov.vfov.toFixed(1)}° • D ${fov.dfov.toFixed(1)}°`;

    const softIc = getSoftIcForCurrentLens(lens.surfaces, sensorW, sensorH, wavePreset, rayCount);
    const icDiameterMm = Number(
      softIc?.usableCircleDiameterMm ?? softIc?.softICmm ?? 0
    );
    const softIcValid = Number.isFinite(icDiameterMm) && icDiameterMm > 0.1;
    const softIcTxt = softIcValid ? `IC: Ø${icDiameterMm.toFixed(1)}mm` : "IC: —";
    const softIcDetailTxt = softIcValid
      ? `Image Circle: Ø${icDiameterMm.toFixed(1)}mm (IC${Math.round(Number(softIc?.thresholdRel || SOFT_IC_CFG.thresholdRel || 0.35) * 100)}%)`
      : "Image Circle: —";

    const rearVx = lastPhysicalVertexX(lens.surfaces);
    const intrusion = rearVx - plX;
    const phys = evaluatePhysicalConstraints(lens.surfaces);
    const physPenaltyBase = Number(phys.penalty || 0);
    const targetEflUi = num(ui.optTargetFL?.value, NaN);
    const targetTUi = num(ui.optTargetT?.value, NaN);
    const targetICUi = Math.max(0, num(ui.optTargetIC?.value, 0));
    const distStats = getDistortionChiefStatsCached(
      lens.surfaces,
      wavePreset,
      sensorX,
      sensorW,
      sensorH,
      efl,
      "d",
      MERIT_CFG.distSampleFracs
    );
    const previewPri = buildOptPriority(
      {
        score: 0,
        efl,
        T,
        softIcMm: softIcValid ? icDiameterMm : 0,
        intrusion,
        hardInvalid: !!phys.hardFail || !!rayCross.invalid,
        physPenalty: physPenaltyBase,
        worstOverlap: Number(phys.worstOverlap || 0),
        worstPinch: Number(phys.worstPinch || 0),
        internalCrossPairs: Number(rayCross.crossPairs || 0),
        internalCrossSegments: Number(rayCross.crossSegments || 0),
      },
      {
        targetEfl: targetEflUi,
        targetIC: targetICUi,
        targetT: targetTUi,
      }
    );
    const distWeight = distortionWeightForPriority(previewPri);
    const distPenaltyRes = distortionPenaltyFromStats(distStats, distWeight);
    const distBadgeText = formatDistortionBadgeText(distStats, false);
    const distBadgeTopText = formatDistortionBadgeText(distStats, true);

    const meritRes = computeMeritV1({
      surfaces: lens.surfaces,
      wavePreset,
      sensorX,
      rayCount,
      fov,
      intrusion,
      efl, T, bfl,
      targetEfl: targetEflUi,
      targetT: targetTUi,
      physPenalty: physPenaltyBase,
      hardInvalid: !!phys.hardFail || !!rayCross.invalid,
      internalCrossPairs: Number(rayCross.crossPairs || 0),
      internalCrossSegments: Number(rayCross.crossSegments || 0),
      internalCrossPenalty: crossPenalty,
      distortionStats: distStats,
      distortionPenalty: distPenaltyRes.penalty,
      distortionWeight: distPenaltyRes.weight,
    });

    const m = meritRes.merit;
    const bd = meritRes.breakdown;

    const meritTxt =
      `Merit: ${Number.isFinite(m) ? m.toFixed(2) : "—"} ` +
      `(RMS0 ${bd.rmsCenter?.toFixed?.(3) ?? "—"}mm • RMSedge ${bd.rmsEdge?.toFixed?.(3) ?? "—"}mm • Vig ${bd.vigPct}%` +
      `${Number.isFinite(bd.vigCenterPct) ? ` • V0 ${bd.vigCenterPct}%` : ""}` +
      `${Number.isFinite(bd.vigMidPct) ? ` • Vmid ${bd.vigMidPct}%` : ""}` +
      `${Number.isFinite(bd.distRmsPct) ? ` • DistRMS ${bd.distRmsPct.toFixed(2)}%` : ""}` +
      `${Number.isFinite(bd.distMaxPct) ? ` • DistMAX ${bd.distMaxPct.toFixed(2)}%` : ""}` +
      `${Number(bd.internalCrossPairs || 0) > 0 ? ` • XOVER ${Number(bd.internalCrossPairs || 0)}` : ""}` +
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
    if (ui.tstop) {
      ui.tstop.textContent = `T_eff≈ ${T == null ? "—" : "T" + T.toFixed(2)} (${Tgeom == null ? "geom —" : "geom T" + Tgeom.toFixed(2)})`;
    }
    if (ui.vig) ui.vig.textContent = `Vignette: ${vigPct}%`;
    if (ui.softIC) ui.softIC.textContent = softIcDetailTxt;
    if (ui.dist) ui.dist.textContent = distBadgeText;
    if (ui.fov) ui.fov.textContent = fovTxt;

    if (ui.eflTop) ui.eflTop.textContent = ui.efl?.textContent || `EFL: ${efl == null ? "—" : efl.toFixed(2)}mm`;
    if (ui.bflTop) ui.bflTop.textContent = ui.bfl?.textContent || `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
    if (ui.tstopTop) ui.tstopTop.textContent = ui.tstop?.textContent || `T_eff≈ ${T == null ? "—" : "T" + T.toFixed(2)}`;
    if (ui.softICTop) ui.softICTop.textContent = softIcTxt;
    if (ui.fovTop) ui.fovTop.textContent = fovTxt;
    if (ui.distTop) ui.distTop.textContent = distBadgeTopText;

    if (phys.hardFail && ui.footerWarn) {
      ui.footerWarn.textContent =
        `INVALID geometry: overlap/clearance issue (overlap ${phys.worstOverlap.toFixed(2)}mm, pinch ${phys.worstPinch.toFixed(2)}mm).`;
    } else if (rayCross.invalid && ui.footerWarn) {
      ui.footerWarn.textContent =
        `INVALID optics: ${rayCross.crossPairs} ray crossings inside glass across ${rayCross.crossSegments} segment(s).`;
    } else if (phys.airGapCount < PHYS_CFG.minAirGapsPreferred && ui.footerWarn) {
      ui.footerWarn.textContent =
        `Few air gaps (${phys.airGapCount}); aim for >= ${PHYS_CFG.minAirGapsPreferred} for practical designs.`;
    } else if (centerTp.goodFrac < 0.85 && ui.footerWarn) {
      ui.footerWarn.textContent =
        `Center throughput low (${(centerTp.goodFrac * 100).toFixed(0)}%): effective T is slower than geometric T.`;
    } else if (tirCount > 0 && ui.footerWarn) {
      ui.footerWarn.textContent = `TIR on ${tirCount} rays (check glass / curvature).`;
    }

    if (ui.status) {
      ui.status.textContent =
        `Selected: ${selectedIndex} • Traced ${traces.length} rays • field ${fieldAngle.toFixed(2)}° • vignetted ${vCount} • xover ${rayCross.crossPairs} • ${softIcTxt} • ${meritTxt}`;
    }
    if (ui.metaInfo) {
      ui.metaInfo.textContent =
        `sensor ${sensorW.toFixed(2)}×${sensorH.toFixed(2)}mm • ` +
        (softIcValid ? `IC ${icDiameterMm.toFixed(1)}mm` : "IC —");
    }

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
    const tTxt   = T == null ? "—" : `T_eff ${T.toFixed(2)}`;
    const tGeomTxt = Tgeom == null ? "—" : `T_geom ${Tgeom.toFixed(2)}`;
    const tpTxt = `Tp0 ${(centerTp.goodFrac * 100).toFixed(0)}%${Number.isFinite(tLoss) ? ` • +${tLoss.toFixed(2)}st` : ""}`;
    const focusTxt = (focusMode === "cam")
      ? `CamFocus ${sensorX.toFixed(2)}mm`
      : `LensFocus ${lensShift.toFixed(2)}mm`;
    const crossTxt = rayCross.crossPairs > 0
      ? `XOVER ${rayCross.crossPairs} ❌`
      : "XOVER 0";

    drawTitleOverlay([
      lens?.name || "Lens",
      `EFL ${eflTxt}`,
      `BFL ${bfl == null ? "—" : bfl.toFixed(2) + "mm"}`,
      tTxt,
      tGeomTxt,
      tpTxt,
      softIcTxt,
      crossTxt,
      distBadgeTopText,
      fovTxt,
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

  function normalizeScratchFamily(v) {
    const s = String(v || "auto").trim().toLowerCase();
    if (s === "double-gauss" || s === "double_gauss" || s === "dg") return "double_gauss";
    if (s === "retrofocus" || s === "retrofocus wide" || s === "retrofocus_wide" || s === "wide") return "retrofocus_wide";
    if (s === "tele" || s === "telephoto") return "telephoto";
    return "auto";
  }

  function normalizeScratchAggressiveness(v) {
    const s = String(v || "normal").trim().toLowerCase();
    if (s === "safe") return "safe";
    if (s === "wild") return "wild";
    return "normal";
  }

  function scratchFamilyLabel(key) {
    if (key === "double_gauss") return "Double-Gauss";
    if (key === "retrofocus_wide") return "Retrofocus Wide";
    if (key === "telephoto") return "Telephoto";
    return "Auto";
  }

  function autoScratchFamilyForTargetEfl(targetEfl) {
    const f = Number(targetEfl || 0);
    if (!Number.isFinite(f) || f <= 0) return "double_gauss";
    if (f < Number(SCRATCH_CFG.autoFamilyWideMaxMm || 35)) return "retrofocus_wide";
    if (f <= Number(SCRATCH_CFG.autoFamilyNormalMaxMm || 85)) return "double_gauss";
    return "telephoto";
  }

  function resolveScratchFamily(requestedFamily, targetEfl) {
    const req = normalizeScratchFamily(requestedFamily);
    return req === "auto" ? autoScratchFamilyForTargetEfl(targetEfl) : req;
  }

  function countLensElements(surfaces) {
    if (!Array.isArray(surfaces)) return 0;
    let n = 0;
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      const g = String(resolveGlassName(s?.glass || "AIR")).toUpperCase();
      if (g !== "AIR") n++;
    }
    return n;
  }

  function clampScratchMaxElements(v) {
    const raw = Number(v);
    if (!Number.isFinite(raw)) return 8;
    const minE = Number(SCRATCH_CFG.minElements || 3);
    const maxE = Number(SCRATCH_CFG.maxElementsHardCap || 14);
    return Math.max(minE, Math.min(maxE, Math.round(raw)));
  }

  function clampScratchEffort(v) {
    const raw = Number(v);
    const lo = Number(SCRATCH_CFG.effortMin || 0.6);
    const hi = Number(SCRATCH_CFG.effortMax || 4.0);
    const def = Number(SCRATCH_CFG.effortDefault || 1.0);
    if (!Number.isFinite(raw)) return clamp(def, lo, hi);
    return clamp(raw, lo, hi);
  }

  function scratchMmFromF(f, rel, lo, hi) {
    return clamp(Math.abs(Number(f || 50)) * Number(rel || 0.1), Number(lo || 0.1), Number(hi || 999));
  }

  function scratchRadiusFromF(f, rel, lo, hi, sign = 1) {
    const r = scratchMmFromF(f, rel, lo, hi);
    return (Number(sign) >= 0 ? 1 : -1) * r;
  }

  function scratchMakeElementPair({
    R1 = 40,
    R2 = -60,
    tGlass = 4,
    tAir = 2,
    ap = 16,
    glass = "N-BK7HT",
  } = {}) {
    return [
      {
        type: "",
        R: Number(R1),
        t: Math.max(PHYS_CFG.minThickness, Number(tGlass)),
        ap: Math.max(PHYS_CFG.minAperture, Number(ap)),
        glass: resolveGlassName(glass),
        stop: false,
      },
      {
        type: "",
        R: Number(R2),
        t: Math.max(PHYS_CFG.minThickness, Number(tAir)),
        ap: Math.max(PHYS_CFG.minAperture, Number(ap)),
        glass: "AIR",
        stop: false,
      },
    ];
  }

  function setImsApertureForSensor(surfaces, sensorH) {
    if (!Array.isArray(surfaces) || !surfaces.length) return;
    const imsIdx = surfaces.findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
    if (imsIdx < 0) return;
    surfaces[imsIdx].ap = Math.max(0.1, Number(sensorH || 24) * 0.5);
  }

  function findScratchRearSurfaceIndex(surfaces) {
    if (!Array.isArray(surfaces) || !surfaces.length) return -1;
    const imsIdx = surfaces.findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
    if (imsIdx <= 0) return -1;
    for (let i = imsIdx - 1; i >= 0; i--) {
      const t = String(surfaces[i]?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      return i;
    }
    return -1;
  }

  function enforceRearMountStart(surfaces, opts = {}) {
    if (!Array.isArray(surfaces) || !surfaces.length) return false;
    const rearIdx = findScratchRearSurfaceIndex(surfaces);
    if (rearIdx < 0) return false;

    const minRearClear = Math.max(0, Number(opts?.minRearClearMm ?? 0.8));
    const minGapToSensor = Math.max(PHYS_CFG.minAirGap, PL_FFD + minRearClear);
    const maxGapToSensor = Math.max(minGapToSensor + 2, Number(opts?.maxRearGapMm ?? (PL_FFD + 95)));
    const rear = surfaces[rearIdx];
    rear.glass = "AIR";
    rear.t = clamp(
      Math.max(PHYS_CFG.minAirGap, Number(rear.t || 0), minGapToSensor),
      minGapToSensor,
      maxGapToSensor
    );

    // If the gap right before the rear surface got very large, shift excess into the
    // final image-space gap so the geometry does not "balloon" near the sensor.
    const preRearIdx = rearIdx - 1;
    if (preRearIdx >= 0) {
      const prev = surfaces[preRearIdx];
      const tp = String(prev?.type || "").toUpperCase();
      const prevMed = String(resolveGlassName(prev?.glass || "AIR")).toUpperCase();
      if (tp !== "OBJ" && tp !== "IMS" && prevMed === "AIR") {
        const preRearMax = Math.max(PHYS_CFG.minAirGap, Number(opts?.maxPreRearAirGapMm ?? 14));
        const prevGap = Math.max(PHYS_CFG.minAirGap, Number(prev.t || 0));
        if (prevGap > preRearMax) {
          const spill = prevGap - preRearMax;
          prev.t = preRearMax;
          rear.t = clamp(Number(rear.t || 0) + spill, minGapToSensor, maxGapToSensor);
        }
      }
    }
    return true;
  }

  function bakeLensShiftIntoRearGap(surfaces, lensShiftMm) {
    if (!Array.isArray(surfaces) || !surfaces.length) return false;
    const sh = Number(lensShiftMm);
    if (!Number.isFinite(sh) || Math.abs(sh) < 1e-5) return false;
    const rearIdx = findScratchRearSurfaceIndex(surfaces);
    if (rearIdx < 0) return false;
    const rear = surfaces[rearIdx];
    rear.glass = "AIR";
    rear.t = Math.max(PHYS_CFG.minAirGap, Number(rear.t || 0) - sh);
    return true;
  }

  function enforceSingleStopSurface(surfaces) {
    if (!Array.isArray(surfaces) || !surfaces.length) return;
    ensureStopExists(surfaces);
    let stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return;
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") {
        s.stop = false;
        continue;
      }
      const isStop = i === stopIdx;
      s.stop = isStop;
      if (isStop) s.type = "STOP";
      else if (t === "STOP") s.type = "";
    }
  }

  function ensureStopInAirBothSides(surfaces) {
    if (!Array.isArray(surfaces) || !surfaces.length) return;
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return;
    const stop = surfaces[stopIdx];
    if (!stop) return;
    stop.glass = "AIR";
    stop.stop = true;
    stop.type = "STOP";
    if (stopIdx > 0) {
      const prev = surfaces[stopIdx - 1];
      const tp = String(prev?.type || "").toUpperCase();
      if (tp !== "OBJ" && tp !== "IMS") prev.glass = "AIR";
    }
  }

  function recenterScratchStopSurface(surfaces, opts = {}) {
    if (!Array.isArray(surfaces) || surfaces.length < 5) return false;
    const imsIdx = surfaces.findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
    if (imsIdx < 3) return false;
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 1 || stopIdx >= imsIdx) return false;

    computeVertices(surfaces, 0, 0);
    const firstX = firstPhysicalVertexX(surfaces);
    const lastX = lastPhysicalVertexX(surfaces);
    if (!(Number.isFinite(firstX) && Number.isFinite(lastX) && lastX > firstX + 1e-6)) return false;

    const centerFrac = clamp(Number(opts?.centerFrac ?? 0.50), 0.20, 0.80);
    const targetX = firstX + (lastX - firstX) * centerFrac;
    const currentX = Number(surfaces[stopIdx]?.vx);

    const candidates = [];
    for (let ins = 2; ins <= imsIdx - 1; ins++) {
      const prev = surfaces[ins - 1];
      const next = surfaces[ins];
      const tp = String(prev?.type || "").toUpperCase();
      const tn = String(next?.type || "").toUpperCase();
      if (tp === "OBJ" || tp === "IMS" || tn === "OBJ" || tn === "IMS") continue;
      const prevMedium = String(resolveGlassName(prev?.glass || "AIR")).toUpperCase();
      if (prevMedium !== "AIR") continue;
      const x = Number(next?.vx);
      if (!Number.isFinite(x)) continue;
      candidates.push({ ins, x, dist: Math.abs(x - targetX) });
    }
    if (!candidates.length) return false;
    candidates.sort((a, b) => a.dist - b.dist);
    const best = candidates[0];
    const minMoveMm = Math.max(0.5, Number(opts?.minMoveMm ?? 2.0));
    if (Number.isFinite(currentX) && Math.abs(best.x - currentX) < minMoveMm) return false;

    const stopSurf = surfaces.splice(stopIdx, 1)[0];
    let insertIdx = best.ins;
    if (insertIdx > stopIdx) insertIdx--;

    const movedStop = stopSurf || {};
    movedStop.type = "STOP";
    movedStop.stop = true;
    movedStop.glass = "AIR";
    movedStop.R = 0;
    movedStop.t = clamp(
      Math.max(PHYS_CFG.minAirGap, Number(movedStop.t || opts?.defaultStopGapMm || 2.0)),
      PHYS_CFG.minAirGap,
      24
    );

    surfaces.splice(insertIdx, 0, movedStop);
    enforceSingleStopSurface(surfaces);
    ensureStopInAirBothSides(surfaces);
    return true;
  }

  function scaleLensGeometryToTargetEfl(surfaces, targetEfl, wavePreset) {
    if (!Array.isArray(surfaces) || surfaces.length < 3) return false;
    const tgt = Number(targetEfl || 0);
    if (!Number.isFinite(tgt) || tgt <= 1) return false;

    enforceRearMountStart(surfaces);
    let ok = false;
    for (let pass = 0; pass < 4; pass++) {
      computeVertices(surfaces, 0, 0);
      const p = estimateEflBflParaxial(surfaces, wavePreset);
      const efl = Number(p?.efl);
      if (!(Number.isFinite(efl) && efl > 1e-9)) break;
      const errRel = Math.abs(efl - tgt) / tgt;
      if (errRel <= 0.008) {
        ok = true;
        break;
      }
      const kRaw = tgt / efl;
      if (!Number.isFinite(kRaw) || kRaw <= 0) break;
      const k = pass === 0
        ? clamp(kRaw, 0.30, 3.20)
        : clamp(kRaw, 0.60, 1.70);

      const rearIdx = findScratchRearSurfaceIndex(surfaces);
      for (let i = 0; i < surfaces.length; i++) {
        const s = surfaces[i];
        const t = String(s?.type || "").toUpperCase();
        if (t === "OBJ" || t === "IMS") continue;
        s.R = Number(s.R || 0) * k;
        if (i === rearIdx) {
          // Keep image-space gap tied to mount geometry instead of scaling with optical power.
          s.t = Math.max(PHYS_CFG.minAirGap, Number(s.t || 0));
          s.glass = "AIR";
        } else {
          s.t = Math.max(PHYS_CFG.minThickness, Number(s.t || 0) * k);
        }
        s.ap = Math.max(PHYS_CFG.minAperture, Number(s.ap || 0) * Math.sqrt(k));
      }
      enforceRearMountStart(surfaces);
      quickSanity(surfaces);
      ok = true;
    }
    return ok;
  }

  function setStopForTargetTOnSurfaces(surfaces, targetEfl, targetT) {
    if (!Array.isArray(surfaces) || surfaces.length < 3) return false;
    enforceSingleStopSurface(surfaces);
    let stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return false;

    const tTarget = Number(targetT || 0);
    const fTarget = Number(targetEfl || 0);
    if (!(Number.isFinite(tTarget) && tTarget > 0.2 && Number.isFinite(fTarget) && fTarget > 1)) {
      ensureStopInAirBothSides(surfaces);
      quickSanity(surfaces);
      return true;
    }

    const stop = surfaces[stopIdx];
    const desiredStopAp = clamp(fTarget / (2 * tTarget), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
    // One-sided T target: preserve faster-than-target pupil if already present.
    stop.ap = Math.max(Number(stop.ap || 0), desiredStopAp);
    stop.glass = "AIR";
    stop.stop = true;
    stop.type = "STOP";
    enforceApertureRadiusCoupling(stop, 1.10);

    for (let d = 1; d <= 3; d++) {
      const need = Number(stop.ap || desiredStopAp) * (1 - d * 0.10);
      for (const idx of [stopIdx - d, stopIdx + d]) {
        if (idx < 0 || idx >= surfaces.length) continue;
        const ss = surfaces[idx];
        const tt = String(ss?.type || "").toUpperCase();
        if (tt === "OBJ" || tt === "IMS") continue;
        if (Number(ss.ap || 0) < need) {
          ss.ap = clamp(need, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
        }
        enforceApertureRadiusCoupling(ss, 1.08);
      }
    }

    ensureStopInAirBothSides(surfaces);
    quickSanity(surfaces);
    return true;
  }

  function generateBaseLens(family, targets, sensor, cfg = {}) {
    const resolvedFamily = resolveScratchFamily(family, targets?.targetEfl);
    const f = clamp(Math.abs(Number(targets?.targetEfl || 50)), 14, 260);
    const targetT = (() => {
      const t = Number(targets?.targetT);
      if (Number.isFinite(t) && t > 0.25) return t;
      return 2.0;
    })();
    const targetIC = Math.max(0, Number(targets?.targetIC || 0));
    const sensorW = Math.max(1, Number(sensor?.w || 36));
    const sensorH = Math.max(1, Number(sensor?.h || 24));
    const halfDiag = 0.5 * Math.hypot(sensorW, sensorH);

    const stopAp = clamp(f / (2 * targetT), PHYS_CFG.minAperture, Math.min(26, PHYS_CFG.maxAperture * 0.75));
    const baseAp = clamp(
      Math.max(
        stopAp * 1.65,
        halfDiag * 0.75,
        targetIC > 0 ? targetIC * 0.34 : 0,
        8.0
      ),
      8.0,
      30.0
    );
    const gC = "N-BK7HT";
    const gF = "N-SF5";
    const gHi = "N-LAK9";

    const m = (rel, lo, hi) => scratchMmFromF(f, rel, lo, hi);
    const r = (rel, lo, hi, sign) => scratchRadiusFromF(f, rel, lo, hi, sign);

    const surfaces = [
      { type: "OBJ", R: 0.0, t: 0.0, ap: Math.max(60, baseAp * 2.2), glass: "AIR", stop: false },
    ];
    const pushPair = (spec) => {
      const p = scratchMakeElementPair(spec);
      surfaces.push(p[0], p[1]);
    };

    if (resolvedFamily === "retrofocus_wide") {
      pushPair({
        R1: r(0.56, 8, 180, -1),
        R2: r(0.48, 8, 160, +1),
        tGlass: m(0.10, 2.0, 10),
        tAir: m(0.34, 3.2, 22),
        ap: clamp(baseAp * 1.48, 9, 34),
        glass: gF,
      });
      pushPair({
        R1: r(0.86, 10, 220, +1),
        R2: r(1.14, 14, 280, -1),
        tGlass: m(0.10, 2.0, 11),
        tAir: m(0.11, 1.2, 12),
        ap: clamp(baseAp * 1.30, 8, 32),
        glass: gC,
      });
      surfaces.push({
        type: "STOP",
        R: 0,
        t: m(0.12, 1.2, 14),
        ap: stopAp,
        glass: "AIR",
        stop: true,
      });
      pushPair({
        R1: r(0.96, 10, 240, +1),
        R2: r(1.34, 14, 320, -1),
        tGlass: m(0.09, 1.8, 9),
        tAir: m(0.18, 2.2, 24),
        ap: clamp(baseAp * 1.18, 7, 30),
        glass: gHi,
      });
    } else if (resolvedFamily === "telephoto") {
      pushPair({
        R1: r(0.92, 20, 360, +1),
        R2: r(1.36, 24, 420, -1),
        tGlass: m(0.11, 2.4, 18),
        tAir: m(0.12, 2.0, 14),
        ap: clamp(baseAp * 1.34, 9, 34),
        glass: gHi,
      });
      surfaces.push({
        type: "STOP",
        R: 0,
        t: m(0.12, 1.5, 18),
        ap: stopAp,
        glass: "AIR",
        stop: true,
      });
      pushPair({
        R1: r(0.74, 16, 280, -1),
        R2: r(0.62, 14, 240, +1),
        tGlass: m(0.10, 2.2, 16),
        tAir: m(0.11, 1.8, 14),
        ap: clamp(baseAp * 1.22, 8, 31),
        glass: gF,
      });
      pushPair({
        R1: r(1.20, 22, 380, +1),
        R2: r(1.62, 24, 460, -1),
        tGlass: m(0.09, 1.8, 12),
        tAir: m(0.18, 2.8, 32),
        ap: clamp(baseAp * 1.15, 7, 30),
        glass: gC,
      });
    } else {
      pushPair({
        R1: r(0.94, 14, 260, +1),
        R2: r(1.24, 16, 320, -1),
        tGlass: m(0.10, 2.3, 16),
        tAir: m(0.10, 1.4, 13),
        ap: clamp(baseAp * 1.34, 9, 34),
        glass: gC,
      });
      surfaces.push({
        type: "STOP",
        R: 0,
        t: m(0.12, 1.2, 16),
        ap: stopAp,
        glass: "AIR",
        stop: true,
      });
      pushPair({
        R1: r(0.82, 12, 240, -1),
        R2: r(1.06, 14, 300, +1),
        tGlass: m(0.09, 2.0, 14),
        tAir: m(0.15, 2.2, 26),
        ap: clamp(baseAp * 1.20, 8, 32),
        glass: gF,
      });
    }

    surfaces.push({
      type: "IMS",
      R: 0.0,
      t: 0.0,
      ap: Math.max(0.1, sensorH * 0.5),
      glass: "AIR",
      stop: false,
    });

    recenterScratchStopSurface(surfaces);
    enforceRearMountStart(surfaces);
    quickSanity(surfaces);

    const made = sanitizeLens({
      name: `Scratch ${scratchFamilyLabel(resolvedFamily)} ${f.toFixed(0)}mm`,
      notes: [
        `Generated from scratch (${scratchFamilyLabel(resolvedFamily)}).`,
        `Aggressiveness: ${normalizeScratchAggressiveness(cfg?.aggressiveness || "normal")}`,
      ],
      surfaces,
    });
    return made;
  }

  function prepareScratchLensForTargets(lensObj, targets, sensor, opts = {}) {
    const wavePreset = String(opts?.wavePreset || ui.wavePreset?.value || "d");
    const work = sanitizeLens(clone(lensObj));
    const surfaces = work.surfaces;
    enforceRearMountStart(surfaces);
    setImsApertureForSensor(surfaces, Number(sensor?.h || 24));
    enforceSingleStopSurface(surfaces);
    recenterScratchStopSurface(surfaces);
    ensureStopInAirBothSides(surfaces);
    quickSanity(surfaces);
    scaleLensGeometryToTargetEfl(surfaces, Number(targets?.targetEfl || 50), wavePreset);
    setStopForTargetTOnSurfaces(surfaces, Number(targets?.targetEfl || 50), Number(targets?.targetT || 0));
    promoteElementDiameters(surfaces, {
      targetEfl: Number(targets?.targetEfl || 50),
      targetT: Number(targets?.targetT || 0),
      targetIC: Number(targets?.targetIC || 0),
      stage: 1,
      strength: 0.82,
      keepFl: false,
    });
    enforcePupilHealthFloors(surfaces, {
      targetEfl: Number(targets?.targetEfl || 50),
      targetT: Number(targets?.targetT || 0),
      targetIC: Number(targets?.targetIC || 0),
      stage: 1,
      keepFl: false,
    });
    recenterScratchStopSurface(surfaces);
    setImsApertureForSensor(surfaces, Number(sensor?.h || 24));
    ensureStopInAirBothSides(surfaces);
    enforceRearMountStart(surfaces);
    quickSanity(surfaces);
    return sanitizeLens(work);
  }

  function scratchGrowReasonElementCost(reason) {
    const r = String(reason || "").toLowerCase();
    if (r === "achromat_corrector") return 2;
    return 1;
  }

  function pickScratchGrowReason(priority, targets, cycleIdx = 0) {
    const p = priority || {};
    const icNeed = Math.max(0, Number(p.icNeedMm || 0));
    const distRms = Number.isFinite(p.distRmsScore) ? Number(p.distRmsScore) : 999;
    const distMax = Number.isFinite(p.distMaxScore) ? Number(p.distMaxScore) : 999;
    const sharp = Number.isFinite(p.sharpness) ? Number(p.sharpness) : 999;
    const targetIC = Math.max(0, Number(targets?.targetIC || 0));
    const intrusion = Math.max(0, Number(p.intrusionMm || 0));
    const overlap = Math.max(0, Number(p.overlapMm || 0));
    const bflShort = Math.max(0, Number(p.bflShortMm || 0));

    // If physical feasibility is bad, avoid rear-heavy growth that tends to worsen intrusion.
    if (!p.feasible && (intrusion > 0.15 || overlap > 0.01)) {
      return (cycleIdx % 2 === 0) ? "distortion_corrector" : "achromat_corrector";
    }
    if (bflShort > 0.8) return "rear_expander";

    if (targetIC > 0 && icNeed > Math.max(0.55, targetIC * 0.02)) return "rear_expander";
    if (distRms > 0.90 || distMax > 1.80) return "distortion_corrector";
    if (sharp > 1.15 || distRms > 0.60) return (cycleIdx % 2 === 0) ? "achromat_corrector" : "field_flattener";
    return "field_flattener";
  }

  function growLensByOneBlock(lensObj, reason, ctx = {}) {
    const why = String(reason || "").toLowerCase();
    const work = sanitizeLens(clone(lensObj));
    const surfaces = work.surfaces;
    const imsIdx = surfaces.findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
    if (imsIdx < 0) return null;
    const stopIdx = findStopSurfaceIndex(surfaces);
    const targets = ctx?.targets || {};
    const sensor = ctx?.sensor || getSensorWH();
    const targetEfl = clamp(Math.abs(Number(targets.targetEfl || 50)), 14, 260);
    const targetT = Math.max(0.7, Number(targets.targetT || 2.0));
    const targetIC = Math.max(0, Number(targets.targetIC || 0));
    const distEdge = Number(ctx?.priority?.distEdgePct || 0);

    const m = (rel, lo, hi) => scratchMmFromF(targetEfl, rel, lo, hi);
    const r = (rel, lo, hi, sign) => scratchRadiusFromF(targetEfl, rel, lo, hi, sign);
    const stopAp = stopIdx >= 0
      ? Math.max(PHYS_CFG.minAperture, Number(surfaces[stopIdx]?.ap || 0))
      : clamp(targetEfl / (2 * targetT), PHYS_CFG.minAperture, 26);
    const halfDiag = 0.5 * Math.hypot(Number(sensor?.w || 36), Number(sensor?.h || 24));
    const baseAp = clamp(Math.max(stopAp * 1.12, halfDiag * 0.85, targetIC > 0 ? targetIC * 0.30 : 0, 6.0), 6.0, 33.0);

    const clampInsert = (at) => Math.max(1, Math.min(Math.max(1, imsIdx), at | 0));
    const insertBlock = (at, block) => {
      const idx = clampInsert(at);
      surfaces.splice(idx, 0, ...block);
      return idx;
    };

    if (why === "rear_expander") {
      const at = clampInsert(Math.max(stopIdx + 1, imsIdx - 1));
      insertBlock(at, scratchMakeElementPair({
        R1: r(1.04, 18, 380, +1),
        R2: r(1.46, 20, 460, -1),
        tGlass: m(0.08, 1.8, 11),
        tAir: m(0.14, 2.2, 18),
        ap: clamp(baseAp * 1.18, 8, 35),
        glass: "N-LAK9",
      }));
    } else if (why === "distortion_corrector") {
      let at = stopIdx >= 0 ? (stopIdx + 1) : (imsIdx - 1);
      if (at >= imsIdx) at = Math.max(1, imsIdx - 1);
      const sign = distEdge >= 0 ? -1 : +1;
      insertBlock(at, scratchMakeElementPair({
        R1: r(2.80, 30, 640, sign),
        R2: r(1.90, 22, 520, sign),
        tGlass: m(0.05, 0.9, 5.8),
        tAir: m(0.06, 1.0, 6.5),
        ap: clamp(baseAp * 1.08, 6, 30),
        glass: "N-BK7HT",
      }));
    } else if (why === "achromat_corrector") {
      const at = stopIdx >= 0 ? Math.min(imsIdx, stopIdx + 1) : Math.max(1, imsIdx - 1);
      const pairA = scratchMakeElementPair({
        R1: r(1.25, 18, 420, +1),
        R2: r(1.54, 18, 420, -1),
        tGlass: m(0.05, 1.0, 6.4),
        tAir: m(0.03, 0.35, 1.8),
        ap: clamp(baseAp * 1.04, 6, 30),
        glass: "N-BK7HT",
      });
      const pairB = scratchMakeElementPair({
        R1: r(1.10, 16, 360, -1),
        R2: r(1.80, 20, 460, +1),
        tGlass: m(0.05, 1.0, 6.0),
        tAir: m(0.10, 1.0, 9.5),
        ap: clamp(baseAp * 1.04, 6, 30),
        glass: "N-SF5",
      });
      insertBlock(at, [...pairA, ...pairB]);
    } else {
      // field_flattener default
      const at = clampInsert(imsIdx);
      insertBlock(at, scratchMakeElementPair({
        R1: r(2.90, 28, 660, +1),
        R2: r(4.50, 46, 900, -1),
        tGlass: m(0.04, 0.7, 4.6),
        tAir: m(0.06, 0.8, 5.8),
        ap: clamp(Math.max(baseAp * 0.98, halfDiag * 0.95), 5.5, 28),
        glass: "N-BK7HT",
      }));
    }

    recenterScratchStopSurface(surfaces);
    enforceSingleStopSurface(surfaces);
    ensureStopInAirBothSides(surfaces);
    setImsApertureForSensor(surfaces, Number(sensor?.h || 24));
    enforceRearMountStart(surfaces);
    quickSanity(surfaces);
    return sanitizeLens(work);
  }

  function scratchPassesForAggressiveness(aggr, targets, growthCycle = false, effort = 1.0) {
    const profile = SCRATCH_CFG.stageIters[normalizeScratchAggressiveness(aggr)] || SCRATCH_CFG.stageIters.normal;
    const hasIC = Number(targets?.targetIC || 0) > 0;
    const effortScale = clampScratchEffort(effort);
    const scale = (growthCycle ? 0.78 : 1.0) * effortScale;
    const passes = [
      { id: "A", label: "FL acquire", targetT: 0, targetIC: 0, iters: Math.max(300, Math.round(profile.A * scale)) },
      { id: "B", label: "T tune", targetT: Number(targets?.targetT || 0), targetIC: 0, iters: Math.max(300, Math.round(profile.B * scale)) },
    ];
    if (hasIC) {
      passes.push({
        id: "C",
        label: "IC growth",
        targetT: Number(targets?.targetT || 0),
        targetIC: Number(targets?.targetIC || 0),
        iters: Math.max(600, Math.round(profile.C * scale)),
      });
    }
    passes.push({
      id: "D",
      label: "Polish",
      targetT: Number(targets?.targetT || 0),
      targetIC: Number(targets?.targetIC || 0),
      iters: Math.max(700, Math.round(profile.D * scale)),
    });
    return passes;
  }

  function scratchOptModeForPass(aggr, passId) {
    const a = normalizeScratchAggressiveness(aggr);
    if (a === "wild") return "wild";
    if (a === "normal" && (passId === "C" || passId === "D")) return "wild";
    return "safe";
  }

  function applyOptimizerBestUnsafe(targets = null) {
    if (!optBest?.lens) return false;
    if (targets && typeof targets === "object") {
      const pri = buildOptPriority(optBest.eval, {
        targetEfl: Number(targets.targetEfl || 50),
        targetIC: Math.max(0, Number(targets.targetIC || 0)),
        targetT: Number(targets.targetT || 0),
      });
      if (!pri.feasible) return false;
    }
    loadLens(optBest.lens);
    if (ui.focusMode) ui.focusMode.value = "lens";
    if (ui.sensorOffset) ui.sensorOffset.value = "0";
    if (ui.lensFocus) ui.lensFocus.value = Number(optBest?.eval?.lensShift || 0).toFixed(2);
    renderAll();
    return true;
  }

  function evaluateCurrentLensPriorityForTargets(targets) {
    const sensor = getSensorWH();
    const fieldAngle = num(ui.fieldAngle?.value, 0);
    const rayCount = Math.max(9, Math.min(61, (num(ui.rayCount?.value, 31) | 0)));
    const wavePreset = ui.wavePreset?.value || "d";
    const evalRes = evalLensMerit(lens, {
      targetEfl: Number(targets?.targetEfl || 50),
      targetT: Number(targets?.targetT || 0),
      targetIC: Math.max(0, Number(targets?.targetIC || 0)),
      fieldAngle,
      rayCount,
      wavePreset,
      sensorW: sensor.w,
      sensorH: sensor.h,
      evalTier: "accurate",
      icOptions: Number(targets?.targetIC || 0) > 0 ? { mode: "lut", cfg: OPT_IC_CFG } : { mode: "skip" },
    });
    const pri = buildOptPriority(evalRes, {
      targetEfl: Number(targets?.targetEfl || 50),
      targetIC: Math.max(0, Number(targets?.targetIC || 0)),
      targetT: Number(targets?.targetT || 0),
    });
    return { evalRes, pri };
  }

  function scratchProgressMetric(priority, targets) {
    const p = priority;
    if (!p) return Infinity;
    if (!p.feasible) {
      return 1e9 + p.feasibilityDebt * 120 + p.eflErrRel * 1e5;
    }
    const hasT = Number(targets?.targetT || 0) > 0;
    const hasIC = Number(targets?.targetIC || 0) > 0;
    return (
      p.eflErrRel * 120000 +
      (hasT ? p.tErrAbs * 900 : 0) +
      (hasIC ? p.icNeedMm * 460 : 0) +
      p.distRmsScore * 220 +
      p.distMaxScore * 100 +
      p.sharpness * 120
    );
  }

  function scratchTargetsReached(priority, targets) {
    if (!priority?.feasible) return false;
    if (Number(priority.bflShortMm || 0) > 0.8) return false;
    if (!(Number(priority.eflErrRel) <= (OPT_STAGE_CFG.flStageRel + 1e-4))) return false;
    if (Number(targets?.targetT || 0) > 0) {
      if (!(Number(priority.tErrAbs) <= Math.max(0.20, OPT_STAGE_CFG.tGoodAbs))) return false;
    }
    if (Number(targets?.targetIC || 0) > 0) {
      if (!(Number(priority.icNeedMm) <= 1e-4)) return false;
    }
    const strictDistRms = Number(SCRATCH_CFG.strictDistRmsPct || 1.0);
    const strictDistMax = Number(SCRATCH_CFG.strictDistMaxPct || 2.0);
    if (!(Number.isFinite(priority.distRmsScore) && priority.distRmsScore <= strictDistRms)) return false;
    if (!(Number.isFinite(priority.distMaxScore) && priority.distMaxScore <= strictDistMax)) return false;
    return true;
  }

  function scratchAcceptableReached(priority, targets) {
    if (!priority?.feasible) return false;
    if (Number(priority.bflShortMm || 0) > 1.0) return false;
    if (!(Number(priority.eflErrRel) <= Number(SCRATCH_CFG.acceptableFlRel || 0.02))) return false;
    if (Number(targets?.targetT || 0) > 0) {
      if (!(Number(priority.tErrAbs) <= Number(SCRATCH_CFG.acceptableTAbs || 0.35))) return false;
    }
    if (Number(targets?.targetIC || 0) > 0) {
      if (!(Number(priority.icNeedMm) <= 1e-4)) return false;
    }
    const okDistRms = Number(SCRATCH_CFG.acceptableDistRmsPct || 2.2);
    const okDistMax = Number(SCRATCH_CFG.acceptableDistMaxPct || 4.2);
    if (!(Number.isFinite(priority.distRmsScore) && priority.distRmsScore <= okDistRms)) return false;
    if (!(Number.isFinite(priority.distMaxScore) && priority.distMaxScore <= okDistMax)) return false;
    return true;
  }

  async function runScratchOptimizerPass(pass, targets, aggr, meta = {}) {
    if (scratchStopRequested) return evaluateCurrentLensPriorityForTargets(targets);
    if (!pass) return evaluateCurrentLensPriorityForTargets(targets);
    if (ui.optTargetFL) ui.optTargetFL.value = Number(targets.targetEfl).toFixed(2);
    if (ui.optTargetT) ui.optTargetT.value = Number(pass.targetT || 0).toFixed(2);
    if (ui.optTargetIC) ui.optTargetIC.value = Math.max(0, Number(pass.targetIC || 0)).toFixed(2);
    if (ui.optIters) ui.optIters.value = String(Math.max(60, Number(pass.iters || 600) | 0));
    if (ui.optPop) ui.optPop.value = scratchOptModeForPass(aggr, pass.id);

    const tag = meta?.tag ? `${meta.tag} • ` : "";
    const runIndex = Number(meta?.runIndex || 0);
    const runTotal = Number(meta?.runTotal || 0);
    const runStepTxt = (Number.isFinite(runIndex) && runIndex > 0 && Number.isFinite(runTotal) && runTotal > 0)
      ? `Step ${Math.round(runIndex)}/${Math.round(runTotal)} • `
      : "";
    const phaseLabel = String(meta?.phaseLabel || "").trim();
    setOptLog(
      `Build From Scratch\n` +
      `${runStepTxt}${tag}stage ${pass.id}: ${pass.label}\n` +
      `targets FL ${Number(targets.targetEfl).toFixed(2)} • T ${Number(pass.targetT || 0).toFixed(2)} • IC ${Math.max(0, Number(pass.targetIC || 0)).toFixed(2)}\n` +
      `optimizer ${ui.optPop?.value || "safe"} • ${ui.optIters?.value || pass.iters} iters`
    );
    const prevRunCtx = optRunContext;
    setOptRunContext({
      mode: "Build From Scratch",
      stepIndex: runIndex,
      stepTotal: runTotal,
      label: phaseLabel || `${tag}stage ${pass.id}: ${pass.label}`,
    });
    try {
      await runOptimizer();
    } finally {
      setOptRunContext(prevRunCtx);
    }
    if (scratchStopRequested) return evaluateCurrentLensPriorityForTargets(targets);
    let loaded = applyOptimizerBestUnsafe({
      targetEfl: Number(targets.targetEfl || 50),
      targetT: Number(pass.targetT || 0),
      targetIC: Math.max(0, Number(pass.targetIC || 0)),
    });
    if (!loaded) loaded = applyOptimizerBestUnsafe(null);
    if (loaded && Array.isArray(lens?.surfaces)) {
      const sensorNow = getSensorWH();
      const shiftNow = Number(ui.lensFocus?.value ?? optBest?.eval?.lensShift ?? 0);
      bakeLensShiftIntoRearGap(lens.surfaces, shiftNow);
      enforceRearMountStart(lens.surfaces);
      ensureStopInAirBothSides(lens.surfaces);
      setImsApertureForSensor(lens.surfaces, Number(sensorNow?.h || 24));
      quickSanity(lens.surfaces);
      if (ui.focusMode) ui.focusMode.value = "lens";
      if (ui.sensorOffset) ui.sensorOffset.value = "0";
      if (ui.lensFocus) ui.lensFocus.value = "0.00";
      buildTable();
      applySensorToIMS();
      autoFocus();
    }
    return evaluateCurrentLensPriorityForTargets(targets);
  }

  async function buildFromScratchPipeline({
    targetEfl,
    targetT,
    targetIC = 0,
    family = "auto",
    maxElements = 8,
    aggressiveness = "normal",
    effort = 1.0,
    stopWhenAcceptable = true,
  } = {}) {
    if (scratchBuildRunning) return;
    if (optRunning) {
      toast("Stop optimizer first before Build From Scratch.");
      return;
    }

    scratchBuildRunning = true;
    scratchStopRequested = false;
    if (ui.btnBuildScratch) ui.btnBuildScratch.disabled = true;
    const prevOptIters = ui.optIters?.value;
    const prevOptPop = ui.optPop?.value;
    const preBuildLens = sanitizeLens(clone(lens));
    const preBuildFocusMode = String(ui.focusMode?.value || "lens");
    const preBuildSensorOffset = Number(ui.sensorOffset?.value || 0);
    const preBuildLensFocus = Number(ui.lensFocus?.value || 0);

    try {
      const sensor = getSensorWH();
      const wavePreset = ui.wavePreset?.value || "d";
      const tRaw = Number(targetT ?? num(ui.optTargetT?.value, 2.0));
      const targets = {
        targetEfl: clamp(Math.abs(Number(targetEfl || num(ui.optTargetFL?.value, 50))), 12, 320),
        targetT: (Number.isFinite(tRaw) && tRaw > 0.25) ? tRaw : 2.0,
        targetIC: Math.max(0, Number(targetIC ?? num(ui.optTargetIC?.value, 0))),
      };
      const aggr = normalizeScratchAggressiveness(aggressiveness);
      const effortScale = clampScratchEffort(effort);
      const stopOnAccept = stopWhenAcceptable !== false;
      const familyResolved = resolveScratchFamily(family, targets.targetEfl);
      const maxElems = clampScratchMaxElements(maxElements);

      if (ui.optTargetFL) ui.optTargetFL.value = targets.targetEfl.toFixed(2);
      if (ui.optTargetT) ui.optTargetT.value = targets.targetT.toFixed(2);
      if (ui.optTargetIC) ui.optTargetIC.value = targets.targetIC.toFixed(2);

      const baseLens = generateBaseLens(
        familyResolved,
        targets,
        { w: sensor.w, h: sensor.h },
        { aggressiveness: aggr }
      );
      const prepared = prepareScratchLensForTargets(
        baseLens,
        targets,
        { w: sensor.w, h: sensor.h },
        { wavePreset }
      );
      loadLens(prepared);
      if (ui.focusMode) ui.focusMode.value = "lens";
      if (ui.sensorOffset) ui.sensorOffset.value = "0";
      autoFocus();

      const firstPasses = scratchPassesForAggressiveness(aggr, targets, false, effortScale);
      const maxGrowCyclesBase = Number(SCRATCH_CFG.maxGrowCycles[aggr] || 4);
      const maxGrowCycles = Math.max(1, Math.round(maxGrowCyclesBase * effortScale));
      const growPassTemplate = scratchPassesForAggressiveness(aggr, targets, true, effortScale);
      const runTotalEstimate = firstPasses.length + (maxGrowCycles * growPassTemplate.length) + 1;
      let runStep = 0;

      const startElements = countLensElements(lens.surfaces);
      setOptLog(
        `Build From Scratch\n` +
        `family ${scratchFamilyLabel(familyResolved)} • aggr ${aggr} • effort x${effortScale.toFixed(2)} • stopOnAccept ${stopOnAccept ? "ON" : "OFF"}\n` +
        `targets FL ${targets.targetEfl.toFixed(2)} • T ${targets.targetT.toFixed(2)} • IC ${targets.targetIC.toFixed(2)}\n` +
        `elements ${startElements}/${maxElems}\n` +
        `planned optimizer runs <= ${runTotalEstimate}`
      );

      let snap = null;
      let bestFeasibleSnapshot = null;
      let earlyStopReason = "";
      let abortedByUser = false;
      const markStoppedByUser = () => {
        abortedByUser = true;
        if (!earlyStopReason) earlyStopReason = "stopped by user";
      };
      const storeBestFeasible = (label, resObj) => {
        const pri = resObj?.pri;
        if (!pri?.feasible) return;
        const metric = scratchProgressMetric(pri, targets);
        if (!bestFeasibleSnapshot || metric < bestFeasibleSnapshot.metric) {
          bestFeasibleSnapshot = {
            metric,
            label: String(label || "snapshot"),
            lens: sanitizeLens(clone(lens)),
            pri,
            eval: resObj.evalRes,
          };
        }
      };
      const startSnap = evaluateCurrentLensPriorityForTargets(targets);
      storeBestFeasible("prepared", startSnap);
      for (let i = 0; i < firstPasses.length; i++) {
        if (scratchStopRequested) {
          markStoppedByUser();
          break;
        }
        runStep++;
        snap = await runScratchOptimizerPass(firstPasses[i], targets, aggr, {
          tag: `pass ${i + 1}/${firstPasses.length}`,
          phaseLabel: `initial stage ${firstPasses[i]?.id || (i + 1)} (${firstPasses[i]?.label || "run"})`,
          runIndex: runStep,
          runTotal: runTotalEstimate,
        });
        if (scratchStopRequested) {
          markStoppedByUser();
          break;
        }
        storeBestFeasible(`pass_${firstPasses[i]?.id || i}`, snap);
        if (stopOnAccept && scratchAcceptableReached(snap?.pri, targets)) {
          earlyStopReason = `accepted in initial pass ${firstPasses[i]?.id || (i + 1)}`;
          break;
        }
      }

      let bestPri = snap?.pri || evaluateCurrentLensPriorityForTargets(targets).pri;
      let bestMetric = scratchProgressMetric(bestPri, targets);
      let plateauRun = 0;
      if (scratchStopRequested && !earlyStopReason) markStoppedByUser();

      for (let cycle = 0; cycle < maxGrowCycles && !earlyStopReason; cycle++) {
        if (scratchStopRequested) {
          markStoppedByUser();
          break;
        }
        const cur = evaluateCurrentLensPriorityForTargets(targets);
        if (scratchTargetsReached(cur.pri, targets)) break;
        if (stopOnAccept && scratchAcceptableReached(cur.pri, targets)) {
          earlyStopReason = `accepted before grow cycle ${cycle + 1}`;
          break;
        }

        const curElements = countLensElements(lens.surfaces);
        if (curElements >= maxElems) break;

        let reason = pickScratchGrowReason(cur.pri, targets, cycle);
        let cost = scratchGrowReasonElementCost(reason);
        if (curElements + cost > maxElems) {
          const fallback = (curElements + 1 <= maxElems)
            ? (cur.pri.icNeedMm > 0.5 ? "rear_expander" : "field_flattener")
            : null;
          if (!fallback) break;
          reason = fallback;
          cost = 1;
        }

        const grown = growLensByOneBlock(lens, reason, {
          targets,
          sensor: { w: sensor.w, h: sensor.h },
          family: familyResolved,
          priority: cur.pri,
          aggressiveness: aggr,
        });
        if (!grown) break;
        const preparedGrow = prepareScratchLensForTargets(
          grown,
          targets,
          { w: sensor.w, h: sensor.h },
          { wavePreset }
        );
        loadLens(preparedGrow);
        if (ui.focusMode) ui.focusMode.value = "lens";
        if (ui.sensorOffset) ui.sensorOffset.value = "0";
        autoFocus();

        const growPasses = scratchPassesForAggressiveness(aggr, targets, true, effortScale);
        setOptLog(
          `Build From Scratch\n` +
          `grow ${cycle + 1}/${maxGrowCycles}: ${reason} (+${cost} elem)\n` +
          `elements ${countLensElements(lens.surfaces)}/${maxElems}\n` +
          `running staged optimize...`
        );
        for (let i = 0; i < growPasses.length; i++) {
          if (scratchStopRequested) {
            markStoppedByUser();
            break;
          }
          runStep++;
          snap = await runScratchOptimizerPass(growPasses[i], targets, aggr, {
            tag: `grow ${cycle + 1} • pass ${i + 1}/${growPasses.length}`,
            phaseLabel: `grow ${cycle + 1}/${maxGrowCycles} • ${reason} • stage ${growPasses[i]?.id || (i + 1)} (${growPasses[i]?.label || "run"})`,
            runIndex: runStep,
            runTotal: runTotalEstimate,
          });
          if (scratchStopRequested) {
            markStoppedByUser();
            break;
          }
          storeBestFeasible(`grow_${cycle + 1}_${growPasses[i]?.id || i}`, snap);
          if (stopOnAccept && scratchAcceptableReached(snap?.pri, targets)) {
            earlyStopReason = `accepted in grow ${cycle + 1} pass ${growPasses[i]?.id || (i + 1)}`;
            break;
          }
        }
        if (earlyStopReason) break;

        const after = evaluateCurrentLensPriorityForTargets(targets);
        storeBestFeasible(`grow_${cycle + 1}`, after);
        const metric = scratchProgressMetric(after.pri, targets);
        const relImprove = (bestMetric - metric) / Math.max(1e-6, Math.abs(bestMetric));
        if (metric < bestMetric) {
          bestMetric = metric;
          bestPri = after.pri;
        }
        if (relImprove <= Number(SCRATCH_CFG.plateauImproveFrac || 0.01)) plateauRun++;
        else plateauRun = 0;

        if (plateauRun >= 2 && aggr !== "wild") break;
      }

      if (scratchStopRequested && !earlyStopReason) markStoppedByUser();
      const preFinal = evaluateCurrentLensPriorityForTargets(targets);
      const shouldSkipFinalPolish = abortedByUser || (stopOnAccept && scratchAcceptableReached(preFinal.pri, targets));
      if (shouldSkipFinalPolish) {
        if (!earlyStopReason && !abortedByUser) earlyStopReason = "accepted before final polish";
      } else {
        const distNow = Math.max(0, Number(preFinal?.pri?.distRmsScore || 0));
        const distOver = Math.max(0, distNow - Number(SCRATCH_CFG.acceptableDistRmsPct || 2.2));
        const distScale = clamp(1 + distOver * 0.35, 1.0, 2.4);
        const finalPolishIters = Math.max(
          800,
          Math.round(Number((SCRATCH_CFG.stageIters[aggr] || SCRATCH_CFG.stageIters.normal).D) * 0.75 * effortScale * distScale)
        );
        runStep++;
        await runScratchOptimizerPass(
          {
            id: "D",
            label: "Final polish",
            targetT: targets.targetT,
            targetIC: targets.targetIC,
            iters: finalPolishIters,
          },
          targets,
          aggr,
          {
            tag: "final",
            phaseLabel: "final polish",
            runIndex: runStep,
            runTotal: runTotalEstimate,
          }
        );
      }

      const final = evaluateCurrentLensPriorityForTargets(targets);
      let finalSnap = final;
      if (!finalSnap.pri?.feasible && bestFeasibleSnapshot?.lens) {
        loadLens(bestFeasibleSnapshot.lens);
        if (ui.focusMode) ui.focusMode.value = "lens";
        if (ui.sensorOffset) ui.sensorOffset.value = "0";
        if (ui.lensFocus && Number.isFinite(bestFeasibleSnapshot?.eval?.lensShift)) {
          ui.lensFocus.value = Number(bestFeasibleSnapshot.eval.lensShift).toFixed(2);
        }
        renderAll();
        finalSnap = evaluateCurrentLensPriorityForTargets(targets);
      }
      if (!finalSnap.pri?.feasible && !bestFeasibleSnapshot?.lens && preBuildLens?.surfaces?.length) {
        loadLens(preBuildLens);
        if (ui.focusMode) ui.focusMode.value = preBuildFocusMode;
        if (ui.sensorOffset) ui.sensorOffset.value = Number.isFinite(preBuildSensorOffset) ? String(preBuildSensorOffset) : "0";
        if (ui.lensFocus) ui.lensFocus.value = Number.isFinite(preBuildLensFocus) ? preBuildLensFocus.toFixed(2) : "0.00";
        renderAll();
        finalSnap = evaluateCurrentLensPriorityForTargets(targets);
        if (!earlyStopReason) earlyStopReason = "no feasible scratch result; restored previous lens";
      }
      const p = finalSnap.pri;
      const doneStrict = scratchTargetsReached(p, targets);
      const acceptable = scratchAcceptableReached(p, targets);
      const done = !abortedByUser && (doneStrict || (stopOnAccept && acceptable));
      const finalElems = countLensElements(lens.surfaces);
      const headline = abortedByUser
        ? "STOPPED ⏹"
        : (!p.feasible ? "FAILED ❌" : (done ? "DONE ✅" : "DONE (best effort)"));
      setOptLog(
        `Build From Scratch ${headline}\n` +
        `family ${scratchFamilyLabel(familyResolved)} • aggr ${aggr} • effort x${effortScale.toFixed(2)}\n` +
        `${earlyStopReason ? `stop ${earlyStopReason}\n` : ""}` +
        `${bestFeasibleSnapshot ? `fallback ${bestFeasibleSnapshot.label}\n` : ""}` +
        `optimizer runs ${runStep}/${runTotalEstimate}\n` +
        `elements ${finalElems}/${maxElems}\n` +
        `FL err ${(Number(p.eflErrRel || 0) * 100).toFixed(2)}%\n` +
        `T slow ${Number.isFinite(p.tErrAbs) ? p.tErrAbs.toFixed(2) : "—"}\n` +
        `IC short ${Number.isFinite(p.icNeedMm) ? p.icNeedMm.toFixed(2) : "—"}mm\n` +
        `acceptable ${acceptable ? "YES" : "NO"} • strict ${doneStrict ? "YES" : "NO"}\n` +
        `Dist RMS ${Number.isFinite(p.distRmsPct) ? Math.abs(p.distRmsPct).toFixed(2) : "—"}% • MAX ${Number.isFinite(p.distMaxPct) ? Math.abs(p.distMaxPct).toFixed(2) : "—"}%\n` +
        `${fmtPhysOpt(finalSnap.evalRes, targets)}\n` +
        `stage ${p.stageName}`
      );

      toast(
        `Build from scratch ${abortedByUser ? "stopped" : (!p.feasible ? "failed" : (done ? "done" : "ready (best effort)"))} • ${scratchFamilyLabel(familyResolved)} • FL ${Number.isFinite(p.efl) ? p.efl.toFixed(1) : "—"}mm`
      );
      scheduleAutosave();
    } catch (err) {
      console.error(err);
      setOptLog(
        `Build From Scratch failed\n${String(err?.message || err)}`
      );
      toast("Build From Scratch failed. Check console/log.");
    } finally {
      if (ui.optIters && prevOptIters != null) ui.optIters.value = String(prevOptIters);
      if (ui.optPop && prevOptPop != null) ui.optPop.value = String(prevOptPop);
      scratchStopRequested = false;
      scratchBuildRunning = false;
      if (ui.btnBuildScratch) ui.btnBuildScratch.disabled = false;
      scheduleRenderAll();
    }
  }

  function openBuildScratchModal() {
    if (!ui.newLensModal) return;
    if (scratchBuildRunning || optRunning) {
      toast("Wait for current build/optimizer run to finish.");
      return;
    }

    const curSensor = getSensorWH();
    const curFamily = resolveScratchFamily("auto", num(ui.optTargetFL?.value, 50));
    ui.newLensModal.innerHTML = `
      <div class="modalCard" role="dialog" aria-modal="true" aria-label="Build From Scratch">
        <div class="modalTop">
          <div>
            <div class="modalTitle">Build From Scratch</div>
            <div class="modalSub">Generate topology + staged optimize + auto-grow blocks until targets or max elements.</div>
          </div>
          <button class="modalX" id="bfClose" type="button">✕</button>
        </div>
        <div class="modalScroll">
          <div class="modalGrid">
            <div class="field">
              <label>Target FL (mm)</label>
              <input id="bfTargetFL" type="number" step="0.1" value="${num(ui.optTargetFL?.value, 50).toFixed(2)}" />
            </div>
            <div class="field">
              <label>Target T</label>
              <input id="bfTargetT" type="number" step="0.05" value="${num(ui.optTargetT?.value, 2.0).toFixed(2)}" />
            </div>
            <div class="field">
              <label>Target IC (mm)</label>
              <input id="bfTargetIC" type="number" step="0.1" min="0" value="${Math.max(0, num(ui.optTargetIC?.value, 0)).toFixed(2)}" />
            </div>
            <div class="field">
              <label>Family</label>
              <select id="bfFamily">
                <option value="auto" selected>Auto (${scratchFamilyLabel(curFamily)} now)</option>
                <option value="double_gauss">Double-Gauss</option>
                <option value="retrofocus_wide">Retrofocus Wide</option>
                <option value="telephoto">Telephoto</option>
              </select>
            </div>
            <div class="field">
              <label>Max elements</label>
              <input id="bfMaxElements" type="number" step="1" min="3" max="14" value="8" />
            </div>
            <div class="field">
              <label>Aggressiveness</label>
              <select id="bfAggro">
                <option value="safe">safe</option>
                <option value="normal" selected>normal</option>
                <option value="wild">wild</option>
              </select>
            </div>
            <div class="field">
              <label>Build effort (x)</label>
              <input id="bfEffort" type="number" step="0.1" min="${Number(SCRATCH_CFG.effortMin || 0.6).toFixed(1)}" max="${Number(SCRATCH_CFG.effortMax || 4.0).toFixed(1)}" value="${Number(SCRATCH_CFG.effortDefault || 1.0).toFixed(1)}" />
            </div>
            <div class="field">
              <label>Stop when acceptable</label>
              <select id="bfStopAccept">
                <option value="1" selected>Yes (recommended)</option>
                <option value="0">No (always polish)</option>
              </select>
            </div>
            <div class="fieldFull">
              <div class="hint">
                Sensor currently: ${curSensor.w.toFixed(2)}×${curSensor.h.toFixed(2)}mm.
                Build uses existing mount/physics constraints (PL intrusion/throat, stop in AIR, min CT/gaps).
                Effort > 1.0 gives longer runs and more grow cycles.
              </div>
            </div>
          </div>
        </div>
        <div class="modalBottom">
          <button class="btn" id="bfCancel" type="button">Cancel</button>
          <button class="btn btnPrimary" id="bfRun" type="button">Build</button>
        </div>
      </div>
    `;

    ui.newLensModal.classList.remove("hidden");
    ui.newLensModal.setAttribute("aria-hidden", "false");

    const close = () => {
      ui.newLensModal.classList.add("hidden");
      ui.newLensModal.setAttribute("aria-hidden", "true");
      ui.newLensModal.innerHTML = "";
    };

    ui.newLensModal.querySelector("#bfClose")?.addEventListener("click", close);
    ui.newLensModal.querySelector("#bfCancel")?.addEventListener("click", close);
    ui.newLensModal.addEventListener("click", (e) => {
      if (e.target === ui.newLensModal) close();
    });

    ui.newLensModal.querySelector("#bfRun")?.addEventListener("click", () => {
      const payload = {
        targetEfl: num($("#bfTargetFL")?.value, num(ui.optTargetFL?.value, 50)),
        targetT: Math.max(0, num($("#bfTargetT")?.value, num(ui.optTargetT?.value, 2.0))),
        targetIC: Math.max(0, num($("#bfTargetIC")?.value, num(ui.optTargetIC?.value, 0))),
        family: normalizeScratchFamily($("#bfFamily")?.value || "auto"),
        maxElements: clampScratchMaxElements($("#bfMaxElements")?.value),
        aggressiveness: normalizeScratchAggressiveness($("#bfAggro")?.value || "normal"),
        effort: clampScratchEffort($("#bfEffort")?.value),
        stopWhenAcceptable: String($("#bfStopAccept")?.value || "1") !== "0",
      };
      close();
      buildFromScratchPipeline(payload);
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
  let scratchBuildRunning = false;
  let scratchStopRequested = false;
  let optimizerRunSerial = 0;
  let optRunContext = null;

  function setOptLog(lines){
    if (!ui.optLog) return;
    ui.optLog.value = String(lines || "");
  }

  function setOptRunContext(ctx) {
    if (!ctx || typeof ctx !== "object") {
      optRunContext = null;
      return;
    }
    const stepIndex = Number(ctx.stepIndex);
    const stepTotal = Number(ctx.stepTotal);
    optRunContext = {
      mode: String(ctx.mode || "").trim(),
      label: String(ctx.label || "").trim(),
      stepIndex: (Number.isFinite(stepIndex) && stepIndex > 0) ? Math.round(stepIndex) : null,
      stepTotal: (Number.isFinite(stepTotal) && stepTotal > 0) ? Math.round(stepTotal) : null,
    };
  }

  function formatOptimizerRunHeader(runNo) {
    const c = optRunContext;
    const base = `Run #${Math.max(1, Number(runNo) || 1)}`;
    if (!c) return base;
    const modeTxt = c.mode ? ` • ${c.mode}` : "";
    const stepTxt = (c.stepIndex && c.stepTotal) ? ` • Step ${c.stepIndex}/${c.stepTotal}` : "";
    const labelTxt = c.label ? ` • ${c.label}` : "";
    return `${base}${modeTxt}${stepTxt}${labelTxt}`;
  }

  function makeEvalPerfBucket() {
    return {
      evals: 0,
      totalMs: 0,
      afMs: 0,
      traceMs: 0,
      icMs: 0,
      physMs: 0,
    };
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

  function mutateLens(baseLens, mode, topo = null, opt = null){
    const L = clone(baseLens);
    L.name = baseLens.name;
    const stage = Number(opt?.stage ?? 0);
    const targetIC = Math.max(0, Number(opt?.targetIC || 0));
    const targetEfl = Math.max(1, Number(opt?.targetEfl || 0));
    const targetT = Math.max(0, Number(opt?.targetT || 0));
    const icNeedMm = Math.max(0, Number(opt?.icNeedMm || 0));
    const icStage = (stage === 2 && targetIC > 0);
    const fineTuneStage = stage >= 3;
    const keepFl = !!opt?.keepFl;

    const s = L.surfaces;

    // occasionally add/remove a surface.
    // During heavy IC shortfall, allow this even in safe mode to escape local minima.
    const allowStructureJump = (!topo && mode === "wild" && !fineTuneStage) || (icStage && icNeedMm > 8.0);
    const structureProb = (!topo && mode === "wild" && !fineTuneStage) ? 0.03 : (icStage ? 0.08 : 0.0);
    if (allowStructureJump && Math.random() < structureProb){
      const imsIdx = s.findIndex(x => String(x.type).toUpperCase()==="IMS");
      const canRemove = s.length > 6;

      if (canRemove && Math.random() < 0.35){
        // remove a random non-locked surface
        const idxs = s.map((x,i)=>({x,i})).filter(o=>!surfaceIsLocked(o.x));
        if (idxs.length){
          const ri = pick(idxs).i;
          s.splice(ri,1);
        }
      } else {
        // insert a random surface before IMS
        const at = Math.max(1, Math.min(imsIdx >= 0 ? imsIdx : s.length-1, 1 + ((Math.random()*Math.max(1,(s.length-2)))|0)));
        const baseAp = icStage ? clamp(targetIC * (0.22 + Math.random() * 0.20), 8, 30) : (4 + Math.random() * 20);
        const baseR = Math.max(16, (baseAp / AP_SAFETY) * (1.06 + Math.random() * 0.24));
        s.splice(at,0,{
          type:"",
          R: (Math.random()<0.5?1:-1) * baseR,
          t: 0.6 + Math.random() * 10,
          ap: baseAp,
          glass: (Math.random()<0.12 ? "AIR" : pick(GLASS_LIST)),
          stop:false
        });
      }
    }

    // main: perturb a few parameters
    let kChanges = mode === "wild" ? 6 : 3;
    if (icStage) kChanges += (mode === "wild" ? 6 : 5);
    if (icStage && keepFl) kChanges += 2;
    if (fineTuneStage) {
      kChanges = Math.max(2, Math.min(kChanges, mode === "wild" ? 3 : 2));
    }

    let radiusScale = icStage
      ? (keepFl ? (mode === "wild" ? 0.20 : 0.12) : (mode === "wild" ? 0.42 : 0.24))
      : (keepFl ? (mode === "wild" ? 0.12 : 0.06) : (mode === "wild" ? 0.35 : 0.18));
    let thickScale  = icStage
      ? (keepFl ? (mode === "wild" ? 0.24 : 0.16) : (mode === "wild" ? 0.62 : 0.30))
      : (keepFl ? (mode === "wild" ? 0.18 : 0.08) : (mode === "wild" ? 0.55 : 0.25));
    if (fineTuneStage) {
      radiusScale *= 0.42;
      thickScale *= 0.40;
    }

    const rThresh = fineTuneStage ? 0.36 : (!icStage ? 0.45 : (keepFl ? 0.28 : 0.35));
    let tThresh = fineTuneStage ? 0.62 : (!icStage ? 0.70 : (keepFl ? 0.48 : 0.58));
    let aThresh = fineTuneStage ? 0.92 : (!icStage ? 0.88 : 0.98);
    if (!fineTuneStage && stage >= 1) {
      // In T/IC phases, bias mutations away from random thickness-only tweaks and toward aperture growth.
      tThresh = Math.max(rThresh + 0.12, tThresh - 0.06);
      aThresh = Math.min(0.995, aThresh + 0.05);
    } else if (!fineTuneStage && stage === 0 && targetIC > 0) {
      // Even in FL acquire, keep enough aperture exploration alive to avoid tiny-glass local minima.
      aThresh = Math.min(0.95, aThresh + 0.03);
    }

    for (let c=0;c<kChanges;c++){
      const idxs = s.map((x,i)=>({x,i})).filter(o=>!surfaceIsLocked(o.x));
      if (!idxs.length) break;
      const o = pick(idxs);
      const ss = o.x;

      const choice = Math.random();
      if (choice < rThresh){
        // radius tweak
        const d = randn() * radiusScale;
        const R = Number(ss.R || 0);
        const absR = Math.max(PHYS_CFG.minRadius, Math.abs(R));
        const newAbs = absR * (1 + d);
        ss.R = (R >= 0 ? 1 : -1) * clamp(newAbs, PHYS_CFG.minRadius, 450);
      } else if (choice < tThresh){
        // thickness tweak
        const d = randn() * thickScale;
        ss.t = clamp(Number(ss.t||0) * (1 + d), PHYS_CFG.minThickness, 42);
      } else if (choice < aThresh){
        // aperture tweak
        if (icStage) {
          // In IC phase, strongly prefer larger clear apertures.
          const grow = 1 + Math.abs(randn()) * (mode === "wild" ? 0.30 : 0.20);
          ss.ap = clamp(Number(ss.ap || 0) * grow, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
        } else {
          const scale = mode === "wild" ? 0.45 : 0.20;
          const d = randn() * scale;
          ss.ap = clamp(Number(ss.ap||0) * (1 + d), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
        }
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

    if (icStage) {
      // Pull tiny apertures up toward a practical floor for the requested image circle.
      const apFloor = clamp(targetIC * 0.30, 6.0, 34.0);
      for (let i = 0; i < s.length; i++) {
        const ss = s[i];
        if (surfaceIsLocked(ss)) continue;
        const t = String(ss?.type || "").toUpperCase();
        if (t === "OBJ" || t === "IMS") continue;

        const ap = Number(ss.ap || 0);
        if (ap < apFloor) {
          const alpha = 0.35 + Math.random() * 0.45;
          ss.ap = clamp(ap + (apFloor - ap) * alpha, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
        } else if (Math.random() < 0.25) {
          ss.ap = clamp(ap * (1.02 + Math.random() * 0.10), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
        }

        // Keep radius aligned to aperture; otherwise quickSanity clamps aperture back down.
        const signR = Math.sign(Number(ss.R || 1)) || 1;
        const absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(ss.R || 0)));
        const needAbsR = (Number(ss.ap || 0) / AP_SAFETY) * 1.07;
        if (absR < needAbsR) {
          ss.R = signR * clamp(absR + (needAbsR - absR) * 0.72, PHYS_CFG.minRadius, 600);
        }
      }

      // Rear group usually drives hard cutoff; give it extra breathing room.
      const stopIdx = findStopSurfaceIndex(s);
      if (stopIdx >= 0) {
        for (let i = stopIdx + 1; i < s.length - 1; i++) {
          const ss = s[i];
          if (surfaceIsLocked(ss)) continue;
          if (Math.random() < 0.65) {
            const ap = Number(ss.ap || 0);
            ss.ap = clamp(ap * (1.05 + Math.random() * 0.13), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
            const signR = Math.sign(Number(ss.R || 1)) || 1;
            const absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(ss.R || 0)));
            const needAbsR = (Number(ss.ap || 0) / AP_SAFETY) * 1.06;
            if (absR < needAbsR) ss.R = signR * clamp(Math.max(absR, needAbsR), PHYS_CFG.minRadius, 600);
          }
        }
      }
    }

    if (icStage && Math.random() < 0.22) {
      // Rare macro step to escape local minima: grow clear apertures + matching radii globally.
      const macro = keepFl ? (1.06 + Math.random() * 0.08) : (1.10 + Math.random() * 0.14);
      for (let i = 0; i < s.length; i++) {
        const ss = s[i];
        if (surfaceIsLocked(ss)) continue;
        const t = String(ss?.type || "").toUpperCase();
        if (t === "OBJ" || t === "IMS") continue;
        ss.ap = clamp(Number(ss.ap || 0) * macro, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
        const signR = Math.sign(Number(ss.R || 1)) || 1;
        const absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(ss.R || 0)));
        const needAbsR = (Number(ss.ap || 0) / AP_SAFETY) * 1.08;
        ss.R = signR * clamp(Math.max(absR * (1.02 + Math.random() * 0.06), needAbsR), PHYS_CFG.minRadius, 600);
      }
    }

    // Keep stop/pupil health alive in every stage; stronger in IC stage.
    if (targetEfl > 1 && targetT > 0) {
      const stopStrength = icStage ? (keepFl ? 0.52 : 0.70) : (stage === 1 ? 0.62 : 0.40);
      nudgeStopTowardTargetT(s, targetEfl, targetT, stopStrength);
    }

    promoteElementDiameters(s, {
      targetEfl,
      targetT,
      targetIC,
      stage,
      strength: icStage ? 1.0 : 0.72,
      keepFl,
    });
    enforcePupilHealthFloors(s, {
      targetEfl,
      targetT,
      targetIC,
      stage,
      keepFl,
    });

    ensureStopExists(s);
    // enforce single stop
    const firstStop = s.findIndex(x => !!x.stop);
    if (firstStop >= 0) s.forEach((x,i)=>{ if (i!==firstStop) x.stop=false; });

    // keep OBJ/IMS types correct
    if (s.length) s[0].type = "OBJ";
    if (s.length) s[s.length-1].type = "IMS";

    if (topo) enforceTopology(s, topo);
    enforceRearMountStart(s);
    quickSanity(s);
    enforceRearMountStart(s);
    if (topo) enforceTopology(s, topo);
    return sanitizeLens(L);
  }

  function applyCoverageBoostMutation(
    surfaces,
    { targetIC = 0, targetEfl = 50, targetT = 0, icNeedMm = 0, keepFl = false } = {}
  ) {
    if (!Array.isArray(surfaces) || surfaces.length < 3) return;
    const stopIdx = findStopSurfaceIndex(surfaces);
    const need = Math.max(0, Number(icNeedMm || 0));
    const growth = clamp(
      1.14 + 0.08 * Math.random() + Math.min(0.34, need * 0.016),
      1.10,
      keepFl ? 1.42 : 1.58
    );

    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      if (surfaceIsLocked(s)) continue;
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;

      const rear = (stopIdx >= 0 && i > stopIdx && i < surfaces.length - 1);
      const localGrow = growth * (rear ? (1.07 + Math.random() * 0.12) : 1.0);
      let ap = Number(s.ap || 0) * localGrow;

      // Keep aperture growth physically reachable by growing radius together.
      const signR = Math.sign(Number(s.R || 1)) || 1;
      let absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(s.R || 0)));
      const needAbsR = (ap / AP_SAFETY) * 1.10;
      if (absR < needAbsR) {
        const alpha = keepFl ? 0.58 : 0.74;
        absR = absR + (needAbsR - absR) * alpha;
      }
      s.R = signR * clamp(absR, PHYS_CFG.minRadius, 600);

      s.ap = clamp(ap, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
      const tGrow = rear ? (1.04 + Math.random() * 0.12) : (1.02 + Math.random() * 0.08);
      s.t = clamp(Number(s.t || 0) * tGrow, PHYS_CFG.minThickness, 42);
    }

    // Drive stop toward target T, and ensure neighbors can support it.
    if (stopIdx >= 0) {
      const stop = surfaces[stopIdx];
      const stopNeed = (targetT > 0 && targetEfl > 1) ? (targetEfl / (2 * targetT)) : 0;
      const stopBoost = stopNeed > 0
        ? Math.max(stopNeed * 0.98, Number(stop.ap || 0) * (1.10 + Math.random() * 0.16))
        : Number(stop.ap || 0) * (1.08 + Math.random() * 0.14);
      stop.ap = clamp(stopBoost, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);

      const neighNeed = stop.ap / 1.06;
      for (let d = 1; d <= 3; d++) {
        const ids = [stopIdx - d, stopIdx + d];
        for (const id of ids) {
          if (id < 0 || id >= surfaces.length) continue;
          const s = surfaces[id];
          if (surfaceIsLocked(s)) continue;
          const t = String(s?.type || "").toUpperCase();
          if (t === "OBJ" || t === "IMS") continue;

          s.ap = clamp(Math.max(Number(s.ap || 0), neighNeed * (1 - d * 0.06)), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
          const signR = Math.sign(Number(s.R || 1)) || 1;
          const absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(s.R || 0)));
          const needAbsR = (Number(s.ap || 0) / AP_SAFETY) * 1.08;
          s.R = signR * clamp(Math.max(absR, needAbsR), PHYS_CFG.minRadius, 600);
        }
      }
    }

    // Coverage floor by target IC (kept moderate to avoid instant hard-fails).
    if (targetIC > 0) {
      const floorBase = clamp(targetIC * (keepFl ? 0.44 : 0.50), 10.0, 34.0);
      for (let i = 0; i < surfaces.length; i++) {
        const s = surfaces[i];
        if (surfaceIsLocked(s)) continue;
        const t = String(s?.type || "").toUpperCase();
        if (t === "OBJ" || t === "IMS") continue;
        if (Number(s.ap || 0) < floorBase) {
          s.ap = clamp(floorBase, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
          const signR = Math.sign(Number(s.R || 1)) || 1;
          const absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(s.R || 0)));
          const needAbsR = (Number(s.ap || 0) / AP_SAFETY) * 1.05;
          s.R = signR * clamp(Math.max(absR, needAbsR), PHYS_CFG.minRadius, 600);
        }
      }
    }
  }

  function nudgeStopTowardTargetT(surfaces, targetEfl, targetT, strength = 0.75) {
    if (!Array.isArray(surfaces)) return;
    if (!(Number.isFinite(targetEfl) && targetEfl > 1 && Number.isFinite(targetT) && targetT > 0.2)) return;
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return;
    const stop = surfaces[stopIdx];
    const targetAp = clamp(targetEfl / (2 * targetT), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
    const curAp = Number(stop.ap || targetAp);
    const s = clamp(Number(strength), 0.05, 1);
    // One-sided T target: if lens is already faster (curAp >= targetAp), keep that speed.
    stop.ap = (curAp < targetAp)
      ? clamp(curAp + (targetAp - curAp) * s, PHYS_CFG.minAperture, PHYS_CFG.maxAperture)
      : clamp(curAp, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
    {
      const signR = Math.sign(Number(stop.R || 1)) || 1;
      const absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(stop.R || 0)));
      const needAbsR = (Number(stop.ap || targetAp) / AP_SAFETY) * 1.08;
      stop.R = signR * clamp(Math.max(absR, needAbsR), PHYS_CFG.minRadius, 600);
    }

    // Keep immediate neighbors compatible with a larger stop.
    const neighNeed = Number(stop.ap || targetAp) / 1.08;
    for (let d = 1; d <= 3; d++) {
      for (const idx of [stopIdx - d, stopIdx + d]) {
        if (idx < 0 || idx >= surfaces.length) continue;
        const ss = surfaces[idx];
        if (surfaceIsLocked(ss)) continue;
        const t = String(ss?.type || "").toUpperCase();
        if (t === "OBJ" || t === "IMS") continue;
        const apNeed = neighNeed * (1 - d * 0.06);
        if (Number(ss.ap || 0) < apNeed) ss.ap = apNeed;
        const signR = Math.sign(Number(ss.R || 1)) || 1;
        const absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(ss.R || 0)));
        const needAbsR = (Number(ss.ap || 0) / AP_SAFETY) * 1.06;
        ss.R = signR * clamp(Math.max(absR, needAbsR), PHYS_CFG.minRadius, 600);
      }
    }
  }

  function enforceApertureRadiusCoupling(surface, margin = 1.06) {
    if (!surface) return;
    const t = String(surface?.type || "").toUpperCase();
    if (t === "OBJ" || t === "IMS") return;
    const ap = Math.max(PHYS_CFG.minAperture, Number(surface.ap || 0));
    const signR = Math.sign(Number(surface.R || 1)) || 1;
    const absR = Math.max(PHYS_CFG.minRadius, Math.abs(Number(surface.R || 0)));
    const needAbsR = (ap / AP_SAFETY) * Math.max(1.0, Number(margin || 1.06));
    surface.R = signR * clamp(Math.max(absR, needAbsR), PHYS_CFG.minRadius, 600);
  }

  function promoteElementDiameters(
    surfaces,
    { targetEfl = 50, targetT = 0, targetIC = 0, stage = 0, strength = 0.8, keepFl = false } = {}
  ) {
    if (!Array.isArray(surfaces) || surfaces.length < 3) return;
    const st = Number(stage || 0);
    const sGain = clamp(Number(strength || 0.8), 0.2, 1.5);
    const stopIdx = findStopSurfaceIndex(surfaces);

    if (stopIdx >= 0 && Number.isFinite(targetEfl) && targetEfl > 1 && Number.isFinite(targetT) && targetT > 0.2) {
      const stop = surfaces[stopIdx];
      const stopNeed = clamp(targetEfl / (2 * targetT), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
      const f = st >= 2 ? 0.96 : (st === 1 ? 0.90 : 0.84);
      const curAp = Number(stop.ap || stopNeed);
      stop.ap = clamp(curAp + (stopNeed * f - curAp) * (0.45 * sGain), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
      enforceApertureRadiusCoupling(stop, 1.08);

      const neighBase = Number(stop.ap || stopNeed);
      for (let d = 1; d <= 3; d++) {
        const ids = [stopIdx - d, stopIdx + d];
        for (const id of ids) {
          if (id < 0 || id >= surfaces.length) continue;
          const ss = surfaces[id];
          if (surfaceIsLocked(ss)) continue;
          const tt = String(ss?.type || "").toUpperCase();
          if (tt === "OBJ" || tt === "IMS") continue;
          const need = neighBase * (1 - d * 0.08);
          if (Number(ss.ap || 0) < need) ss.ap = clamp(need, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
          enforceApertureRadiusCoupling(ss, 1.06);
        }
      }
    }

    if (Number.isFinite(targetIC) && targetIC > 0) {
      const floor = clamp(
        targetIC * (st >= 2 ? 0.34 : (st === 1 ? 0.30 : 0.28)),
        8.0,
        keepFl ? 24.0 : 30.0
      );
      for (let i = 0; i < surfaces.length; i++) {
        const ss = surfaces[i];
        if (surfaceIsLocked(ss)) continue;
        const tt = String(ss?.type || "").toUpperCase();
        if (tt === "OBJ" || tt === "IMS") continue;
        const ap = Number(ss.ap || 0);
        if (ap < floor) {
          ss.ap = clamp(ap + (floor - ap) * (0.28 * sGain), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
        }
        enforceApertureRadiusCoupling(ss, 1.04);
      }
    }
  }

  function enforcePupilHealthFloors(
    surfaces,
    { targetEfl = 50, targetT = 0, targetIC = 0, stage = 0, keepFl = false } = {}
  ) {
    if (!Array.isArray(surfaces) || surfaces.length < 3) return;
    const st = Number(stage || 0);
    const stopIdx = findStopSurfaceIndex(surfaces);

    let stopFloor = 0;
    if (Number.isFinite(targetT) && targetT > 0.2 && Number.isFinite(targetEfl) && targetEfl > 1) {
      const stopNeed = clamp(targetEfl / (2 * targetT), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
      const stopFrac = st <= 0 ? 0.62 : (st === 1 ? 0.80 : (st === 2 ? 0.90 : 0.95));
      stopFloor = stopNeed * stopFrac;
    }

    let icFloor = 0;
    if (Number.isFinite(targetIC) && targetIC > 0) {
      const icFrac = st <= 0 ? 0.28 : (st === 1 ? 0.32 : (st === 2 ? 0.38 : 0.36));
      icFloor = clamp(targetIC * icFrac, 8.0, keepFl ? 28.0 : 34.0);
    }

    const baseFloor = Math.max(6.0, icFloor, stopFloor * 0.62);
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      if (surfaceIsLocked(s)) continue;
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      if (Number(s.ap || 0) < baseFloor) s.ap = baseFloor;
    }

    if (stopIdx >= 0) {
      const stop = surfaces[stopIdx];
      if (!surfaceIsLocked(stop)) {
        if (stopFloor > 0 && Number(stop.ap || 0) < stopFloor) stop.ap = stopFloor;
        enforceApertureRadiusCoupling(stop, 1.09);
      }

      const stopAp = Math.max(0, Number(stop.ap || 0));
      for (let d = 1; d <= 3; d++) {
        const need = stopAp * (1 - d * 0.10);
        for (const idx of [stopIdx - d, stopIdx + d]) {
          if (idx < 0 || idx >= surfaces.length) continue;
          const s = surfaces[idx];
          if (surfaceIsLocked(s)) continue;
          const t = String(s?.type || "").toUpperCase();
          if (t === "OBJ" || t === "IMS") continue;
          if (Number(s.ap || 0) < need) s.ap = need;
          enforceApertureRadiusCoupling(s, 1.07);
        }
      }

      const rearFrac = st >= 2 ? 0.80 : (st === 1 ? 0.74 : 0.68);
      for (let i = stopIdx + 1; i < surfaces.length - 1; i++) {
        const s = surfaces[i];
        if (surfaceIsLocked(s)) continue;
        const t = String(s?.type || "").toUpperCase();
        if (t === "OBJ" || t === "IMS") continue;
        const need = Math.max(baseFloor, stopAp * rearFrac);
        if (Number(s.ap || 0) < need) s.ap = need;
        enforceApertureRadiusCoupling(s, 1.06);
      }
    }
  }

  function buildGuidedCandidate(baseLens, pri, targets, wavePreset, topo, aggressive = false) {
    const c = clone(baseLens);
    const st = Number(pri?.stage ?? 0);
    const icNeed = Math.max(0, Number(pri?.icNeedMm || 0));
    const keepFl = !!pri?.flInBand;
    const hard = !!aggressive;

    if (st <= 0) {
      nudgeLensTowardFocal(c, targets.targetEfl, wavePreset, hard ? 1.0 : 0.92, hard ? 0.30 : 0.22, { keepAperture: true });
      if (targets.targetT > 0) {
        nudgeStopTowardTargetT(c.surfaces, targets.targetEfl, targets.targetT, hard ? 0.56 : 0.42);
      }
    } else if (st === 1) {
      // T coarse phase before IC growth.
      nudgeStopTowardTargetT(c.surfaces, targets.targetEfl, targets.targetT, hard ? 0.98 : 0.88);
      nudgeLensTowardFocal(c, targets.targetEfl, wavePreset, hard ? 0.64 : 0.52, hard ? 0.08 : 0.06, { keepAperture: true });
    } else if (st === 2) {
      const passes = hard ? 3 : (icNeed > 3.0 ? 2 : 1);
      for (let p = 0; p < passes; p++) {
        applyCoverageBoostMutation(c.surfaces, {
          targetIC: targets.targetIC,
          targetEfl: targets.targetEfl,
          targetT: targets.targetT,
          icNeedMm: hard ? (icNeed + 3.0) : icNeed,
          // First pass respects FL lock, extra passes may relax lock for stronger IC push.
          keepFl: (p === 0 ? keepFl : false),
        });
      }
      nudgeStopTowardTargetT(c.surfaces, targets.targetEfl, targets.targetT, hard ? 0.92 : 0.78);
      nudgeLensTowardFocal(c, targets.targetEfl, wavePreset, hard ? 0.55 : 0.40, hard ? 0.07 : 0.05, { keepAperture: true });
    } else {
      // Fine tune: keep T close and clean up sharpness.
      nudgeStopTowardTargetT(c.surfaces, targets.targetEfl, targets.targetT, hard ? 0.85 : 0.62);
      nudgeLensTowardFocal(c, targets.targetEfl, wavePreset, hard ? 0.42 : 0.32, hard ? 0.05 : 0.035, { keepAperture: true });
    }

    promoteElementDiameters(c.surfaces, {
      targetEfl: targets.targetEfl,
      targetT: targets.targetT,
      targetIC: targets.targetIC,
      stage: st,
      strength: hard ? 1.15 : 0.9,
      keepFl,
    });
    enforcePupilHealthFloors(c.surfaces, {
      targetEfl: targets.targetEfl,
      targetT: targets.targetT,
      targetIC: targets.targetIC,
      stage: st,
      keepFl,
    });

    quickSanity(c.surfaces);
    if (topo) enforceTopology(c.surfaces, topo);
    enforceRearMountStart(c.surfaces);
    quickSanity(c.surfaces);
    return c;
  }

  function nudgeLensTowardFocal(lensObj, targetEfl, wavePreset, strength = 0.6, maxStep = 0.20, opts = null) {
    if (!lensObj?.surfaces || !(Number.isFinite(targetEfl) && targetEfl > 1)) return false;
    const o = opts || {};
    const keepAperture = o.keepAperture !== false;
    const surfaces = lensObj.surfaces;
    computeVertices(surfaces, 0, 0);
    const p = estimateEflBflParaxial(surfaces, wavePreset);
    const efl = Number(p?.efl);
    if (!(Number.isFinite(efl) && efl > 1e-6)) return false;

    const kRaw = targetEfl / efl;
    if (!Number.isFinite(kRaw) || kRaw <= 0) return false;

    const s = clamp(Number(strength), 0, 1);
    const cap = clamp(Number(maxStep), 0.01, 0.60);
    const k = clamp(1 + (kRaw - 1) * s, 1 - cap, 1 + cap);
    if (!Number.isFinite(k) || Math.abs(k - 1) < 1e-6) return false;

    const rearIdx = findScratchRearSurfaceIndex(surfaces);
    for (let i = 0; i < surfaces.length; i++) {
      const ss = surfaces[i];
      if (surfaceIsLocked(ss)) continue;
      const t = String(ss?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      ss.R = Number(ss.R || 0) * k;
      if (i === rearIdx) {
        // Keep image-space gap tied to mount geometry during FL nudges.
        ss.t = Math.max(PHYS_CFG.minAirGap, Number(ss.t || 0));
        ss.glass = "AIR";
      } else {
        ss.t = clamp(Number(ss.t || 0) * k, PHYS_CFG.minThickness, 42);
      }
      const ap0 = Number(ss.ap || 0);
      if (keepAperture) {
        const kAp = (k >= 1)
          ? Math.pow(k, 0.20)
          : Math.max(0.995, Math.pow(k, 0.08)); // keep pupil nearly stable during FL pulls
        ss.ap = clamp(ap0 * kAp, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
        enforceApertureRadiusCoupling(ss, 1.03);
      } else {
        ss.ap = clamp(ap0 * k, PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
      }
    }
    enforceRearMountStart(surfaces);
    quickSanity(surfaces);
    return true;
  }

  function evalLensMerit(lensObj, {
    targetEfl,
    targetT,
    targetIC = 0,
    fieldAngle,
    rayCount,
    wavePreset,
    sensorW,
    sensorH,
    evalTier = "accurate",
    lensShiftHint = null,
    afOptions = null,
    icOptions = null,
    rayCountFast = null,
    timingSink = null,
  }){
    const evalTierNorm = String(evalTier || "accurate").toLowerCase() === "fast" ? "fast" : "accurate";
    const tEval0 = performance.now();
    let tAfMs = 0;
    let tPhysMs = 0;
    let tTraceMs = 0;
    let tIcMs = 0;

    const finishEval = (payload) => {
      const totalMs = performance.now() - tEval0;
      if (timingSink && typeof timingSink === "object") {
        timingSink.evals = (timingSink.evals || 0) + 1;
        timingSink.totalMs = (timingSink.totalMs || 0) + totalMs;
        timingSink.afMs = (timingSink.afMs || 0) + tAfMs;
        timingSink.traceMs = (timingSink.traceMs || 0) + tTraceMs;
        timingSink.icMs = (timingSink.icMs || 0) + tIcMs;
        timingSink.physMs = (timingSink.physMs || 0) + tPhysMs;
      }
      return {
        ...payload,
        evalTier: evalTierNorm,
        evalMs: totalMs,
      };
    };

    const tmp = clone(lensObj);
    const surfaces = tmp.surfaces;
    const evalRayCount = evalTierNorm === "fast"
      ? Math.max(9, Math.min(21, Number(rayCountFast || rayCount || 15) | 0))
      : Math.max(9, Math.min(61, Number(rayCount || 31) | 0));
    const afRayCountDefault = evalTierNorm === "fast"
      ? Math.max(7, Math.min(15, evalRayCount))
      : Math.max(9, Math.min(31, evalRayCount));

    // IMS ap = half height
    const halfH = Math.max(0.1, sensorH * 0.5);
    const ims = surfaces[surfaces.length-1];
    if (ims && String(ims.type).toUpperCase()==="IMS") ims.ap = halfH;

    // autofocus (lens shift)
    const af0 = performance.now();
    const afCfg = afOptions || {};
    const hintShift = Number(lensShiftHint);
    const hasHint = Number.isFinite(hintShift);
    const forceAf = !!afCfg.force;
    const doFastSkipAf = (evalTierNorm === "fast") && hasHint && !forceAf;
    let lensShift = hasHint ? hintShift : 0;
    let afOk = hasHint;
    if (!doFastSkipAf) {
      const af = bestLensShiftForDesign(
        surfaces,
        fieldAngle,
        afRayCountDefault,
        wavePreset,
        {
          centerShift: hasHint ? hintShift : Number(afCfg.centerShift || 0),
          coarseHalfRange: Number.isFinite(afCfg.coarseHalfRange)
            ? Number(afCfg.coarseHalfRange)
            : (evalTierNorm === "fast" ? 3.0 : 6.0),
          coarseStep: Number.isFinite(afCfg.coarseStep)
            ? Number(afCfg.coarseStep)
            : (evalTierNorm === "fast" ? 0.60 : 0.30),
          fineHalfRange: Number.isFinite(afCfg.fineHalfRange)
            ? Number(afCfg.fineHalfRange)
            : (evalTierNorm === "fast" ? 0.90 : 1.60),
          fineStep: Number.isFinite(afCfg.fineStep)
            ? Number(afCfg.fineStep)
            : (evalTierNorm === "fast" ? 0.20 : 0.08),
          rayCount: Number.isFinite(afCfg.rayCount) ? Number(afCfg.rayCount) : afRayCountDefault,
        }
      );
      if (af.ok) {
        lensShift = af.shift;
        afOk = true;
      }
    }
    tAfMs += (performance.now() - af0);

    const sensorX = 0.0;
    const phys0 = performance.now();
    // Evaluate mount intrusion at both neutral focus and focused state.
    // This prevents "cheating" mount constraints by sliding the whole lens with lensShift.
    computeVertices(surfaces, 0, sensorX);
    const rearVxNeutral = lastPhysicalVertexX(surfaces);
    const intrusionNeutral = Number.isFinite(rearVxNeutral) ? (rearVxNeutral - (-PL_FFD)) : Infinity;
    computeVertices(surfaces, lensShift, sensorX);
    const phys = evaluatePhysicalConstraints(surfaces);
    const rearVxFocused = lastPhysicalVertexX(surfaces);
    const intrusionFocused = Number.isFinite(rearVxFocused) ? (rearVxFocused - (-PL_FFD)) : Infinity;
    const intrusion = Math.max(intrusionNeutral, intrusionFocused);
    tPhysMs += (performance.now() - phys0);

    if (phys.hardFail) {
      const score = MERIT_CFG.hardInvalidPenalty + Math.max(0, Number(phys.penalty || 0));
      const icShortfallMm = Number.isFinite(targetIC) && targetIC > 0 ? targetIC : 0;
      return finishEval({
        score,
        efl: null,
        T: null,
        softIcMm: 0,
        icShortfallMm,
        bfl: null,
        intrusion,
        vigFrac: 1,
        hardInvalid: true,
        physPenalty: Number(phys.penalty || 0),
        worstOverlap: Number(phys.worstOverlap || 0),
        worstPinch: Number(phys.worstPinch || 0),
        lensShift,
        rms0: null,
        rmsE: null,
        distRmsPct: null,
        distMaxPct: null,
        distEdgePct: null,
        distFlavor: "unknown",
        distPenalty: 0,
        distWeight: 0,
        internalCrossPairs: 0,
        internalCrossSegments: 0,
        afOk,
        breakdown: {
          rmsCenter: null,
          rmsEdge: null,
          vigPct: 100,
          intrusion: null,
          fields: [0, 0, 0],
          physPenalty: Number(phys.penalty || 0),
          hardInvalid: true,
          internalCrossPairs: 0,
          internalCrossSegments: 0,
          internalCrossPenalty: 0,
          distRmsPct: null,
          distMaxPct: null,
          distEdgePct: null,
          distFlavor: "unknown",
          distPenalty: 0,
          distWeight: 0,
          distSampleCount: 0,
          distValidSamples: 0,
        },
      });
    }

    const trace0 = performance.now();
    const rays = buildRays(surfaces, fieldAngle, evalRayCount);
    const traces = rays.map(r => traceRayForward(clone(r), surfaces, wavePreset));
    const rayCross = detectInternalRayCrossings(traces, surfaces, wavePreset);
    const crossPenalty = internalCrossPenaltyFromStats(rayCross);
    const physPenaltyTotal = Number(phys.penalty || 0) + crossPenalty;
    const hardInvalidCombined = !!phys.hardFail || !!rayCross.invalid;

    const vCount = traces.filter(t=>t.vignetted).length;
    const vigFrac = traces.length ? (vCount / traces.length) : 1;

    const { efl, bfl } = estimateEflBflParaxial(surfaces, wavePreset);
    const Tgeom = estimateTStopApprox(efl, surfaces);
    if (rayCross.invalid) {
      const score = MERIT_CFG.hardInvalidPenalty + Math.max(0, physPenaltyTotal);
      const icShortfallMm = Number.isFinite(targetIC) && targetIC > 0 ? targetIC : 0;
      tTraceMs += Math.max(0, performance.now() - trace0);
      return finishEval({
        score,
        efl,
        T: Number.isFinite(Tgeom) ? Tgeom : null,
        softIcMm: 0,
        icShortfallMm,
        bfl,
        intrusion,
        vigFrac,
        hardInvalid: true,
        physPenalty: physPenaltyTotal,
        worstOverlap: Number(phys.worstOverlap || 0),
        worstPinch: Number(phys.worstPinch || 0),
        goodFrac0: 0,
        lensShift,
        afOk,
        rms0: null,
        rmsE: null,
        distRmsPct: null,
        distMaxPct: null,
        distEdgePct: null,
        distFlavor: "unknown",
        distPenalty: 0,
        distWeight: 0,
        internalCrossPairs: Number(rayCross.crossPairs || 0),
        internalCrossSegments: Number(rayCross.crossSegments || 0),
        breakdown: {
          rmsCenter: null,
          rmsEdge: null,
          vigPct: Math.round(vigFrac * 100),
          intrusion: Number.isFinite(intrusion) ? intrusion : null,
          fields: [0, 0, 0],
          vigCenterPct: Math.round(vigFrac * 100),
          vigMidPct: Math.round(vigFrac * 100),
          physPenalty: physPenaltyTotal,
          hardInvalid: true,
          internalCrossPairs: Number(rayCross.crossPairs || 0),
          internalCrossSegments: Number(rayCross.crossSegments || 0),
          internalCrossPenalty: crossPenalty,
          distRmsPct: null,
          distMaxPct: null,
          distEdgePct: null,
          distFlavor: "unknown",
          distPenalty: 0,
          distWeight: 0,
          distSampleCount: 0,
          distValidSamples: 0,
        },
      });
    }
    const centerTp = measureCenterThroughput(
      surfaces,
      wavePreset,
      sensorX,
      evalTierNorm === "fast" ? Math.max(13, evalRayCount) : Math.max(31, evalRayCount)
    );
    const T = estimateEffectiveT(Tgeom, centerTp.goodFrac);

    const fov = computeFovDeg(efl, sensorW, sensorH);
    let softIcMm = null;
    let icShortfallMm = 0;
    let icEvalMs = 0;
    if (Number.isFinite(targetIC) && targetIC > 0) {
      const ic0 = performance.now();
      const icMode = String(icOptions?.mode || (evalTierNorm === "fast" ? "proxy" : "lut")).toLowerCase();
      const icHint = Number(icOptions?.hintMm);
      if (icMode === "skip") {
        softIcMm = Number.isFinite(icHint) ? icHint : 0;
      } else if (icMode === "proxy") {
        const icRes = estimateUsableCircleFastProxy(
          surfaces,
          sensorW,
          sensorH,
          wavePreset,
          Math.max(9, evalRayCount),
          { ...FAST_OPT_IC_CFG, ...(icOptions?.cfg || {}) }
        );
        const measured = Number(icRes?.usableCircleDiameterMm ?? icRes?.softICmm ?? 0);
        softIcMm = Number.isFinite(measured) ? measured : 0;
      } else {
        const icRes = estimateUsableCircleBackgroundLut(
          surfaces,
          sensorW,
          sensorH,
          wavePreset,
          Math.max(15, Math.min(41, evalRayCount | 0)),
          { ...OPT_IC_CFG, ...(icOptions?.cfg || {}) },
          { useCurrentGeometry: true, lensShift }
        );
        const measured = Number(icRes?.usableCircleDiameterMm ?? icRes?.softICmm ?? 0);
        softIcMm = Number.isFinite(measured) ? measured : 0;
      }
      icShortfallMm = Math.max(0, Number(targetIC) - softIcMm);
      icEvalMs = performance.now() - ic0;
    }
    tIcMs += icEvalMs;

    const provisionalPriority = buildOptPriority(
      {
        score: 0,
        efl,
        T,
        softIcMm: Number.isFinite(softIcMm) ? Number(softIcMm) : 0,
        intrusion,
        hardInvalid: hardInvalidCombined,
        physPenalty: physPenaltyTotal,
        worstOverlap: Number(phys.worstOverlap || 0),
        worstPinch: Number(phys.worstPinch || 0),
        internalCrossPairs: Number(rayCross.crossPairs || 0),
        internalCrossSegments: Number(rayCross.crossSegments || 0),
      },
      { targetEfl, targetIC, targetT }
    );
    const shouldMeasureDistortion =
      (evalTierNorm !== "fast") ||
      !MERIT_CFG.distFastMeasureOnlyInFlBand ||
      provisionalPriority.flInBand;
    const distortionStats = shouldMeasureDistortion
      ? (
        evalTierNorm === "fast"
          ? measureDistortionChiefSamples(
              surfaces,
              wavePreset,
              sensorX,
              sensorW,
              sensorH,
              efl,
              "d",
              MERIT_CFG.distSampleFracs
            )
          : getDistortionChiefStatsCached(
              surfaces,
              wavePreset,
              sensorX,
              sensorW,
              sensorH,
              efl,
              "d",
              MERIT_CFG.distSampleFracs
            )
      )
      : null;
    const distortionWeight = shouldMeasureDistortion
      ? distortionWeightForPriority(provisionalPriority)
      : 0;
    const distPenaltyRes = distortionPenaltyFromStats(distortionStats, distortionWeight);

    const meritRes = computeMeritV1({
      surfaces,
      wavePreset,
      sensorX,
      rayCount: evalRayCount,
      fov,
      intrusion,
      efl,
      T,
      bfl,
      targetEfl,
      targetT,
      physPenalty: physPenaltyTotal,
      hardInvalid: hardInvalidCombined,
      internalCrossPairs: Number(rayCross.crossPairs || 0),
      internalCrossSegments: Number(rayCross.crossSegments || 0),
      internalCrossPenalty: crossPenalty,
      distortionStats,
      distortionPenalty: distPenaltyRes.penalty,
      distortionWeight: distPenaltyRes.weight,
    });
    tTraceMs += Math.max(0, performance.now() - trace0 - icEvalMs);

    // tiny extra: hard fail if NaNs
    const score = Number.isFinite(meritRes.merit) ? meritRes.merit : 1e9;

    return finishEval({
      score,
      efl,
      T,
      softIcMm,
      icShortfallMm,
      bfl,
      intrusion,
      vigFrac,
      hardInvalid: hardInvalidCombined,
      physPenalty: physPenaltyTotal,
      worstOverlap: Number(phys.worstOverlap || 0),
      worstPinch: Number(phys.worstPinch || 0),
      goodFrac0: centerTp.goodFrac,
      lensShift,
      afOk,
      rms0: meritRes.breakdown.rmsCenter,
      rmsE: meritRes.breakdown.rmsEdge,
      distRmsPct: meritRes.breakdown.distRmsPct,
      distMaxPct: meritRes.breakdown.distMaxPct,
      distEdgePct: meritRes.breakdown.distEdgePct,
      distFlavor: meritRes.breakdown.distFlavor,
      distPenalty: meritRes.breakdown.distPenalty,
      distWeight: meritRes.breakdown.distWeight,
      internalCrossPairs: Number(rayCross.crossPairs || 0),
      internalCrossSegments: Number(rayCross.crossSegments || 0),
      breakdown: meritRes.breakdown,
    });
  }

  function stageName(stage) {
    if (stage < 0) return "Physics fix";
    if (stage === 0) return "FL acquire";
    if (stage === 1) return "T coarse";
    if (stage === 2) return "IC growth";
    return "Fine tune";
  }

  function buildOptPriority(evalRes, { targetEfl, targetIC, targetT }) {
    const efl = Number(evalRes?.efl);
    const T = Number(evalRes?.T);
    const bfl = Number(evalRes?.bfl);
    const score = Number.isFinite(evalRes?.score) ? Number(evalRes.score) : 1e9;
    const crossPairs = Math.max(0, Number(evalRes?.internalCrossPairs || 0));
    const crossSegments = Math.max(0, Number(evalRes?.internalCrossSegments || 0));
    const hardInvalid = !!evalRes?.hardInvalid || crossPairs > 0;
    const intrusionMm = Math.max(0, Number(evalRes?.intrusion || 0));
    const overlapMm = Math.max(0, Number(evalRes?.worstOverlap || 0));
    const pinchMm = Math.max(0, Number(evalRes?.worstPinch || 0));
    const physPenalty = Math.max(0, Number(evalRes?.physPenalty || 0));
    const bflShortMm = Number.isFinite(bfl) ? Math.max(0, MERIT_CFG.bflMin - bfl) : MERIT_CFG.bflMin;
    const bflHardShortMm = Math.max(0.1, Number(OPT_STAGE_CFG.bflHardShortMm || 0.8));
    const bflHardFail = bflShortMm > bflHardShortMm;
    const bflBad = bflShortMm > 0.5;
    const feasible = !hardInvalid && !bflHardFail && intrusionMm <= 1e-3 && overlapMm <= 1e-3 && crossPairs <= 0;
    const feasibilityDebt =
      (hardInvalid ? 5000 : 0) +
      (bflHardFail ? 2400 : 0) +
      intrusionMm * 1200 +
      overlapMm * 2000 +
      bflShortMm * 260 +
      Math.max(0, pinchMm - 0.35) * 160 +
      crossPairs * 1800 +
      crossSegments * 500 +
      physPenalty * 0.02;

    const eflErrRel = Number.isFinite(efl) && targetEfl > 1e-9
      ? Math.abs(efl - targetEfl) / targetEfl
      : Infinity;
    // Tiny epsilon avoids floating-point edge misses.
    const flInBand = eflErrRel <= (OPT_STAGE_CFG.flBandRel + 1e-4);
    const flReady = eflErrRel <= (OPT_STAGE_CFG.flStageRel + 1e-4);

    const icMeasured = Number.isFinite(evalRes?.softIcMm) ? Number(evalRes.softIcMm) : 0;
    const icGoalMm = targetIC > 0 ? (targetIC * OPT_STAGE_CFG.icPassFrac) : 0;
    const icNeedMm = targetIC > 0 ? Math.max(0, icGoalMm - icMeasured) : 0;
    const icGood = targetIC <= 0 || icNeedMm <= 0;

    // One-sided T error: only too-slow T is an error.
    const tErrAbs = targetT > 0 && Number.isFinite(T)
      ? Math.max(0, T - targetT)
      : (targetT > 0 ? Infinity : 0);
    const tFastAbs = targetT > 0 && Number.isFinite(T)
      ? Math.max(0, targetT - T)
      : 0;
    const tGood = targetT <= 0 || tErrAbs <= OPT_STAGE_CFG.tGoodAbs;

    const rms0 = Number(evalRes?.rms0);
    const rmsE = Number(evalRes?.rmsE);
    const vigFrac = Number(evalRes?.vigFrac);
    const sharpness = (Number.isFinite(rms0) ? rms0 : 999) +
      1.7 * (Number.isFinite(rmsE) ? rmsE : 999) +
      0.5 * (Number.isFinite(vigFrac) ? vigFrac : 1);
    const distRmsPctRaw = Number(evalRes?.distRmsPct);
    const distMaxPctRaw = Number(evalRes?.distMaxPct);
    const distEdgePct = Number(evalRes?.distEdgePct);
    const distFlavor = String(evalRes?.distFlavor || distortionFlavorFromEdgePct(distEdgePct));
    const distPenalty = Math.max(0, Number(evalRes?.distPenalty || 0));
    const distWeight = Math.max(0, Number(evalRes?.distWeight || 0));
    const distRmsScore = Number.isFinite(distRmsPctRaw) ? Math.abs(distRmsPctRaw) : 999;
    const distMaxScore = Number.isFinite(distMaxPctRaw) ? Math.abs(distMaxPctRaw) : 999;
    const distortionScore = distRmsScore + 0.45 * distMaxScore;

    let stage = feasible ? 0 : -1;
    // Stage flow: FL acquire -> T coarse -> IC growth -> fine tune.
    if (feasible && flInBand) {
      const needsTCoarse = targetT > 0 && (!Number.isFinite(tErrAbs) || tErrAbs > OPT_STAGE_CFG.tCoarseAbs);
      if (needsTCoarse) stage = 1;
      else if (!icGood) stage = 2;
      else stage = 3;
    }
    const stageRank = stage < 0 ? 0 : (stage + 1); // 0=invalid, 1..4 better as objectives complete

    return {
      stage,
      stageRank,
      stageName: stageName(stage),
      score,
      feasible,
      feasibilityDebt,
      hardInvalid,
      intrusionMm,
      overlapMm,
      pinchMm,
      physPenalty,
      bfl,
      bflShortMm,
      bflHardFail,
      bflBad,
      efl,
      eflErrRel,
      flInBand,
      flReady,
      icMeasured,
      icGoalMm,
      icNeedMm,
      icGood,
      T,
      tErrAbs,
      tFastAbs,
      tGood,
      sharpness,
      internalCrossPairs: crossPairs,
      internalCrossSegments: crossSegments,
      distRmsPct: Number.isFinite(distRmsPctRaw) ? distRmsPctRaw : null,
      distMaxPct: Number.isFinite(distMaxPctRaw) ? distMaxPctRaw : null,
      distEdgePct: Number.isFinite(distEdgePct) ? distEdgePct : null,
      distFlavor,
      distPenalty,
      distWeight,
      distRmsScore,
      distMaxScore,
      distortionScore,
    };
  }

  function compareEvalByPlan(a, b, targets) {
    if (!b) return -1;
    const A = buildOptPriority(a, targets);
    const B = buildOptPriority(b, targets);

    // Hard physical feasibility gate.
    if (A.feasible !== B.feasible) return A.feasible ? -1 : 1;
    if (!A.feasible && !B.feasible) {
      if (Math.abs(A.feasibilityDebt - B.feasibilityDebt) > 1e-3) {
        return A.feasibilityDebt - B.feasibilityDebt;
      }
      if (Math.abs(A.eflErrRel - B.eflErrRel) > 1e-6) return A.eflErrRel - B.eflErrRel;
      return A.score - B.score;
    }

    // Hard gate: while in FL acquire, FL error is lexicographically dominant.
    if (A.stage === 0 && B.stage === 0) {
      if (Math.abs(A.eflErrRel - B.eflErrRel) > 1e-6) return A.eflErrRel - B.eflErrRel;
      return A.score - B.score;
    }

    const flGap = Math.abs(A.eflErrRel - B.eflErrRel);
    // FL is dominant while still acquiring FL or when either candidate drifts outside the hold band.
    const flDominant = (A.stage <= 0 && B.stage <= 0) || !A.flInBand || !B.flInBand;
    if (flDominant && flGap > OPT_STAGE_CFG.flPreferRel) {
      return A.eflErrRel - B.eflErrRel;
    }

    // Higher stage rank is better: Physics fix < FL acquire < T coarse < IC growth < Fine tune.
    if (A.stageRank !== B.stageRank) return B.stageRank - A.stageRank;

    if (A.stage === 0 && Math.abs(A.eflErrRel - B.eflErrRel) > 1e-6) {
      return A.eflErrRel - B.eflErrRel;
    }

    if (A.stage === 1) {
      if (Math.abs(A.tErrAbs - B.tErrAbs) > 1e-4) return A.tErrAbs - B.tErrAbs;
      if (Math.abs(A.icNeedMm - B.icNeedMm) > 0.01) return A.icNeedMm - B.icNeedMm;
    }

    if (A.stage === 2) {
      if (Math.abs(A.icNeedMm - B.icNeedMm) > 0.005) return A.icNeedMm - B.icNeedMm;
      if (Math.abs(A.icMeasured - B.icMeasured) > 0.005) return B.icMeasured - A.icMeasured;
      // If IC is flat, prefer better T so the pupil can open for later IC jumps.
      if (Math.abs(A.tErrAbs - B.tErrAbs) > 1e-4) return A.tErrAbs - B.tErrAbs;
    }

    if (A.stage === 3) {
      if (Math.abs(A.tErrAbs - B.tErrAbs) > 1e-4) return A.tErrAbs - B.tErrAbs;
      if (Math.abs(A.eflErrRel - B.eflErrRel) > OPT_STAGE_CFG.polishFlDriftRel) return A.eflErrRel - B.eflErrRel;
      if (Math.abs(A.distRmsScore - B.distRmsScore) > 0.001) return A.distRmsScore - B.distRmsScore;
      if (Math.abs(A.distMaxScore - B.distMaxScore) > 0.002) return A.distMaxScore - B.distMaxScore;
      const aEdge = Number.isFinite(A.distEdgePct) ? Math.abs(A.distEdgePct) : 999;
      const bEdge = Number.isFinite(B.distEdgePct) ? Math.abs(B.distEdgePct) : 999;
      if (Math.abs(aEdge - bEdge) > 0.003) return aEdge - bEdge;
      if (Math.abs(A.sharpness - B.sharpness) > 1e-5) return A.sharpness - B.sharpness;
    }

    if (Math.abs(A.eflErrRel - B.eflErrRel) > 1e-6) return A.eflErrRel - B.eflErrRel;
    return A.score - B.score;
  }

  function planEnergy(pri) {
    if (!pri) return Infinity;
    if (!pri.feasible) {
      return 1e9 + pri.feasibilityDebt * 100 + pri.eflErrRel * 1e5;
    }
    const stagePenalty = Math.max(0, 5 - Number(pri.stageRank || 0));
    const eflW = pri.stage <= 0 ? 360000 : (pri.stage === 1 ? 60000 : 16000);
    const icW = pri.stage === 2 ? 1400 : 260;
    const tW = pri.stage === 1 ? 520 : (pri.stage === 2 ? 260 : 140);
    const distW = pri.stage >= 3 ? 520 : (pri.stage === 2 ? 85 : 10);
    return (
      stagePenalty * 100000 +
      pri.eflErrRel * eflW +
      pri.icNeedMm * icW +
      pri.tErrAbs * tW +
      pri.sharpness * 15 +
      pri.distRmsScore * distW +
      pri.distMaxScore * distW * 0.45
    );
  }

  function isEvalBetterByPlan(a, b, targets) {
    return compareEvalByPlan(a, b, targets) < 0;
  }

  function fmtFlOpt(evalRes, targetEfl) {
    const p = buildOptPriority(evalRes, { targetEfl, targetIC: 0, targetT: 0 });
    const eflTxt = Number.isFinite(p.efl) ? p.efl.toFixed(2) : "—";
    const errTxt = Number.isFinite(p.eflErrRel) ? (p.eflErrRel * 100).toFixed(2) : "—";
    const mark = p.flReady ? " ✅ tight" : (p.flInBand ? " ✓ band" : "");
    return `FL ${eflTxt}mm (target ${targetEfl.toFixed(2)} • err ${errTxt}%${mark})`;
  }

  function fmtIcOpt(evalRes, targetIC) {
    if (!(Number.isFinite(targetIC) && targetIC > 0)) return "IC target off";
    const p = buildOptPriority(evalRes, { targetEfl: 1, targetIC, targetT: 0 });
    return `IC ${p.icMeasured.toFixed(2)}mm (goal >= ${p.icGoalMm.toFixed(2)} • short ${p.icNeedMm.toFixed(2)})`;
  }

  function fmtTOpt(evalRes, targetT) {
    if (!(Number.isFinite(targetT) && targetT > 0)) return "T target off";
    const p = buildOptPriority(evalRes, { targetEfl: 1, targetIC: 0, targetT });
    const tTxt = Number.isFinite(p.T) ? p.T.toFixed(2) : "—";
    const slowTxt = Number.isFinite(p.tErrAbs) ? p.tErrAbs.toFixed(2) : "—";
    const fastTxt = Number.isFinite(p.tFastAbs) && p.tFastAbs > 0.01 ? ` • fast ${p.tFastAbs.toFixed(2)}` : "";
    return `T ${tTxt} (target <= ${targetT.toFixed(2)} • slow ${slowTxt}${fastTxt}${p.tGood ? " ✅" : ""})`;
  }

  function fmtDistOpt(evalRes) {
    const p = buildOptPriority(evalRes, { targetEfl: 1, targetIC: 0, targetT: 0 });
    const rmsTxt = Number.isFinite(p.distRmsPct) ? `${Math.abs(p.distRmsPct).toFixed(2)}%` : "—";
    const maxTxt = Number.isFinite(p.distMaxPct) ? `${Math.abs(p.distMaxPct).toFixed(2)}%` : "—";
    const edgeTxt = Number.isFinite(p.distEdgePct) ? `${Number(p.distEdgePct).toFixed(2)}%` : "—";
    const flavor = (p.distFlavor === "barrel" || p.distFlavor === "pincushion") ? ` • ${p.distFlavor}` : "";
    return `Dist RMS ${rmsTxt} • MAX ${maxTxt} • edge ${edgeTxt}${flavor} • target 0.00%`;
  }

  function fmtPhysOpt(evalRes, targets) {
    const p = buildOptPriority(evalRes, targets);
    if (p.feasible) return "PHYS OK ✅";
    const intrTxt = Number.isFinite(p.intrusionMm) ? p.intrusionMm.toFixed(2) : "—";
    const ovTxt = Number.isFinite(p.overlapMm) ? p.overlapMm.toFixed(2) : "—";
    const bflTxt = Number.isFinite(p.bflShortMm) ? p.bflShortMm.toFixed(2) : "—";
    const xoverTxt = Math.max(0, Number(p.internalCrossPairs || 0)).toFixed(0);
    return `PHYS INVALID ❌ (intr ${intrTxt}mm • overlap ${ovTxt}mm • BFL short ${bflTxt}mm • xover ${xoverTxt})`;
  }

  function fmtStageStep(stage) {
    if (!Number.isFinite(stage) || stage < 0) return "0/4";
    return `${Math.min(4, (stage | 0) + 1)}/4`;
  }

  function fmtIntrusion(evalRes) {
    const v = Number(evalRes?.intrusion);
    return Number.isFinite(v) ? `${v.toFixed(2)}mm` : "—";
  }

  async function runOptimizer(){
    if (optRunning) return;
    optRunning = true;
    const runNo = ++optimizerRunSerial;
    const runHeader = formatOptimizerRunHeader(runNo);

    const targetEfl = num(ui.optTargetFL?.value, 75);
    const targetT = num(ui.optTargetT?.value, 2.0);
    const targetIC = Math.max(0, num(ui.optTargetIC?.value, 0));
    const targets = { targetEfl, targetIC, targetT };
    const iters = Math.max(10, (num(ui.optIters?.value, 2000) | 0));
    const mode = (ui.optPop?.value || "safe");

    // snapshot sensor settings
    const { w: sensorW, h: sensorH } = getSensorWH();
    const fieldAngle = num(ui.fieldAngle?.value, 0);
    const rayCount = Math.max(9, Math.min(61, (num(ui.rayCount?.value, 31) | 0))); // limit for speed
    const wavePreset = ui.wavePreset?.value || "d";

    const startLens = sanitizeLens(lens);
    const topo = captureTopology(startLens);
    const fastRayCount = Math.max(11, Math.min(21, Math.min(rayCount, Number(OPT_EVAL_CFG.fastRayCount || 15) | 0)));
    const perf = {
      fast: makeEvalPerfBucket(),
      accurate: makeEvalPerfBucket(),
    };

    let cur = startLens;
    let curEval = evalLensMerit(cur, {
      targetEfl, targetT, targetIC, fieldAngle, rayCount, wavePreset, sensorW, sensorH,
      evalTier: "accurate",
      lensShiftHint: num(ui.lensFocus?.value, 0),
      afOptions: {
        force: true,
        centerShift: num(ui.lensFocus?.value, 0),
        coarseHalfRange: OPT_EVAL_CFG.accurateAfRange,
        coarseStep: OPT_EVAL_CFG.accurateAfCoarseStep,
        fineHalfRange: OPT_EVAL_CFG.accurateAfFineHalf,
        fineStep: OPT_EVAL_CFG.accurateAfFineStep,
      },
      icOptions: { mode: targetIC > 0 ? "lut" : "skip", cfg: OPT_IC_CFG },
      rayCountFast: fastRayCount,
      timingSink: perf.accurate,
    });
    let best = { lens: clone(cur), eval: curEval, iter: 0 };
    let elites = [{ lens: clone(cur), eval: curEval, iter: 0 }];
    const ELITE_MAX = 8;
    const addElite = (lensObj, evalObj, iterIdx) => {
      if (!lensObj || !evalObj) return;
      const p = buildOptPriority(evalObj, targets);
      if (!p.feasible && p.stageRank <= 0) return;
      const efl = Number(evalObj?.efl);
      const score = Number(evalObj?.score);
      const dup = elites.some((e) => {
        const ee = Number(e?.eval?.efl);
        const es = Number(e?.eval?.score);
        return Number.isFinite(score) && Number.isFinite(es) &&
          Math.abs(score - es) < 1e-6 &&
          Number.isFinite(efl) && Number.isFinite(ee) && Math.abs(efl - ee) < 1e-6;
      });
      if (dup) return;
      elites.push({ lens: clone(lensObj), eval: evalObj, iter: iterIdx | 0 });
      elites.sort((a, b) => compareEvalByPlan(a.eval, b.eval, targets));
      if (elites.length > ELITE_MAX) elites = elites.slice(0, ELITE_MAX);
    };
    let stallIters = 0;
    let flLocked = (() => {
      const p0 = buildOptPriority(curEval, targets);
      return p0.feasible && p0.flInBand;
    })();

    // annealing-ish
    let temp0 = mode === "wild" ? 3.5 : 1.8;
    let temp1 = mode === "wild" ? 0.25 : 0.12;

    const tStart = performance.now();

    const BATCH = 60;
    let itersRan = 0;

    const evalCandidateTier = (lensCand, tier, priRef, baseEvalRef, iterIdx, forceAcc = false) => {
      const baseShift = Number(baseEvalRef?.lensShift);
      const hasShift = Number.isFinite(baseShift);
      const useFast = tier === "fast" && !forceAcc;
      const doFastAf = useFast && (!hasShift || (iterIdx % Math.max(10, Number(OPT_EVAL_CFG.fastAutofocusEvery || 120) | 0) === 0));
      const icHint = Number(baseEvalRef?.softIcMm);
      const fastIcTick = iterIdx % Math.max(2, Number(OPT_EVAL_CFG.fastIcEvery || 10) | 0) === 0;
      const fastIcMode = (priRef?.stage === 2 || fastIcTick) ? "proxy" : "skip";
      return evalLensMerit(lensCand, {
        targetEfl, targetT, targetIC, fieldAngle, rayCount, wavePreset, sensorW, sensorH,
        evalTier: useFast ? "fast" : "accurate",
        lensShiftHint: hasShift ? baseShift : curEval?.lensShift,
        afOptions: useFast
          ? {
              force: !!doFastAf,
              centerShift: hasShift ? baseShift : Number(curEval?.lensShift || 0),
              coarseHalfRange: OPT_EVAL_CFG.fastAfRange,
              coarseStep: OPT_EVAL_CFG.fastAfCoarseStep,
              fineHalfRange: OPT_EVAL_CFG.fastAfFineHalf,
              fineStep: OPT_EVAL_CFG.fastAfFineStep,
              rayCount: Math.max(7, Math.min(15, fastRayCount)),
            }
          : {
              force: true,
              centerShift: hasShift ? baseShift : Number(curEval?.lensShift || 0),
              coarseHalfRange: OPT_EVAL_CFG.accurateAfRange,
              coarseStep: OPT_EVAL_CFG.accurateAfCoarseStep,
              fineHalfRange: OPT_EVAL_CFG.accurateAfFineHalf,
              fineStep: OPT_EVAL_CFG.accurateAfFineStep,
              rayCount: Math.max(9, Math.min(31, rayCount)),
            },
        icOptions: useFast
          ? {
              mode: targetIC > 0 ? fastIcMode : "skip",
              hintMm: Number.isFinite(icHint) ? icHint : 0,
              cfg: FAST_OPT_IC_CFG,
            }
          : {
              mode: targetIC > 0 ? "lut" : "skip",
              cfg: OPT_IC_CFG,
            },
        rayCountFast: fastRayCount,
        timingSink: useFast ? perf.fast : perf.accurate,
      });
    };

    for (let i = 1; i <= iters; i++){
      if (!optRunning) break;
      itersRan = i;

      const a = i / iters;
      const temp = temp0 * (1 - a) + temp1 * a;

      const curPri = buildOptPriority(curEval, targets);
      const bestPriPre = buildOptPriority(best.eval, targets);
      const tries = (curPri.stage === 0)
        ? (curPri.eflErrRel > 0.20 ? 10 : 6)
        : (curPri.stage === 1)
        ? (flLocked ? 12 : 9) // T coarse
        : (curPri.stage === 2)
        ? (flLocked ? (curPri.icNeedMm > 9 ? 18 : 14) : 10) // IC growth
        : (flLocked ? 5 : 3); // fine tune
      let cand = null;
      let candEval = null;
      let candPri = null;

      // Deterministic guided candidate each iteration to keep momentum.
      {
        const guideBase = best?.lens || cur;
        const guidePri = best?.lens ? bestPriPre : curPri;
        const guided = buildGuidedCandidate(
          guideBase,
          guidePri,
          targets,
          wavePreset,
          topo,
          stallIters > 380
        );
        const ge = evalCandidateTier(
          guided,
          "fast",
          guidePri,
          best?.lens ? best.eval : curEval,
          i
        );
        cand = guided;
        candEval = ge;
        candPri = buildOptPriority(ge, targets);
      }

      for (let trIdx = 0; trIdx < tries; trIdx++) {
        const rBase = Math.random();
        let baseLens = cur;
        let baseEvalRef = curEval;
        let basePri = curPri;
        if (best?.lens && rBase < 0.70) {
          baseLens = best.lens;
          baseEvalRef = best.eval;
          basePri = bestPriPre;
        } else if (elites.length > 1 && rBase < 0.90) {
          const ePick = pick(elites);
          if (ePick?.lens && ePick?.eval) {
            baseLens = ePick.lens;
            baseEvalRef = ePick.eval;
            basePri = buildOptPriority(baseEvalRef, targets);
          }
        }
        const unlockForIC = (basePri.stage === 2 && basePri.icNeedMm > 10);
        const mutMode = (unlockForIC && Math.random() < 0.40) ? "wild" : mode;
        const topoUse = (unlockForIC && mutMode === "wild" && Math.random() < 0.55) ? null : topo;
        const c = mutateLens(baseLens, mutMode, topoUse, {
          stage: basePri.stage,
          targetIC,
          targetEfl,
          targetT,
          icNeedMm: basePri.icNeedMm,
          keepFl: flLocked
        });
        if (basePri.stage === 1 && Math.random() < 0.95) {
          // Coarse T phase: always push stop/pupil first.
          nudgeStopTowardTargetT(c.surfaces, targetEfl, targetT, 0.95);
          quickSanity(c.surfaces);
          if (topoUse) enforceTopology(c.surfaces, topoUse);
        }
        if (basePri.stage === 2) {
          // IC phase: every candidate keeps pupil health in sync.
          nudgeStopTowardTargetT(c.surfaces, targetEfl, targetT, 0.86);
        }
        if (basePri.stage === 2 && basePri.icNeedMm > 1.0 && Math.random() < 0.92) {
          applyCoverageBoostMutation(c.surfaces, {
            targetIC,
            targetEfl,
            targetT,
            icNeedMm: basePri.icNeedMm + (stallIters > 220 ? 2.5 : 0),
            keepFl: flLocked,
          });
          if (basePri.icNeedMm > 3.0 && Math.random() < 0.55) {
            applyCoverageBoostMutation(c.surfaces, {
              targetIC,
              targetEfl,
              targetT,
              icNeedMm: basePri.icNeedMm + 3.0,
              keepFl: false,
            });
          }
          quickSanity(c.surfaces);
          if (topoUse) enforceTopology(c.surfaces, topoUse);
        }
        // Keep FL search from hovering around ~5% by adding a small deterministic focal nudge.
        if (basePri.stage === 0) {
          const flErrRel = Number(basePri.eflErrRel);
          const nearEdge = Number.isFinite(flErrRel) && flErrRel <= 0.03;
          const farAway = !Number.isFinite(flErrRel) || flErrRel >= 0.12;
          nudgeLensTowardFocal(
            c,
            targetEfl,
            wavePreset,
            1.0,
            nearEdge ? 0.03 : (farAway ? 0.10 : 0.06),
            { keepAperture: true }
          );
          if (farAway) {
            nudgeLensTowardFocal(c, targetEfl, wavePreset, 0.85, 0.06, { keepAperture: true });
          }
          if (targetT > 0 && Math.random() < 0.85) {
            nudgeStopTowardTargetT(c.surfaces, targetEfl, targetT, 0.48);
          }
        } else if (flLocked && Math.random() < 0.90) {
          nudgeLensTowardFocal(c, targetEfl, wavePreset, 0.40, 0.045, { keepAperture: true });
        }
        promoteElementDiameters(c.surfaces, {
          targetEfl,
          targetT,
          targetIC,
          stage: basePri.stage,
          strength: basePri.stage === 2 ? 1.1 : 0.8,
          keepFl: flLocked,
        });
        enforcePupilHealthFloors(c.surfaces, {
          targetEfl,
          targetT,
          targetIC,
          stage: basePri.stage,
          keepFl: flLocked,
        });
        quickSanity(c.surfaces);
        if (topoUse) enforceTopology(c.surfaces, topoUse);
        const ce = evalCandidateTier(
          c,
          "fast",
          basePri,
          baseEvalRef,
          i
        );
        if (!candEval || isEvalBetterByPlan(ce, candEval, targets)) {
          cand = c;
          candEval = ce;
          candPri = buildOptPriority(ce, targets);
        }
      }

      let candAccurate = false;
      let candAccEval = null;
      const promoteCandAccurate = () => {
        if (candAccurate && candAccEval) return candAccEval;
        candAccEval = evalCandidateTier(
          cand,
          "accurate",
          candPri,
          candEval || curEval,
          i,
          true
        );
        candEval = candAccEval;
        candPri = buildOptPriority(candEval, targets);
        candAccurate = true;
        return candAccEval;
      };

      const auditEveryBase = Math.max(20, Number(OPT_EVAL_CFG.accurateAuditEvery || 90) | 0);
      const auditEvery = (stallIters > 280)
        ? Math.max(10, Math.round(auditEveryBase * 0.35))
        : auditEveryBase;
      const shouldAccurateCheck =
        isEvalBetterByPlan(candEval, curEval, targets) ||
        isEvalBetterByPlan(candEval, best.eval, targets) ||
        (i % auditEvery === 0);
      if (shouldAccurateCheck) promoteCandAccurate();

      let accept = false;
      if (!curPri.feasible && candPri.feasible) {
        accept = true;
      } else if (curPri.feasible && !candPri.feasible) {
        if (
          curPri.stage === 2 &&
          candPri.stage <= 2 &&
          candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
          candPri.icMeasured > curPri.icMeasured + 0.8 &&
          candPri.feasibilityDebt < 3500
        ) {
          // Allow temporary controlled infeasible jumps to escape IC plateaus.
          accept = Math.random() < 0.22;
        } else {
          accept = false;
        }
      } else
      // Once we have entered FL band, never accept candidates outside the 5% band.
      if (flLocked && candPri.eflErrRel > OPT_STAGE_CFG.flHoldRel) {
        accept = false;
      } else if (curPri.stage === 0 && candPri.stage === 0) {
        // Hard FL gate: in FL acquire we only move when FL gets better (or not worse within tiny epsilon).
        const flTol = 1e-6;
        if (candPri.eflErrRel < curPri.eflErrRel - flTol) {
          accept = true;
        } else if (candPri.eflErrRel <= curPri.eflErrRel + flTol) {
          accept = candPri.score <= curEval.score + 1e-6;
        } else {
          accept = false;
        }
      } else if (curPri.flInBand && curPri.stage === 2 && candPri.eflErrRel > OPT_STAGE_CFG.flHoldRel) {
        // IC phase may move inside FL hold band, but never outside hard hold.
        accept = false;
      } else if (curPri.flInBand && curPri.stage === 3 && candPri.eflErrRel > curPri.eflErrRel + OPT_STAGE_CFG.polishFlDriftRel) {
        // Fine tune (distortion polish): keep FL locked while polishing.
        accept = false;
      } else if (
        curPri.stage === 3 &&
        candPri.stage === 3 &&
        candPri.feasible &&
        candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
        candPri.tErrAbs <= curPri.tErrAbs + 0.03 &&
        (
          candPri.distRmsScore > curPri.distRmsScore + 0.02 ||
          candPri.distMaxScore > curPri.distMaxScore + 0.04
        )
      ) {
        // In final polish, avoid drifting toward higher distortion.
        accept = false;
      } else if (
        curPri.stage === 1 &&
        candPri.stage === 1 &&
        candPri.feasible &&
        candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
        candPri.tErrAbs < curPri.tErrAbs - 0.01
      ) {
        // Coarse T phase should move even if IC does not.
        accept = true;
      } else if (
        curPri.stage === 2 &&
        candPri.stage === 2 &&
        candPri.feasible &&
        candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
        candPri.icMeasured > curPri.icMeasured + 0.005
      ) {
        // Explicitly keep climbing IC when FL remains inside lock band.
        accept = true;
      } else if (isEvalBetterByPlan(candEval, curEval, targets)) {
        accept = true;
      } else {
        // Controlled exploration within FL constraints, to avoid optimizer stagnation.
        const sameStage = candPri.stage === curPri.stage;
        if (sameStage) {
          if (curPri.stage === 0) {
            // No uphill exploration in FL acquire.
            accept = candPri.eflErrRel <= curPri.eflErrRel + 1e-6;
          } else if (curPri.stage === 1) {
            // T coarse stays target-dominant: do not accept worse T error.
            accept =
              candPri.feasible &&
              candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
              candPri.tErrAbs <= curPri.tErrAbs + 0.03 &&
              candPri.icNeedMm <= curPri.icNeedMm + 0.25;
          } else if (curPri.stage === 2) {
            // IC growth stays target-dominant: do not accept worse IC shortfall.
            const icTol = stallIters > 220 ? 0.35 : 0.18;
            accept =
              candPri.feasible &&
              candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
              candPri.icNeedMm <= curPri.icNeedMm + icTol &&
              candPri.tErrAbs <= curPri.tErrAbs + 0.12;
          } else {
            const dE = planEnergy(candPri) - planEnergy(curPri);
            const tempScale = (curPri.stage === 2 ? 520 : 300) * Math.max(0.10, temp);
            const uphillProb = Math.exp(-Math.max(0, dE) / Math.max(1e-6, tempScale));
            if (flLocked) {
              accept = Math.random() < uphillProb;
            } else {
              accept = (dE <= 0) || (Math.random() < uphillProb);
            }
          }
        }
      }
      if (accept && !candAccurate) {
        promoteCandAccurate();
        const stage1PlateauOk =
          curPri.stage === 1 &&
          candPri.stage === 1 &&
          candPri.feasible &&
          candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
          candPri.tErrAbs <= curPri.tErrAbs + 0.03 &&
          candPri.icNeedMm <= curPri.icNeedMm + 0.25;
        const stage2PlateauOk =
          curPri.stage === 2 &&
          candPri.stage === 2 &&
          candPri.feasible &&
          candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
          candPri.icNeedMm <= curPri.icNeedMm + (stallIters > 220 ? 0.35 : 0.18) &&
          candPri.tErrAbs <= curPri.tErrAbs + 0.12;
        const stage0PlateauOk =
          curPri.stage === 0 &&
          candPri.stage === 0 &&
          candPri.eflErrRel <= curPri.eflErrRel + 1e-6;
        const accStillGood =
          isEvalBetterByPlan(candEval, curEval, targets) ||
          stage0PlateauOk ||
          stage1PlateauOk ||
          stage2PlateauOk ||
          (
            curPri.stage === 1 &&
            candPri.stage === 1 &&
            candPri.feasible &&
            candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
            candPri.tErrAbs < curPri.tErrAbs - 0.01
          ) ||
          (
            curPri.stage === 2 &&
            candPri.stage === 2 &&
            candPri.feasible &&
            candPri.eflErrRel <= OPT_STAGE_CFG.flHoldRel &&
            candPri.icMeasured > curPri.icMeasured + 0.005
          );
        if (!accStillGood) accept = false;
      }
      if (accept){
        cur = cand;
        curEval = candEval;
        flLocked = flLocked || (candPri.feasible && candPri.flInBand);
        addElite(cur, curEval, i);
      }

      let improvedBest = false;
      if (!candAccurate && isEvalBetterByPlan(candEval, best.eval, targets)) {
        promoteCandAccurate();
      }
      if (isEvalBetterByPlan(candEval, best.eval, targets)){
        best = { lens: clone(cand), eval: candEval, iter: i };
        addElite(best.lens, best.eval, i);
        improvedBest = true;
        const bp = buildOptPriority(best.eval, targets);
        const stageStep = fmtStageStep(bp.stage);

        // UI update (rare)
        if (ui.optLog){
          setOptLog(
            `${runHeader}\n` +
            `best @${i}/${iters}\n` +
            `score ${best.eval.score.toFixed(2)}\n` +
            `stage ${stageStep}: ${bp.stageName}\n` +
            `${fmtPhysOpt(best.eval, targets)}\n` +
            `${fmtFlOpt(best.eval, targetEfl)}\n` +
            `${fmtIcOpt(best.eval, targetIC)}\n` +
            `${fmtTOpt(best.eval, targetT)}\n` +
            `${fmtDistOpt(best.eval)}\n` +
            `Tp0 ${Number.isFinite(best.eval.goodFrac0)?(best.eval.goodFrac0*100).toFixed(0):"—"}%\n` +
            `INTR ${fmtIntrusion(best.eval)}\n` +
            `RMS0 ${best.eval.rms0?.toFixed?.(3) ?? "—"}mm • RMSedge ${best.eval.rmsE?.toFixed?.(3) ?? "—"}mm\n`
          );
        }
      }
      stallIters = improvedBest ? 0 : (stallIters + 1);

      if (stallIters > 220 && (i % Math.max(40, BATCH / 2) === 0)) {
        const bpKick = buildOptPriority(best.eval, targets);
        const kick = buildGuidedCandidate(best.lens, bpKick, targets, wavePreset, topo, true);
        const kickEval = evalCandidateTier(kick, "accurate", bpKick, best.eval, i, true);
        if (isEvalBetterByPlan(kickEval, curEval, targets)) {
          cur = kick;
          curEval = kickEval;
          const kp = buildOptPriority(kickEval, targets);
          flLocked = flLocked || (kp.feasible && kp.flInBand);
          addElite(cur, curEval, i);
        }
        if (isEvalBetterByPlan(kickEval, best.eval, targets)) {
          best = { lens: clone(kick), eval: kickEval, iter: i };
          addElite(best.lens, best.eval, i);
          stallIters = 0;
        } else {
          stallIters = Math.floor(stallIters * 0.6);
        }
      }


      // Re-anchor when current drifts too far from best; keeps learning around elites.
      const bestPriPost = buildOptPriority(best.eval, targets);
      const curPriPost = buildOptPriority(curEval, targets);
      const curMuchWorse =
        (curPriPost.stageRank < bestPriPost.stageRank) ||
        (curPriPost.eflErrRel > bestPriPost.eflErrRel + 0.08) ||
        (curEval.score > best.eval.score * 2.4);
      if (curMuchWorse && (i % Math.max(40, BATCH / 2) === 0)) {
        cur = clone(best.lens);
        curEval = best.eval;
        flLocked = flLocked || (bestPriPost.feasible && bestPriPost.flInBand);
      }

      if (i % BATCH === 0){
        const tNow = performance.now();
        const dt = (tNow - tStart) / 1000;
        const ips = i / Math.max(1e-6, dt);
        const cp = buildOptPriority(curEval, targets);
        const bp = buildOptPriority(best.eval, targets);
        if (ui.optLog){
          setOptLog(
            `${runHeader}\n` +
            `running… ${i}/${iters}  (${ips.toFixed(1)} it/s)\n` +
            `current ${curEval.score.toFixed(2)} • best ${best.eval.score.toFixed(2)} @${best.iter}\n` +
            `phase current: ${cp.stageName} • best: ${bp.stageName}${flLocked ? " • FL lock ON" : ""}\n` +
            `${fmtPhysOpt(curEval, targets)}\n` +
            `current ${fmtFlOpt(curEval, targetEfl)}\n` +
            `current ${fmtIcOpt(curEval, targetIC)}\n` +
            `current ${fmtTOpt(curEval, targetT)}\n` +
            `current ${fmtDistOpt(curEval)}\n` +
            `best ${fmtFlOpt(best.eval, targetEfl)}\n` +
            `best ${fmtIcOpt(best.eval, targetIC)}\n` +
            `best ${fmtTOpt(best.eval, targetT)}\n` +
            `best ${fmtDistOpt(best.eval)}\n` +
            `best ${fmtPhysOpt(best.eval, targets)}\n`
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
    const bp = buildOptPriority(best.eval, targets);
    const stageStep = fmtStageStep(bp.stage);
    if (ui.optLog){
      setOptLog(
        `${runHeader}\n` +
        `done ${itersRan}/${iters}  (${(Math.max(1, itersRan)/Math.max(1e-6,sec)).toFixed(1)} it/s)\n` +
        `BEST score ${best.eval.score.toFixed(2)}\n` +
        `BEST @${best.iter}\n` +
        `BEST stage ${stageStep}: ${bp.stageName}\n` +
        `${fmtPhysOpt(best.eval, targets)}\n` +
        `${fmtFlOpt(best.eval, targetEfl)}\n` +
        `${fmtIcOpt(best.eval, targetIC)}\n` +
        `${fmtTOpt(best.eval, targetT)}\n` +
        `${fmtDistOpt(best.eval)}\n` +
        `Tp0 ${Number.isFinite(best.eval.goodFrac0)?(best.eval.goodFrac0*100).toFixed(0):"—"}%\n` +
        `INTR ${fmtIntrusion(best.eval)}\n` +
        `RMS0 ${best.eval.rms0?.toFixed?.(3) ?? "—"}mm • RMSedge ${best.eval.rmsE?.toFixed?.(3) ?? "—"}mm\n` +
        `Click “Apply best” to load.`
      );
    }

    toast(
      optBest
        ? `Optimize done. Score ${optBest.eval.score.toFixed(2)} • FL ${Number.isFinite(optBest.eval.efl) ? Number(optBest.eval.efl).toFixed(1) : "—"}mm${targetIC > 0 ? ` • IC ${Number(optBest.eval.softIcMm || 0).toFixed(1)}mm` : ""}`
        : "Optimize stopped"
    );
  }

  function stopOptimizer(){
    const stoppingScratch = !!scratchBuildRunning;
    const stoppingOpt = !!optRunning;
    if (!stoppingScratch && !stoppingOpt) return;
    if (stoppingScratch) scratchStopRequested = true;
    if (stoppingOpt) optRunning = false;
    if (stoppingScratch && stoppingOpt) toast("Stopping build + optimizer…");
    else if (stoppingScratch) toast("Stopping build from scratch…");
    else toast("Stopping…");
  }

  function applyBest(){
    if (!optBest?.lens) return toast("No best yet");
    const targets = {
      targetEfl: num(ui.optTargetFL?.value, 75),
      targetIC: Math.max(0, num(ui.optTargetIC?.value, 0)),
      targetT: num(ui.optTargetT?.value, 2.0),
    };
    const p = buildOptPriority(optBest.eval, targets);
    if (!p.feasible) {
      return toast("Best is fysiek ongeldig (intrusion/overlap/BFL). Eerst verder optimaliseren.");
    }
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
    const targetIC = Math.max(0, num(ui.optTargetIC?.value, 0));
    const { w: sensorW, h: sensorH } = getSensorWH();
    const fieldAngle = num(ui.fieldAngle?.value, 0);
    const rayCount = Math.max(9, Math.min(61, (num(ui.rayCount?.value, 31) | 0)));
    const wavePreset = ui.wavePreset?.value || "d";

    const t0 = performance.now();
    let best = Infinity;
    let bestIc = 0;
    let bestShort = Infinity;
    for (let i=0;i<N;i++){
      const res = evalLensMerit(lens, {targetEfl, targetT, targetIC, fieldAngle, rayCount, wavePreset, sensorW, sensorH});
      if (res.score < best) best = res.score;
      if (targetIC > 0) {
        const s = Math.max(0, Number(res.icShortfallMm || 0));
        if (s < bestShort) {
          bestShort = s;
          bestIc = Number(res.softIcMm || 0);
        }
      }
    }
    const t1 = performance.now();
    const sec = (t1 - t0)/1000;
    const eps = N / Math.max(1e-6, sec);
    setOptLog(
      `bench ${N} evals\n` +
      `${eps.toFixed(1)} eval/s\n` +
      `best seen ${best.toFixed(2)}\n` +
      `${targetIC > 0 ? `IC best ${bestIc.toFixed(2)}mm • short ${bestShort.toFixed(2)}mm\n` : ""}` +
      `(rays=${rayCount}, field=${fieldAngle}°, wave=${wavePreset})`
    );
    toast(`Bench: ${eps.toFixed(1)} eval/s`);
  }

  // -------------------- init wiring --------------------
  function wireUI() {
    populateSensorPresetsSelect();
    applyPreset(ui.sensorPreset?.value || "ARRI Alexa Mini LF (LF)");

    ui.sensorPreset?.addEventListener("change", () => {
      applyPreset(ui.sensorPreset.value);
      renderAll();
      scheduleAutosave();
    });
    ui.sensorW?.addEventListener("input", () => { applySensorToIMS(); renderAll(); scheduleAutosave(); });
    ui.sensorH?.addEventListener("input", () => { applySensorToIMS(); renderAll(); scheduleAutosave(); });

    ["fieldAngle","rayCount","wavePreset","sensorOffset","focusMode","lensFocus"].forEach((id) => {
      ui[id]?.addEventListener("input", () => { scheduleRenderAll(); scheduleAutosave(); });
      ui[id]?.addEventListener("change", () => { scheduleRenderAll(); scheduleAutosave(); });
    });
    ui.renderScale?.addEventListener("input", () => { scheduleRenderAll(); scheduleAutosave(); });

    ui.btnNew?.addEventListener("click", () => { newClearLens(); scheduleAutosave(); });
    ui.btnLoadOmit?.addEventListener("click", () => { loadLens(omit50ConceptV1()); scheduleAutosave(); });
    ui.btnLoadDemo?.addEventListener("click", () => { loadLens(demoLensSimple()); scheduleAutosave(); });

    ui.btnAdd?.addEventListener("click", () => { addSurface(); scheduleAutosave(); });
    ui.btnAddElement?.addEventListener("click", openElementModal);
    ui.btnDuplicate?.addEventListener("click", () => { duplicateSelected(); scheduleAutosave(); });
    ui.btnMoveUp?.addEventListener("click", () => { moveSelected(-1); scheduleAutosave(); });
    ui.btnMoveDown?.addEventListener("click", () => { moveSelected(+1); scheduleAutosave(); });
    ui.btnRemove?.addEventListener("click", () => { removeSelected(); scheduleAutosave(); });

    ui.btnScaleToFocal?.addEventListener("click", () => { scaleToFocal(); scheduleAutosave(); });
    ui.btnSetTStop?.addEventListener("click", () => { setTStop(); scheduleAutosave(); });

    ui.btnAutoFocus?.addEventListener("click", () => { autoFocus(); scheduleAutosave(); });

    ui.btnSave?.addEventListener("click", saveJSON);
    ui.fileLoad?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) loadJSONFile(f).catch((err) => {
        console.error(err);
        toast("Load failed (invalid JSON?)");
      });
      if (f) scheduleAutosave();
      e.target.value = "";
    });

    ui.btnRaysFS?.addEventListener("click", () => toggleFullscreen(ui.raysPane));

    // optimizer
    ui.btnBuildScratch?.addEventListener("click", openBuildScratchModal);
    ui.btnOptStart?.addEventListener("click", runOptimizer);
    ui.btnOptStop?.addEventListener("click", stopOptimizer);
    ui.btnOptApply?.addEventListener("click", applyBest);
    ui.btnOptBench?.addEventListener("click", benchOptimizer);

    ["optTargetFL","optTargetT","optTargetIC","optIters","optPop"].forEach((id)=>{
      ui[id]?.addEventListener("change", () => { scheduleRenderAll(); scheduleAutosave(); });
      ui[id]?.addEventListener("input", () => {
        // don't rerender constantly for iters/preset; but update merit targets
        if (id === "optTargetFL" || id === "optTargetT" || id === "optTargetIC") scheduleRenderAll();
        scheduleAutosave();
      });
    });
  }

  function bindKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      const target = e.target;
      const tag = String(target?.tagName || "").toUpperCase();
      const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === "s") {
        e.preventDefault();
        saveJSON();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === "o") {
        e.preventDefault();
        ui.fileLoad?.click();
        return;
      }
      if (!inField && !e.metaKey && !e.ctrlKey && !e.altKey && String(e.key).toLowerCase() === "a") {
        e.preventDefault();
        autoFocus();
        scheduleAutosave();
      }
    });
  }

  // -------------------- boot --------------------
  function boot() {
    wireUI();
    bindKeyboardShortcuts();

    // Force top on boot
    try {
      window.scrollTo(0, 0);
      document.querySelector(".leftScroll")?.scrollTo(0, 0);
      setTimeout(() => document.querySelector(".leftScroll")?.scrollTo(0, 0), 0);
    } catch(_) {}

    const restored = restoreAutosave();
    if (!restored) {
      buildTable();
      applySensorToIMS();
    }
    bindViewControls();
    renderAll();

    window.addEventListener("resize", () => renderAll());
    document.addEventListener("fullscreenchange", () => renderAll());
  }

  boot();
})();

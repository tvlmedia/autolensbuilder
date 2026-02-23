/* Meridional Raytracer (2D) — TVL Lens Builder (RAYS ONLY)
   - Rays canvas + surface editor + merit score.
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
    ic: $("#badgeIc"),
    merit: $("#badgeMerit"),

    footerWarn: $("#footerWarn"),
    metaInfo: $("#metaInfo"),

    eflTop: $("#badgeEflTop"),
    bflTop: $("#badgeBflTop"),
    tstopTop: $("#badgeTTop"),
    fovTop: $("#badgeFovTop"),
    covTop: $("#badgeCovTop"),
    icTop: $("#badgeIcTop"),
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
    adTargetEFL: $("#adTargetEFL"),
    adTargetT: $("#adTargetT"),
    adFocusTarget: $("#adFocusTarget"),
    adAttempts: $("#adAttempts"),
    adLog: $("#adLog"),
    surfaceTableWrap: $("#surfaceTableWrap"),
    statusPanel: $("#statusPanel"),

    btnScaleToFocal: $("#btnScaleToFocal"),
    btnSetTStop: $("#btnSetTStop"),
    btnAutoDesign: $("#btnAutoDesign"),
    btnAutoDesignRefine: $("#btnAutoDesignRefine"),
    btnAutoDesignPreview: $("#btnAutoDesignPreview"),
    btnAutoDesignStop: $("#btnAutoDesignStop"),
    btnAdLogExpand: $("#btnAdLogExpand"),
    btnAdToggleDetails: $("#btnAdToggleDetails"),
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
    expandMiddleApertures(lens.surfaces);
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
      if (s.stop) {
        s.type = "STOP";
        s.R = 0;
        s.glass = "AIR";
      }
    } else if (k === "glass") {
      s.glass = resolveGlassName(String(el.value || "AIR"));
    } else if (k === "type") {
      s.type = String(el.value || "");
    } else if (k === "R" || k === "t" || k === "ap") {
      s[k] = num(el.value, s[k] ?? 0);
    }

    applySensorToIMS();
    expandMiddleApertures(lens.surfaces);
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
  const AP_SAFETY = 0.86;
  const AP_MAX_PLANE = 30.0;
  const AP_MIN = 0.01;
  const MID_AP_CFG = {
    minMiddleVsEdge: 1.00,
    minStopVsEdge: 0.96,
    stopHeadroom: 1.00,
    nearStopHeadroom: 1.18,
  };

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

  function expandMiddleApertures(surfaces, opts = {}) {
    if (!Array.isArray(surfaces) || surfaces.length < 4) return;

    const minMiddleVsEdge = Number.isFinite(opts.minMiddleVsEdge) ? opts.minMiddleVsEdge : MID_AP_CFG.minMiddleVsEdge;
    const minStopVsEdge = Number.isFinite(opts.minStopVsEdge) ? opts.minStopVsEdge : MID_AP_CFG.minStopVsEdge;
    const stopHeadroom = Number.isFinite(opts.stopHeadroom) ? opts.stopHeadroom : MID_AP_CFG.stopHeadroom;
    const nearStopHeadroom = Number.isFinite(opts.nearStopHeadroom) ? opts.nearStopHeadroom : MID_AP_CFG.nearStopHeadroom;
    const targetStopAp = Number.isFinite(opts.targetStopAp) ? Math.max(AP_MIN, Number(opts.targetStopAp)) : null;

    const physIdx = [];
    for (let i = 0; i < surfaces.length; i++) {
      const t = String(surfaces[i]?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      physIdx.push(i);
    }
    if (physIdx.length < 3) return;

    const first = surfaces[physIdx[0]];
    const last = surfaces[physIdx[physIdx.length - 1]];
    const apFirst = Math.max(AP_MIN, Number(first?.ap || 0));
    const apLast = Math.max(AP_MIN, Number(last?.ap || 0));
    const edgeRef = Math.max(AP_MIN, 0.5 * (apFirst + apLast));
    if (!Number.isFinite(edgeRef) || edgeRef <= AP_MIN) return;

    const middleFloor = Math.max(AP_MIN, edgeRef * Math.max(0, minMiddleVsEdge));
    const stopFloorBase = Math.max(AP_MIN, edgeRef * Math.max(0, minStopVsEdge));
    const stopIdx = findStopSurfaceIndex(surfaces);

    for (let k = 1; k < physIdx.length - 1; k++) {
      const i = physIdx[k];
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      const isStop = i === stopIdx || t === "STOP";

      let floor = middleFloor;
      if (isStop) {
        floor = Math.max(floor, stopFloorBase);
      } else if (targetStopAp != null && stopIdx >= 0 && Math.abs(i - stopIdx) <= 2) {
        floor = Math.max(floor, targetStopAp * nearStopHeadroom);
      }

      const apNow = Number(s?.ap || 0);
      if (apNow < floor) s.ap = floor;
      clampSurfaceAp(s);
    }

    if (targetStopAp != null && stopIdx >= 0) {
      const sStop = surfaces[stopIdx];
      const stopTarget = Math.max(targetStopAp * stopHeadroom, stopFloorBase);
      if (Number(sStop?.ap || 0) < stopTarget) sStop.ap = stopTarget;
      clampSurfaceAp(sStop);
    }
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
    minAirGap: 0.20,
    prefAirGap: 0.90,
    minGlassCT: 0.45,
    prefGlassCT: 1.40,
    minRadius: 10.0,
    minAperture: 1.2,
    maxAperture: 32.0,
    minThickness: 0.05,
    maxThickness: 55.0,
    minStopToApertureRatio: 0.28,
    maxNegOverlap: 0.03,
    gapWeightAir: 1500.0,
    gapWeightGlass: 3200.0,
    overlapWeight: 5200.0,
    tinyApWeight: 120.0,
    tinyRadiusWeight: 80.0,
    pinchWeight: 300.0,
    stopOversizeWeight: 240.0,
    stopTooTinyWeight: 200.0,
    minAirGapsPreferred: 3,
    tooFewAirGapsWeight: 260.0,
    shortAirGapWeight: 260.0,
    thinGlassWeight: 220.0,
    minStopSideAirGap: 0.55,
    stopAirSideWeight: 2200.0,
    stopAirGapWeight: 1400.0,
    planeRefractiveWeight: 520.0,
    planeNearStopExtraWeight: 880.0,
    minAirGapHard: 0.12,
    minGlassCTHard: 0.28,
    maxApToRadiusSoft: 0.72,
    maxApToRadiusHard: 0.84,
    apToRadiusWeight: 220.0,
    stopMustBePlaneWeight: 900.0,
    stopGeomSamples: 23,
    stopIntrusionWeight: 1800.0,
  };

  function clampGlassPairClearApertures(surfaces, minCT, margin = 0.98) {
    if (!Array.isArray(surfaces) || surfaces.length < 2) return;
    const minCtUse = Math.max(0.05, Number(minCT || PHYS_CFG.minGlassCT || 0.1));
    const m = clamp(Number(margin || 0.98), 0.7, 1.0);

    for (let i = 0; i < surfaces.length - 1; i++) {
      const sA = surfaces[i];
      const sB = surfaces[i + 1];
      const tA = String(sA?.type || "").toUpperCase();
      const tB = String(sB?.type || "").toUpperCase();
      if (tA === "OBJ" || tA === "IMS" || tB === "OBJ" || tB === "IMS") continue;

      const mediumAfterA = String(resolveGlassName(sA?.glass || "AIR")).toUpperCase();
      if (mediumAfterA === "AIR") continue;

      const noAp = maxNonOverlappingSemiDiameter(sA, sB, minCtUse);
      if (!Number.isFinite(noAp) || noAp <= AP_MIN) continue;
      const cap = Math.max(AP_MIN, noAp * m);
      if (Number(sA.ap || 0) > cap) sA.ap = cap;
      if (Number(sB.ap || 0) > cap) sB.ap = cap;
      clampSurfaceAp(sA);
      clampSurfaceAp(sB);
    }
  }

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
      if (R > 1e-9 && ap > 0) {
        const apToR = ap / R;
        if (apToR > PHYS_CFG.maxApToRadiusSoft) {
          const d = apToR - PHYS_CFG.maxApToRadiusSoft;
          penalty += PHYS_CFG.apToRadiusWeight * d * d;
        }
        if (apToR > PHYS_CFG.maxApToRadiusHard) hardFail = true;
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
      if (mediumAfterA === "AIR" && minGap < PHYS_CFG.minAirGapHard) hardFail = true;
      if (mediumAfterA !== "AIR" && minGap < PHYS_CFG.minGlassCTHard) hardFail = true;
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
      const sStop = surfaces[stopIdx];
      const stopR = Math.abs(Number(sStop?.R || 0));
      if (stopR > 1e-9) {
        penalty += PHYS_CFG.stopMustBePlaneWeight * stopR * stopR;
        if (stopR > 0.25) hardFail = true;
      }

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

      // Geometric stop clearance: avoid stop plane cutting into neighboring curved glass.
      if (stopIdx > 0) {
        const sL = surfaces[stopIdx - 1];
        const tL = String(sL?.type || "").toUpperCase();
        if (tL !== "OBJ" && tL !== "IMS") {
          const apL = Math.max(
            0.1,
            Math.min(
              Number(stopAp || 0.1),
              Number(sL?.ap || stopAp || 0.1),
              Number(sStop?.ap || stopAp || 0.1),
              maxApForSurface(sL),
              maxApForSurface(sStop),
            ),
          );
          const gL = minGapBetweenSurfaces(sL, sStop, apL, PHYS_CFG.stopGeomSamples);
          if (!Number.isFinite(gL)) {
            penalty += 100_000;
            hardFail = true;
          } else if (gL < PHYS_CFG.minStopSideAirGap) {
            const d = PHYS_CFG.minStopSideAirGap - gL;
            penalty += PHYS_CFG.stopIntrusionWeight * d * d;
            if (gL < 0) hardFail = true;
          }
        }
      }
      if (stopIdx < surfaces.length - 1) {
        const sR = surfaces[stopIdx + 1];
        const tR = String(sR?.type || "").toUpperCase();
        if (tR !== "OBJ" && tR !== "IMS") {
          const apR = Math.max(
            0.1,
            Math.min(
              Number(stopAp || 0.1),
              Number(sR?.ap || stopAp || 0.1),
              Number(sStop?.ap || stopAp || 0.1),
              maxApForSurface(sR),
              maxApForSurface(sStop),
            ),
          );
          const gR = minGapBetweenSurfaces(sStop, sR, apR, PHYS_CFG.stopGeomSamples);
          if (!Number.isFinite(gR)) {
            penalty += 100_000;
            hardFail = true;
          } else if (gR < PHYS_CFG.minStopSideAirGap) {
            const d = PHYS_CFG.minStopSideAirGap - gR;
            penalty += PHYS_CFG.stopIntrusionWeight * d * d;
            if (gR < 0) hardFail = true;
          }
        }
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
        // Allow a somewhat larger STOP for faster targets, but still penalize mismatch.
        if (stopAp > 1.20 * minNeigh) {
          const d = stopAp - 1.20 * minNeigh;
          penalty += PHYS_CFG.stopOversizeWeight * d * d;
          if (d > 2.4) hardFail = true;
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

  function coverageTestBundleMaxFieldDeg(surfaces, wavePreset, sensorX, rayCount, limits = null) {
    const maxReqVigFrac = Number.isFinite(Number(limits?.maxReqVigFrac))
      ? clamp(Number(limits.maxReqVigFrac), 0, 0.999)
      : IMAGE_CIRCLE_CFG.maxReqVigFrac;
    const minReqValidFrac = Number.isFinite(Number(limits?.minReqValidFrac))
      ? clamp(Number(limits.minReqValidFrac), 0.02, 1.0)
      : IMAGE_CIRCLE_CFG.minReqValidFrac;
    let lo = 0, hi = 60, best = 0;
    for (let iter = 0; iter < 18; iter++) {
      const mid = (lo + hi) * 0.5;
      const pack = traceBundleAtField(surfaces, mid, rayCount, wavePreset, sensorX);
      const vigFrac = Number(pack?.vigFrac);
      const validFrac = Number(pack?.n || 0) / Math.max(1, rayCount);
      const ok =
        Number.isFinite(vigFrac) &&
        vigFrac <= maxReqVigFrac &&
        Number.isFinite(validFrac) &&
        validFrac >= minReqValidFrac;
      if (ok) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
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

  function estimateEffectiveOnAxisSemiAperture(surfaces, wavePreset = "d") {
    if (!Array.isArray(surfaces) || surfaces.length < 2) return null;
    const xStart = (surfaces[0]?.vx ?? 0) - 120;

    function passes(yAtRef) {
      const ray = { p: { x: xStart, y: yAtRef }, d: { x: 1, y: 0 } };
      const tr = traceRayForward(clone(ray), surfaces, wavePreset);
      return !!tr && !tr.vignetted && !tr.tir;
    }

    if (!passes(0)) return 0;

    const stopIdx = findStopSurfaceIndex(surfaces);
    const seed = (stopIdx >= 0)
      ? Math.max(AP_MIN, Number(surfaces[stopIdx]?.ap || 0))
      : Math.max(AP_MIN, Number(getRayReferencePlane(surfaces).apRef || 0));

    let lo = 0;
    let hi = Math.max(seed, AP_MIN);
    const maxHi = Math.max(PHYS_CFG.maxAperture * 1.6, hi);

    while (hi < maxHi && passes(hi)) {
      lo = hi;
      hi *= 1.25;
    }
    if (lo <= 0) lo = 0;

    for (let i = 0; i < 24; i++) {
      const mid = 0.5 * (lo + hi);
      if (passes(mid)) lo = mid;
      else hi = mid;
    }
    return Math.max(0, lo);
  }

  function estimateTStopApprox(efl, surfaces, wavePreset = "d") {
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return null;
    const stopAp = Math.max(1e-6, Number(surfaces[stopIdx].ap || 0));
    const effAp = estimateEffectiveOnAxisSemiAperture(surfaces, wavePreset);
    const useAp = Number.isFinite(effAp) && effAp > 0 ? Math.min(stopAp, effAp) : stopAp;
    if (!Number.isFinite(efl) || efl <= 0) return null;
    const T = efl / (2 * Math.max(1e-6, useAp));
    return Number.isFinite(T) ? T : null;
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

  const COVERAGE_CFG = {
    mode: "d",              // evaluate in diagonal plane
    marginDeg: 0.2,
    minSensorW: 36.0,       // always at least full-frame
    minSensorH: 24.0,
  };
  const IMAGE_CIRCLE_CFG = {
    minDiagMm: 45.0,        // full-frame coverage floor with small margin
    maxReqVigFrac: 0.06,    // max vignette fraction at required edge field
    minReqValidFrac: 0.72,  // minimum valid traced ray fraction at required edge field
    maxCenterVigFrac: 0.01, // center field should be essentially clean
    softMaxReqVigFrac: 0.92, // relaxed illum metric for progress/readout
    softMinReqValidFrac: 0.18,
  };

  function halfFieldFromDiagDeg(efl, diagMm) {
    if (!Number.isFinite(efl) || efl <= 0 || !Number.isFinite(diagMm) || diagMm <= 0) return null;
    return rad2deg(Math.atan((diagMm * 0.5) / efl));
  }

  function imageCircleDiagFromHalfFieldMm(efl, halfFieldDeg) {
    if (!Number.isFinite(efl) || efl <= 0 || !Number.isFinite(halfFieldDeg) || halfFieldDeg < 0) return null;
    return 2 * Math.abs(efl * Math.tan(deg2rad(halfFieldDeg)));
  }

  function imageCircleDiagFromChiefAtField(surfaces, wavePreset, sensorX, fieldDeg) {
    if (!Array.isArray(surfaces) || !Number.isFinite(fieldDeg) || fieldDeg < 0) return null;
    const chief = buildChiefRay(surfaces, fieldDeg);
    const tr = traceRayForward(clone(chief), surfaces, wavePreset);
    if (!tr || tr.vignetted || tr.tir || !tr.endRay) return null;
    const y = rayHitYAtX(tr.endRay, sensorX);
    if (!Number.isFinite(y)) return null;
    return 2 * Math.abs(y);
  }

  function targetImageCircleDiagMm(sensorW, sensorH) {
    const sensorDiag = Math.hypot(sensorW, sensorH);
    return Math.max(sensorDiag, IMAGE_CIRCLE_CFG.minDiagMm);
  }

  function requiredHalfFieldDeg(efl, sensorW, sensorH, mode = "d") {
    const fov = computeFovDeg(efl, sensorW, sensorH);
    if (!fov) return null;
    if (mode === "h") return fov.hfov * 0.5;
    if (mode === "v") return fov.vfov * 0.5;
    return fov.dfov * 0.5;
  }

  function coverageRequirementDeg(efl, sensorW, sensorH, mode = "d") {
    if (mode === "d") {
      return halfFieldFromDiagDeg(efl, targetImageCircleDiagMm(sensorW, sensorH));
    }
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
    if (mode === "d") return Math.max(cur, 0.5 * IMAGE_CIRCLE_CFG.minDiagMm);
    const min = coverageHalfSizeMm(COVERAGE_CFG.minSensorW, COVERAGE_CFG.minSensorH, mode);
    return Math.max(cur, min);
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

  function estimateDistortionPct(surfaces, wavePreset, sensorX, sensorW, sensorH, efl, mode = "d") {
    const req = requiredHalfFieldDeg(efl, sensorW, sensorH, mode);
    const idealHalf = coverageHalfSizeMm(sensorW, sensorH, mode);
    if (!Number.isFinite(req) || !Number.isFinite(idealHalf) || idealHalf < 1e-9) return null;

    const chief = buildChiefRay(surfaces, req);
    const tr = traceRayForward(clone(chief), surfaces, wavePreset);
    if (!tr || tr.vignetted || tr.tir) return null;

    const y = rayHitYAtX(tr.endRay, sensorX);
    if (!Number.isFinite(y)) return null;

    const actualHalf = Math.abs(y);
    const dist = ((actualHalf - idealHalf) / idealHalf) * 100;
    return Number.isFinite(dist) ? dist : null;
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
      adTargetEFL: ui.adTargetEFL?.value || "50",
      adTargetT: ui.adTargetT?.value || "2.0",
      adFocusTarget: ui.adFocusTarget?.value || "both",
      adAttempts: ui.adAttempts?.value || "1",
      adDetailsCollapsed: adDetailsCollapsed ? "1" : "0",
      adLogExpanded: adLogExpanded ? "1" : "0",
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
    set(ui.adTargetEFL, snap.adTargetEFL);
    set(ui.adTargetT, snap.adTargetT);
    set(ui.adFocusTarget, snap.adFocusTarget);
    set(ui.adAttempts, snap.adAttempts);
    setAdDetailsCollapsed(String(snap.adDetailsCollapsed || "0") === "1");
    setAdLogExpanded(String(snap.adLogExpanded || "0") === "1");
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
      expandMiddleApertures(lens.surfaces);
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
    vigWeight: 16.0,
    centerVigWeight: 180.0,
    midVigWeight: 60.0,
    covPenalty: 180.0,
    intrusionWeight: 16.0,
    fieldWeights: [1.0, 1.5, 2.0],

    bflMin: 52.0,             // for PL: discourage too-short backfocus
    bflWeight: 6.0,
    lowValidPenalty: 450.0,
    hardInvalidPenalty: 1_000_000.0,
    covShortfallWeight: 180.0,
    imageCircleShortfallWeight: 180.0,
    imageCircleReqVigWeight: 1400.0,
    imageCircleReqValidWeight: 900.0,
    invalidCoveragePenalty: 6000.0,
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
    fov, maxFieldStrict, maxFieldIllum, maxFieldGeom, covers, req,
    intrusion,
    efl, T, bfl,
    physPenalty = 0,
    hardInvalid = false,
  }){
    const mfStrictRaw = Number(maxFieldStrict);
    const mfIllumRaw = Number(maxFieldIllum);
    const hasStrict = Number.isFinite(mfStrictRaw);
    const hasIllum = Number.isFinite(mfIllumRaw);
    const mfStrict = hasStrict ? mfStrictRaw : 0;
    const mfIllum = hasIllum
      ? mfIllumRaw
      : (hasStrict ? mfStrictRaw : 0);
    const edge = Number.isFinite(req) ? Math.min(mfIllum, req) : mfIllum;
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
    if (!hasStrict || !Number.isFinite(req)) merit += MERIT_CFG.invalidCoveragePenalty;
    if (Number.isFinite(req) && hasStrict && mfStrict < req) {
      const d = req - mfStrict;
      merit += MERIT_CFG.covShortfallWeight * (d * d);
    }
    if (Number.isFinite(req) && hasIllum && mfIllum < req) {
      const d = req - mfIllum;
      merit += MERIT_CFG.covShortfallWeight * 0.55 * (d * d);
    }

    const canEvalImageCircle = Number.isFinite(efl) && efl > 0 && Number.isFinite(req) && req >= 0;
    const imageCircleDiagMeasured = canEvalImageCircle
      ? imageCircleDiagFromChiefAtField(surfaces, wavePreset, sensorX, mfIllum)
      : null;
    const imageCircleDiagFallback = canEvalImageCircle
      ? imageCircleDiagFromHalfFieldMm(efl, mfIllum)
      : null;
    const imageCircleDiag = Number.isFinite(imageCircleDiagMeasured) ? imageCircleDiagMeasured : imageCircleDiagFallback;
    const imageCircleDiagGeomMeasured = canEvalImageCircle && Number.isFinite(maxFieldGeom)
      ? imageCircleDiagFromChiefAtField(surfaces, wavePreset, sensorX, maxFieldGeom)
      : null;
    const imageCircleDiagGeomFallback = canEvalImageCircle && Number.isFinite(maxFieldGeom)
      ? imageCircleDiagFromHalfFieldMm(efl, maxFieldGeom)
      : null;
    const imageCircleDiagGeom = Number.isFinite(imageCircleDiagGeomMeasured)
      ? imageCircleDiagGeomMeasured
      : imageCircleDiagGeomFallback;
    const imageCircleTarget = imageCircleDiagFromHalfFieldMm(efl, req);
    const imageCircleShortfall = (Number.isFinite(imageCircleDiag) && Number.isFinite(imageCircleTarget))
      ? Math.max(0, imageCircleTarget - imageCircleDiag)
      : null;
    if (Number.isFinite(imageCircleShortfall) && imageCircleShortfall > 0) {
      merit += MERIT_CFG.imageCircleShortfallWeight * (imageCircleShortfall * imageCircleShortfall);
    }

    let reqVigFrac = null;
    let reqValidFrac = null;
    if (Number.isFinite(req) && req > 0) {
      const packReq = traceBundleAtField(surfaces, req, rayCount, wavePreset, sensorX);
      reqVigFrac = packReq.vigFrac;
      reqValidFrac = (packReq.n || 0) / Math.max(1, rayCount);
      if (Number.isFinite(reqVigFrac) && reqVigFrac > IMAGE_CIRCLE_CFG.maxReqVigFrac) {
        const d = reqVigFrac - IMAGE_CIRCLE_CFG.maxReqVigFrac;
        merit += MERIT_CFG.imageCircleReqVigWeight * (d * d);
      }
      if (Number.isFinite(reqValidFrac) && reqValidFrac < IMAGE_CIRCLE_CFG.minReqValidFrac) {
        const d = IMAGE_CIRCLE_CFG.minReqValidFrac - reqValidFrac;
        merit += MERIT_CFG.imageCircleReqValidWeight * (d * d);
      }
    }

    if (Number.isFinite(intrusion) && intrusion > 0){
      const x = intrusion / 1.0;
      merit += MERIT_CFG.intrusionWeight * (x * x);
    }

    // BFL soft-constraint (paraxial) – helps keep designs physically plausible
    if (Number.isFinite(bfl) && bfl < MERIT_CFG.bflMin){
      const d = (MERIT_CFG.bflMin - bfl);
      merit += MERIT_CFG.bflWeight * (d * d);
    }

    const minValidTarget = Math.max(7, Math.floor(rayCount * 0.45));
    if (validMin < minValidTarget) {
      const d = (minValidTarget - validMin);
      merit += MERIT_CFG.lowValidPenalty + 32.0 * d * d;
    }

    if (Number.isFinite(physPenalty) && physPenalty > 0) merit += physPenalty;
    if (hardInvalid) merit += MERIT_CFG.hardInvalidPenalty;

    const imageCircleOk =
      Number.isFinite(imageCircleDiag) &&
      Number.isFinite(imageCircleTarget) &&
      imageCircleDiag + 0.25 >= imageCircleTarget;
    const reqVigOk = !Number.isFinite(reqVigFrac) || reqVigFrac <= IMAGE_CIRCLE_CFG.maxReqVigFrac;
    const reqValidOk = !Number.isFinite(reqValidFrac) || reqValidFrac >= IMAGE_CIRCLE_CFG.minReqValidFrac;
    const centerVigOk = !Number.isFinite(vigCenter) || vigCenter <= IMAGE_CIRCLE_CFG.maxCenterVigFrac;
    const coversStrict = !!covers && imageCircleOk && reqVigOk && reqValidOk && centerVigOk;

    const breakdown = {
      rmsCenter, rmsEdge,
      vigPct: Math.round(vigAvg * 100),
      covers,
      coversStrict,
      intrusion: Number.isFinite(intrusion) ? intrusion : null,
      fields: fields.map(v => Number.isFinite(v) ? v : 0),
      vigCenterPct: Math.round(vigCenter * 100),
      vigMidPct: Math.round(vigMid * 100),
      imageCircleDiag: Number.isFinite(imageCircleDiag) ? imageCircleDiag : null,
      imageCircleDiagGeom: Number.isFinite(imageCircleDiagGeom) ? imageCircleDiagGeom : null,
      imageCircleTarget: Number.isFinite(imageCircleTarget) ? imageCircleTarget : null,
      imageCircleOk,
      reqVigPct: Number.isFinite(reqVigFrac) ? Math.round(reqVigFrac * 100) : null,
      reqValidPct: Number.isFinite(reqValidFrac) ? Math.round(reqValidFrac * 100) : null,
      centerVigOk,
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
    const T = estimateTStopApprox(efl, lens.surfaces, wavePreset);

    const fov = computeFovDeg(efl, sensorW, sensorH);
    const fovTxt = !fov
      ? "FOV: —"
      : `FOV: H ${fov.hfov.toFixed(1)}° • V ${fov.vfov.toFixed(1)}° • D ${fov.dfov.toFixed(1)}°`;

    const covMode = COVERAGE_CFG.mode;
    const covHalfMm = coverageHalfSizeWithFloorMm(sensorW, sensorH, covMode);
    const maxFieldGeom = coverageTestMaxFieldDeg(lens.surfaces, wavePreset, sensorX, covHalfMm);
    const maxFieldBundleStrict = coverageTestBundleMaxFieldDeg(lens.surfaces, wavePreset, sensorX, rayCount);
    const maxFieldBundleSoft = coverageTestBundleMaxFieldDeg(
      lens.surfaces,
      wavePreset,
      sensorX,
      rayCount,
      { maxReqVigFrac: IMAGE_CIRCLE_CFG.softMaxReqVigFrac, minReqValidFrac: IMAGE_CIRCLE_CFG.softMinReqValidFrac },
    );
    const maxFieldStrict = Math.min(maxFieldGeom, maxFieldBundleStrict);
    const maxFieldIllum = Math.min(maxFieldGeom, maxFieldBundleSoft);
    const reqFloor = coverageRequirementDeg(efl, sensorW, sensorH, covMode);
    const reqFromFov = coversSensorYesNo({ fov, maxField: maxFieldStrict, mode: covMode, marginDeg: COVERAGE_CFG.marginDeg }).req;
    const req = Number.isFinite(reqFloor) ? reqFloor : reqFromFov;
    const covers = Number.isFinite(req) ? (maxFieldStrict + COVERAGE_CFG.marginDeg >= req) : false;

    let covTxt = !fov
      ? "COV(D): —"
      : `COV(D): ±${maxFieldStrict.toFixed(1)}° • REQ(D): ${(req ?? 0).toFixed(1)}° • ${covers ? "COVERS ✅" : "NO ❌"}`;
    const distPct = estimateDistortionPct(lens.surfaces, wavePreset, sensorX, sensorW, sensorH, efl, covMode);

    const rearVx = lastPhysicalVertexX(lens.surfaces);
    const intrusion = rearVx - plX;
    const phys = evaluatePhysicalConstraints(lens.surfaces);

    const meritRes = computeMeritV1({
      surfaces: lens.surfaces,
      wavePreset,
      sensorX,
      rayCount,
      fov,
      maxFieldStrict,
      maxFieldIllum,
      maxFieldGeom,
      covers,
      req,
      intrusion,
      efl, T, bfl,
      physPenalty: phys.penalty,
      hardInvalid: phys.hardFail,
    });

    const m = meritRes.merit;
    const bd = meritRes.breakdown;
    const coversStrict = !!bd.coversStrict;
    const icDiagTxt = Number.isFinite(bd.imageCircleDiag) ? `${bd.imageCircleDiag.toFixed(1)}mm` : "—";
    const icGeomTxt = Number.isFinite(bd.imageCircleDiagGeom) ? `${bd.imageCircleDiagGeom.toFixed(1)}mm` : "—";
    const icTargetTxt = Number.isFinite(bd.imageCircleTarget) ? `${bd.imageCircleTarget.toFixed(1)}mm` : "—";
    const icSplit = Number.isFinite(bd.imageCircleDiag) && Number.isFinite(bd.imageCircleDiagGeom)
      ? Math.abs(bd.imageCircleDiagGeom - bd.imageCircleDiag) >= 0.35
      : false;
    const icCompactTxt = icSplit
      ? `${icGeomTxt} geom / ${icDiagTxt} illum`
      : icDiagTxt;
    const icFullTxt = icSplit
      ? `${icGeomTxt} geom / ${icDiagTxt} illum / ${icTargetTxt}`
      : `${icDiagTxt} / ${icTargetTxt}`;
    covTxt = !fov
      ? "COV(D): —"
      : `COV(D): ±${maxFieldStrict.toFixed(1)}° (geom ${maxFieldGeom.toFixed(1)}° • illum ${maxFieldIllum.toFixed(1)}°) • REQ(D): ${(req ?? 0).toFixed(1)}° • IC ${icCompactTxt} / ${icTargetTxt} • ${coversStrict ? "COVERS ✅" : "NO ❌"}`;

    const meritTxt =
      `Merit: ${Number.isFinite(m) ? m.toFixed(2) : "—"} ` +
      `(RMS0 ${bd.rmsCenter?.toFixed?.(3) ?? "—"}mm • RMSedge ${bd.rmsEdge?.toFixed?.(3) ?? "—"}mm • Vig ${bd.vigPct}%` +
      `${Number.isFinite(bd.vigCenterPct) ? ` • V0 ${bd.vigCenterPct}%` : ""}` +
      `${Number.isFinite(bd.vigMidPct) ? ` • Vmid ${bd.vigMidPct}%` : ""}` +
      `${Number.isFinite(bd.reqVigPct) ? ` • Vreq ${bd.reqVigPct}%` : ""}` +
      `${Number.isFinite(bd.imageCircleDiag) ? ` • IC ${bd.imageCircleDiag.toFixed(1)}mm` : ""}` +
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
    if (ui.dist) ui.dist.textContent = `Dist: ${Number.isFinite(distPct) ? `${distPct >= 0 ? "+" : ""}${distPct.toFixed(2)}%` : "—"}`;
    if (ui.fov) ui.fov.textContent = fovTxt;
    if (ui.cov) ui.cov.textContent = coversStrict ? "COV: YES" : `COV: NO (IC ${icCompactTxt})`;
    if (ui.ic) ui.ic.textContent = `IC: ${icFullTxt}`;

    if (ui.eflTop) ui.eflTop.textContent = ui.efl?.textContent || `EFL: ${efl == null ? "—" : efl.toFixed(2)}mm`;
    if (ui.bflTop) ui.bflTop.textContent = ui.bfl?.textContent || `BFL: ${bfl == null ? "—" : bfl.toFixed(2)}mm`;
    if (ui.tstopTop) ui.tstopTop.textContent = ui.tstop?.textContent || `T≈ ${T == null ? "—" : "T" + T.toFixed(2)}`;
    if (ui.fovTop) ui.fovTop.textContent = fovTxt;
    if (ui.covTop) ui.covTop.textContent = ui.cov?.textContent || (coversStrict ? "COV: YES" : "COV: NO");
    if (ui.icTop) ui.icTop.textContent = ui.ic?.textContent || `IC: ${icFullTxt}`;
    if (ui.distTop) ui.distTop.textContent = ui.dist?.textContent || `Dist: ${Number.isFinite(distPct) ? `${distPct >= 0 ? "+" : ""}${distPct.toFixed(2)}%` : "—"}`;

    if (phys.hardFail && ui.footerWarn) {
      ui.footerWarn.textContent =
        `INVALID geometry: overlap/clearance issue (overlap ${phys.worstOverlap.toFixed(2)}mm, pinch ${phys.worstPinch.toFixed(2)}mm).`;
    } else if (phys.worstOverlap > 0.08 && ui.footerWarn) {
      ui.footerWarn.textContent =
        `Geometry warning: very tight/overlapping element pair (${phys.worstOverlap.toFixed(2)}mm). Increase air gap or reduce curvature/aperture.`;
    } else if (phys.worstPinch > 0.80 && ui.footerWarn) {
      ui.footerWarn.textContent =
        `Geometry warning: strong aperture pinch (${phys.worstPinch.toFixed(2)}mm).`;
    } else if (bd.centerVigOk === false && ui.footerWarn) {
      ui.footerWarn.textContent =
        `Center vignette too high (${bd.vigCenterPct ?? "—"}%). Increase middle/stop apertures.`;
    } else if (!bd.imageCircleOk && ui.footerWarn) {
      ui.footerWarn.textContent =
        `Image circle too small (illum): ${icDiagTxt}${icSplit ? `, geom is ${icGeomTxt}` : ""}. Required: ${icTargetTxt} (target >= ${IMAGE_CIRCLE_CFG.minDiagMm.toFixed(0)}mm for full frame).`;
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
    expandMiddleApertures(lens.surfaces);
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
    expandMiddleApertures(lens.surfaces);
    clampAllApertures(lens.surfaces);
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
    expandMiddleApertures(lens.surfaces);
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
      expandMiddleApertures(lens.surfaces);
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
    const target = num(prompt("Target focal length (mm)?", "75"), NaN);
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
    expandMiddleApertures(lens.surfaces);
    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    toast(`Scaled ×${k.toFixed(3)} → ${target.toFixed(1)}mm`);
  }

  function setTStop() {
    const targetT = num(prompt("Target T-stop?", "2.0"), NaN);
    if (!Number.isFinite(targetT) || targetT <= 0.2) return;

    const stopIdx = findStopSurfaceIndex(lens.surfaces);
    if (stopIdx < 0) return toast("No STOP surface selected");

    const wave = ui.wavePreset?.value || "d";
    computeVertices(lens.surfaces, 0, 0);
    const { efl } = estimateEflBflParaxial(lens.surfaces, wave);
    if (!Number.isFinite(efl) || efl <= 1) return toast("Set T failed (EFL not solvable)");

    let desiredStopAp = efl / (2 * targetT);
    lens.surfaces[stopIdx].ap = desiredStopAp;

    // Iterate a few times so effective T (after clipping) gets closer to target.
    for (let iter = 0; iter < 6; iter++) {
      expandMiddleApertures(lens.surfaces, { targetStopAp: desiredStopAp });
      clampAllApertures(lens.surfaces);
      computeVertices(lens.surfaces, 0, 0);

      const tNow = estimateTStopApprox(efl, lens.surfaces, wave);
      if (!Number.isFinite(tNow)) break;
      if (tNow <= targetT * 1.01) break;

      const factor = clamp(tNow / targetT, 1.02, 1.35);
      desiredStopAp *= factor;
      lens.surfaces[stopIdx].ap *= factor;
    }

    expandMiddleApertures(lens.surfaces, { targetStopAp: desiredStopAp });
    clampAllApertures(lens.surfaces);
    buildTable();
    renderAll();
    const tFinal = estimateTStopApprox(efl, lens.surfaces, wave);
    toast(`STOP ap → ${lens.surfaces[stopIdx].ap.toFixed(2)} (T≈${Number.isFinite(tFinal) ? tFinal.toFixed(2) : targetT.toFixed(2)})`);
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

  // -------------------- autodesigner v2 --------------------
  const AD_CFG = {
    sensorPresetName: "ARRI Alexa Mini LF (LF)",
    sensorW: 36.7,
    sensorH: 25.54,
    bflMinMm: 52.0,
    focusNearMm: 2000.0,
    shiftMaxMm: 8.0,
    eflHardTolFrac: 0.11,
    eflQuickTolFrac: 0.16,
    tSlackFrac: 0.01,
    tQuickSlackFrac: 0.06,
    minRadiusAbs: 8.0,
    maxRadiusAbs: 2000.0,
    seedGlassMin: 1.5,
    seedGlassMax: 12.0,
    seedAirMin: 0.2,
    seedAirMax: 25.0,
    maxGlassThicknessMm: 22.0,
    maxAirGapMm: 140.0,
    minRearGapMm: 52.5,
    maxSurfaceApMm: 34.0,
    maxRearSurfaceApMm: 22.0,
    seedCount: 56,
    minValidSeeds: 8,
    topK: 5,
    optimizeIters: 560,
    invalidRestartEvery: 120,
    logEvery: 48,
    fullEvalStride: 4,
    tempStart: 2.2,
    tempEnd: 0.14,
    quickRayCount: 17,
    fullRayCount: 31,
    focusWeightInf: 0.70,
    focusWeightNear: 0.30,
    distWeight: 1.5,
    vigWeight: 95.0,
    physWeight: 1.0,
    eflWeight: 1600.0,
    tSlowWeight: 2400.0,
    tFastWeight: 220.0,
    bflWeight: 2400.0,
    covWeight: 2600.0,
    focusTravelWeight: 40.0,
    centerRmsWeight: 3400.0,
    centerRmsMaxInf: 0.16,
    centerRmsMaxNear: 0.20,
    midRmsWeight: 900.0,
    midRmsMaxInf: 0.32,
    midRmsMaxNear: 0.38,
    guardFailPenalty: 900000.0,
    maxSurfaceCount: 32,
  };
  const AD_BUILD_TAG = "v2-rescue-r19";

  const AD_GLASS_CLASSES = {
    CROWN: ["N-BK7HT", "N-BAK4", "N-BAK2", "N-K5", "N-PSK3", "N-SK14"],
    FLINT: ["N-F2", "N-SF2", "N-SF5", "N-SF10", "N-LASF43", "N-LASF44"],
    HIGH_INDEX_CROWN: ["N-LAK9", "N-LAK22", "N-BAF10", "N-SK16", "N-LAK28"],
  };

  let adRunning = false;
  let adBest = null;
  let adDetailsCollapsed = false;
  let adLogExpanded = false;

  function setADLog(text) {
    if (!ui.adLog) return;
    ui.adLog.value = String(text || "");
    ui.adLog.scrollTop = ui.adLog.scrollHeight;
  }

  function appendADLog(line) {
    if (!ui.adLog) return;
    const prev = String(ui.adLog.value || "").trim();
    const next = prev ? `${prev}\n${line}` : String(line || "");
    ui.adLog.value = next;
    ui.adLog.scrollTop = ui.adLog.scrollHeight;
  }

  function adYield() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function adSetRunningUI(isRunning) {
    if (ui.btnAutoDesign) ui.btnAutoDesign.disabled = !!isRunning;
    if (ui.btnAutoDesignRefine) ui.btnAutoDesignRefine.disabled = !!isRunning;
    if (ui.btnAutoDesignStop) ui.btnAutoDesignStop.disabled = !isRunning;
    if (ui.btnAutoDesignPreview) ui.btnAutoDesignPreview.disabled = !!isRunning || !adBest?.lens;
  }

  function setAdDetailsCollapsed(collapsed) {
    adDetailsCollapsed = !!collapsed;
    ui.surfaceTableWrap?.classList.toggle("isHidden", adDetailsCollapsed);
    ui.statusPanel?.classList.toggle("isHidden", adDetailsCollapsed);
    if (ui.btnAdToggleDetails) {
      ui.btnAdToggleDetails.textContent = adDetailsCollapsed ? "Show details" : "Collapse details";
    }
  }

  function toggleAdDetailsCollapsed() {
    setAdDetailsCollapsed(!adDetailsCollapsed);
    scheduleAutosave();
  }

  function setAdLogExpanded(expanded) {
    adLogExpanded = !!expanded;
    ui.adLog?.classList.toggle("adLogExpanded", adLogExpanded);
    if (ui.btnAdLogExpand) {
      ui.btnAdLogExpand.textContent = adLogExpanded ? "Normal log" : "Bigger log";
    }
  }

  function toggleAdLogExpanded() {
    setAdLogExpanded(!adLogExpanded);
    if (adLogExpanded) setAdDetailsCollapsed(true);
    scheduleAutosave();
  }

  function adNormalizeFocusTarget(v) {
    const s = String(v || "both").trim().toLowerCase();
    if (s === "inf" || s === "infinity") return "inf";
    if (s === "near" || s === "2000" || s === "2m") return "near";
    return "both";
  }

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function randn() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  function pick(arr) {
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr[(Math.random() * arr.length) | 0];
  }

  function pickWeighted(entries) {
    if (!Array.isArray(entries) || !entries.length) return null;
    let total = 0;
    for (const e of entries) total += Math.max(0, Number(e?.w || 0));
    if (total <= 0) return entries[0]?.id || null;
    let r = Math.random() * total;
    for (const e of entries) {
      const w = Math.max(0, Number(e?.w || 0));
      r -= w;
      if (r <= 0) return e.id;
    }
    return entries[entries.length - 1]?.id || null;
  }

  function clampSignedRadius(v, minAbs = AD_CFG.minRadiusAbs, maxAbs = AD_CFG.maxRadiusAbs) {
    const x = Number(v || 0);
    if (!Number.isFinite(x) || Math.abs(x) < 1e-9) return minAbs;
    const s = x >= 0 ? 1 : -1;
    return s * clamp(Math.abs(x), minAbs, maxAbs);
  }

  function adMaxThicknessForSurface(s) {
    return airOrGlass(s?.glass) === "AIR"
      ? Number(AD_CFG.maxAirGapMm || 120)
      : Number(AD_CFG.maxGlassThicknessMm || 24);
  }

  function adClampThicknessForSurface(s, value, minThickness = PHYS_CFG.minThickness) {
    const lo = Number(minThickness || PHYS_CFG.minThickness);
    const hi = Math.max(lo, adMaxThicknessForSurface(s));
    return clamp(Number(value || 0), lo, hi);
  }

  function adRearSurfaceIndex(surfaces) {
    if (!Array.isArray(surfaces)) return -1;
    for (let i = surfaces.length - 1; i >= 0; i--) {
      const t = String(surfaces[i]?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      return i;
    }
    return -1;
  }

  function adEnforceRearGap(surfaces, minRearGapMm) {
    if (!Array.isArray(surfaces) || !surfaces.length) return;
    const gapMin = Number(minRearGapMm || 0);
    if (!(gapMin > 0)) return;
    const rearIdx = adRearSurfaceIndex(surfaces);
    if (rearIdx < 0) return;
    const rear = surfaces[rearIdx];
    rear.glass = "AIR";
    rear.t = adClampThicknessForSurface(rear, Math.max(Number(rear.t || 0), gapMin), Math.max(PHYS_CFG.minStopSideAirGap, PHYS_CFG.minThickness));
  }

  function airOrGlass(g) {
    return String(resolveGlassName(g || "AIR")).toUpperCase() === "AIR" ? "AIR" : "GLASS";
  }

  function classifyGlass(g) {
    const key = resolveGlassName(g || "AIR");
    if (AD_GLASS_CLASSES.FLINT.includes(key)) return "FLINT";
    if (AD_GLASS_CLASSES.HIGH_INDEX_CROWN.includes(key)) return "HIGH_INDEX_CROWN";
    return "CROWN";
  }

  function pickGlassByClass(cls) {
    const arr = AD_GLASS_CLASSES[cls] || AD_GLASS_CLASSES.CROWN;
    return resolveGlassName(pick(arr) || "N-BK7HT");
  }

  function pickNearbyGlass(g) {
    return pickGlassByClass(classifyGlass(g));
  }

  function adStopApFromTarget(targetEfl, targetT) {
    const f = Math.max(10, Number(targetEfl || 50));
    const t = Math.max(0.9, Number(targetT || 2.0));
    return clamp((f / t) * 0.5, PHYS_CFG.minAperture, PHYS_CFG.maxAperture * 0.86);
  }

  function adClampElementAperturesByZone(surfaces, opts = {}) {
    if (!Array.isArray(surfaces) || !surfaces.length) return;
    const stopIdx = findStopSurfaceIndex(surfaces);
    const targetStopAp = Number.isFinite(opts.targetStopAp) ? Number(opts.targetStopAp) : null;
    let stopAp = stopIdx >= 0 ? Number(surfaces[stopIdx]?.ap || 0) : 0;
    if (!Number.isFinite(stopAp) || stopAp <= 0) stopAp = targetStopAp != null ? targetStopAp : 8;
    if (!Number.isFinite(stopAp) || stopAp <= 0) return;

    const targetEfl = Number(opts.targetEfl || 50);
    const wide = targetEfl <= 28.5;
    const apCapGlobal = Math.max(PHYS_CFG.minAperture, Number(AD_CFG.maxSurfaceApMm || 24));
    const apCapRear = Math.max(PHYS_CFG.minAperture, Math.min(apCapGlobal, Number(AD_CFG.maxRearSurfaceApMm || 18)));

    const physIdx = [];
    for (let i = 0; i < surfaces.length; i++) {
      const t = String(surfaces[i]?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      physIdx.push(i);
    }
    if (!physIdx.length) return;
    const lastPhys = physIdx[physIdx.length - 1];

    for (const i of physIdx) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "STOP") continue;
      const dist = stopIdx >= 0 ? Math.abs(i - stopIdx) : 99;
      let capMul = 1.85;
      let floorMul = 1.08;
      if (stopIdx >= 0) {
        if (i < stopIdx) {
          if (dist <= 1) {
            capMul = 1.9;
            floorMul = 1.20;
          } else if (dist <= 3) {
            capMul = wide ? 2.30 : 2.10;
            floorMul = wide ? 1.36 : 1.28;
          } else {
            capMul = wide ? 2.50 : 2.20;
            floorMul = wide ? 1.48 : 1.34;
          }
        } else if (i > stopIdx) {
          if (dist <= 1) {
            capMul = 1.75;
            floorMul = 1.15;
          } else if (dist <= 3) {
            capMul = 1.62;
            floorMul = 1.08;
          } else {
            capMul = 1.50;
            floorMul = 1.03;
          }
        }
      }

      if (Math.abs(Number(s.R || 0)) >= 1e-9) {
        const desiredFloor = Math.min(apCapGlobal, stopAp * floorMul);
        const needR = desiredFloor / Math.max(1e-9, AP_SAFETY) * 1.02;
        if (Math.abs(Number(s.R || 0)) < needR) {
          const sign = Number(s.R || 0) >= 0 ? 1 : -1;
          s.R = sign * clamp(needR, AD_CFG.minRadiusAbs, AD_CFG.maxRadiusAbs);
        }
      }

      let cap = Math.min(apCapGlobal, stopAp * capMul, maxApForSurface(s));
      if (i === lastPhys) cap = Math.min(cap, apCapRear);
      const floor = Math.min(
        cap,
        Math.max(PHYS_CFG.minAperture, stopAp * floorMul),
      );
      s.ap = clamp(Number(s.ap || 0), floor, cap);
    }
  }

  function adZoneFloorMul(i, stopIdx, targetEfl = 50) {
    if (stopIdx < 0) return 1.08;
    const wide = Number(targetEfl || 50) <= 28.5;
    const dist = Math.abs(i - stopIdx);
    if (i < stopIdx) {
      if (dist <= 1) return 1.20;
      if (dist <= 3) return wide ? 1.36 : 1.28;
      return wide ? 1.48 : 1.34;
    }
    if (i > stopIdx) {
      if (dist <= 1) return 1.15;
      if (dist <= 3) return 1.08;
      return 1.03;
    }
    return 1.12;
  }

  function adForceFixedSensorPreset() {
    if (ui.sensorPreset) ui.sensorPreset.value = AD_CFG.sensorPresetName;
    applyPreset(AD_CFG.sensorPresetName);
    if (ui.sensorW) ui.sensorW.value = AD_CFG.sensorW.toFixed(2);
    if (ui.sensorH) ui.sensorH.value = AD_CFG.sensorH.toFixed(2);
    applySensorToIMS();
  }

  function adCreateBuilder(templateName, targetEfl, targetT) {
    const f = clamp(Number(targetEfl || 50), 16, 180);
    const stopAp = adStopApFromTarget(f, targetT);
    const surfaces = [
      { type: "OBJ", R: 0.0, t: 0.0, ap: 70.0, glass: "AIR", stop: false },
    ];

    function addSinglet(power, opts = {}) {
      const positive = power === "pos";
      const sign = positive ? 1 : -1;
      const r1Mul = randRange(opts.r1Min ?? 0.5, opts.r1Max ?? 2.4);
      const r2Mul = randRange(opts.r2Min ?? 0.8, opts.r2Max ?? 3.0);

      let R1 = sign * clamp(f * r1Mul, AD_CFG.minRadiusAbs, AD_CFG.maxRadiusAbs);
      let R2 = -sign * clamp(f * r2Mul, AD_CFG.minRadiusAbs, AD_CFG.maxRadiusAbs);
      if (opts.flip) [R1, R2] = [R2, R1];

      const tG = clamp(
        f * randRange(opts.tgMin ?? 0.03, opts.tgMax ?? 0.14),
        AD_CFG.seedGlassMin,
        AD_CFG.seedGlassMax,
      );
      const tAir = clamp(
        f * randRange(opts.taMin ?? 0.01, opts.taMax ?? 0.18),
        AD_CFG.seedAirMin,
        AD_CFG.seedAirMax,
      );
      const ap = clamp(
        stopAp * randRange(opts.apMin ?? 1.15, opts.apMax ?? 1.75),
        PHYS_CFG.minAperture,
        PHYS_CFG.maxAperture,
      );
      const g = resolveGlassName(opts.glass || pickGlassByClass(opts.glassClass || (positive ? "CROWN" : "FLINT")));

      surfaces.push({ type: "", R: R1, t: tG, ap, glass: g, stop: false });
      surfaces.push({ type: "", R: R2, t: tAir, ap, glass: "AIR", stop: false });
    }

    function addStop(opts = {}) {
      const ap = clamp(
        stopAp * randRange(opts.apMin ?? 0.95, opts.apMax ?? 1.05),
        PHYS_CFG.minAperture,
        PHYS_CFG.maxAperture * 0.92,
      );
      const tAfter = clamp(
        f * randRange(opts.taMin ?? 0.02, opts.taMax ?? 0.12),
        PHYS_CFG.minStopSideAirGap,
        12,
      );
      surfaces.push({ type: "STOP", R: 0.0, t: tAfter, ap, glass: "AIR", stop: true });
    }

    function finish() {
      const rearGapMin = Math.max(AD_CFG.bflMinMm + 0.25, Number(AD_CFG.minRearGapMm || 0));
      const rearGapSeed = rearGapMin + randRange(0.0, 8.0);
      const rearIdx = surfaces.length - 1;
      if (rearIdx >= 1) {
        const rear = surfaces[rearIdx];
        rear.glass = "AIR";
        rear.t = adClampThicknessForSurface(
          rear,
          Math.max(Number(rear.t || 0), rearGapSeed),
          Math.max(PHYS_CFG.minStopSideAirGap, PHYS_CFG.minThickness),
        );
      }
      surfaces.push({
        type: "IMS",
        R: 0.0,
        t: 0.0,
        ap: AD_CFG.sensorH * 0.5,
        glass: "AIR",
        stop: false,
      });
      return sanitizeLens({ name: templateName, surfaces });
    }

    return { f, stopAp, surfaces, addSinglet, addStop, finish };
  }

  function adTemplateGauss(cfg) {
    const b = adCreateBuilder("AD Seed • Double-Gauss", cfg.targetEfl, cfg.targetT);
    b.addSinglet("pos", { glassClass: "HIGH_INDEX_CROWN", r1Min: 0.70, r1Max: 1.25, r2Min: 1.8, r2Max: 3.5, apMin: 1.45, apMax: 1.90, tgMin: 0.06, tgMax: 0.14, taMin: 0.03, taMax: 0.12 });
    b.addSinglet("neg", { glassClass: "FLINT", r1Min: 0.46, r1Max: 0.95, r2Min: 0.52, r2Max: 1.15, apMin: 1.25, apMax: 1.70, tgMin: 0.04, tgMax: 0.10, taMin: 0.02, taMax: 0.09 });
    b.addStop({ apMin: 0.96, apMax: 1.02, taMin: 0.03, taMax: 0.10 });
    b.addSinglet("neg", { glassClass: "FLINT", r1Min: 0.50, r1Max: 1.05, r2Min: 0.45, r2Max: 1.00, apMin: 1.20, apMax: 1.65, tgMin: 0.04, tgMax: 0.10, taMin: 0.02, taMax: 0.09 });
    b.addSinglet("pos", { glassClass: "CROWN", r1Min: 0.85, r1Max: 1.40, r2Min: 1.6, r2Max: 3.2, apMin: 1.35, apMax: 1.80, tgMin: 0.05, tgMax: 0.12, taMin: 0.02, taMax: 0.08 });
    return b.finish();
  }

  function adTemplateBiotar(cfg) {
    const b = adCreateBuilder("AD Seed • Biotar", cfg.targetEfl, cfg.targetT);
    b.addSinglet("pos", { glassClass: "HIGH_INDEX_CROWN", r1Min: 0.55, r1Max: 1.00, r2Min: 1.2, r2Max: 2.4, apMin: 1.45, apMax: 2.00, tgMin: 0.07, tgMax: 0.16, taMin: 0.03, taMax: 0.11 });
    b.addSinglet("neg", { glassClass: "FLINT", r1Min: 0.38, r1Max: 0.85, r2Min: 0.42, r2Max: 0.92, apMin: 1.25, apMax: 1.75, tgMin: 0.05, tgMax: 0.11, taMin: 0.02, taMax: 0.08 });
    b.addStop({ apMin: 0.95, apMax: 1.03, taMin: 0.03, taMax: 0.10 });
    b.addSinglet("neg", { glassClass: "FLINT", r1Min: 0.42, r1Max: 0.95, r2Min: 0.38, r2Max: 0.90, apMin: 1.20, apMax: 1.65, tgMin: 0.04, tgMax: 0.10, taMin: 0.02, taMax: 0.08 });
    b.addSinglet("pos", { glassClass: "HIGH_INDEX_CROWN", r1Min: 0.60, r1Max: 1.10, r2Min: 1.3, r2Max: 2.6, apMin: 1.25, apMax: 1.75, tgMin: 0.05, tgMax: 0.13, taMin: 0.02, taMax: 0.08 });
    return b.finish();
  }

  function adTemplateSonnar(cfg) {
    const b = adCreateBuilder("AD Seed • Sonnar/Ernostar", cfg.targetEfl, cfg.targetT);
    b.addSinglet("pos", { glassClass: "HIGH_INDEX_CROWN", r1Min: 0.55, r1Max: 1.00, r2Min: 1.3, r2Max: 2.8, apMin: 1.55, apMax: 2.10, tgMin: 0.08, tgMax: 0.18, taMin: 0.02, taMax: 0.09 });
    b.addSinglet("pos", { glassClass: "CROWN", r1Min: 0.70, r1Max: 1.40, r2Min: 1.6, r2Max: 3.4, apMin: 1.35, apMax: 1.90, tgMin: 0.06, tgMax: 0.14, taMin: 0.02, taMax: 0.08 });
    b.addStop({ apMin: 0.94, apMax: 1.03, taMin: 0.03, taMax: 0.10 });
    b.addSinglet("neg", { glassClass: "FLINT", r1Min: 0.55, r1Max: 1.10, r2Min: 0.55, r2Max: 1.30, apMin: 1.20, apMax: 1.65, tgMin: 0.04, tgMax: 0.11, taMin: 0.03, taMax: 0.11 });
    b.addSinglet("pos", { glassClass: "CROWN", r1Min: 0.90, r1Max: 2.20, r2Min: 2.0, r2Max: 5.5, apMin: 1.15, apMax: 1.55, tgMin: 0.03, tgMax: 0.09, taMin: 0.02, taMax: 0.09 });
    return b.finish();
  }

  function adTemplateTelephoto(cfg) {
    const b = adCreateBuilder("AD Seed • Telephoto", cfg.targetEfl, cfg.targetT);
    b.addSinglet("pos", { glassClass: "HIGH_INDEX_CROWN", r1Min: 0.70, r1Max: 1.35, r2Min: 1.8, r2Max: 4.0, apMin: 1.45, apMax: 1.95, tgMin: 0.08, tgMax: 0.20, taMin: 0.03, taMax: 0.16 });
    b.addStop({ apMin: 0.94, apMax: 1.02, taMin: 0.03, taMax: 0.12 });
    b.addSinglet("neg", { glassClass: "FLINT", r1Min: 0.42, r1Max: 0.95, r2Min: 0.45, r2Max: 1.20, apMin: 1.10, apMax: 1.55, tgMin: 0.05, tgMax: 0.11, taMin: 0.03, taMax: 0.16 });
    b.addSinglet("neg", { glassClass: "FLINT", r1Min: 0.55, r1Max: 1.30, r2Min: 0.60, r2Max: 1.60, apMin: 1.10, apMax: 1.45, tgMin: 0.03, tgMax: 0.09, taMin: 0.04, taMax: 0.20 });
    b.addSinglet("pos", { glassClass: "CROWN", r1Min: 1.10, r1Max: 3.20, r2Min: 2.4, r2Max: 8.0, apMin: 1.05, apMax: 1.35, tgMin: 0.02, tgMax: 0.06, taMin: 0.03, taMax: 0.15 });
    return b.finish();
  }

  function adTemplateRetrofocus(cfg) {
    const b = adCreateBuilder("AD Seed • Retrofocus", cfg.targetEfl, cfg.targetT);
    b.addSinglet("neg", { glassClass: "FLINT", r1Min: 0.22, r1Max: 0.58, r2Min: 0.24, r2Max: 0.72, apMin: 1.95, apMax: 2.80, tgMin: 0.08, tgMax: 0.22, taMin: 0.10, taMax: 0.34 });
    b.addSinglet("neg", { glassClass: "FLINT", r1Min: 0.26, r1Max: 0.74, r2Min: 0.28, r2Max: 0.82, apMin: 1.85, apMax: 2.65, tgMin: 0.07, tgMax: 0.20, taMin: 0.09, taMax: 0.30 });
    b.addStop({ apMin: 0.95, apMax: 1.04, taMin: 0.08, taMax: 0.26 });
    b.addSinglet("pos", { glassClass: "HIGH_INDEX_CROWN", r1Min: 0.26, r1Max: 0.62, r2Min: 0.62, r2Max: 1.45, apMin: 1.45, apMax: 2.10, tgMin: 0.09, tgMax: 0.24, taMin: 0.06, taMax: 0.22 });
    b.addSinglet("neg", { glassClass: "FLINT", r1Min: 0.70, r1Max: 1.65, r2Min: 0.70, r2Max: 1.70, apMin: 1.25, apMax: 1.90, tgMin: 0.05, tgMax: 0.14, taMin: 0.06, taMax: 0.22 });
    b.addSinglet("pos", { glassClass: "CROWN", r1Min: 0.66, r1Max: 1.55, r2Min: 1.3, r2Max: 3.6, apMin: 1.18, apMax: 1.70, tgMin: 0.05, tgMax: 0.14, taMin: 0.06, taMax: 0.20 });
    b.addSinglet("pos", { glassClass: "CROWN", r1Min: 1.10, r1Max: 3.20, r2Min: 2.0, r2Max: 7.5, apMin: 1.08, apMax: 1.45, tgMin: 0.03, tgMax: 0.09, taMin: 0.10, taMax: 0.34 });
    return b.finish();
  }

  function adTemplateDistagon(cfg) {
    const b = adCreateBuilder("AD Seed • Distagon", cfg.targetEfl, cfg.targetT);
    b.addSinglet("neg", { glassClass: "FLINT", r1Min: 0.20, r1Max: 0.56, r2Min: 0.24, r2Max: 0.68, apMin: 2.00, apMax: 2.85, tgMin: 0.08, tgMax: 0.23, taMin: 0.10, taMax: 0.34 });
    b.addSinglet("neg", { glassClass: "FLINT", r1Min: 0.28, r1Max: 0.82, r2Min: 0.30, r2Max: 0.90, apMin: 1.80, apMax: 2.50, tgMin: 0.07, tgMax: 0.19, taMin: 0.08, taMax: 0.26 });
    b.addSinglet("pos", { glassClass: "HIGH_INDEX_CROWN", r1Min: 0.44, r1Max: 0.96, r2Min: 1.0, r2Max: 2.2, apMin: 1.55, apMax: 2.15, tgMin: 0.07, tgMax: 0.18, taMin: 0.05, taMax: 0.18 });
    b.addStop({ apMin: 0.95, apMax: 1.04, taMin: 0.08, taMax: 0.24 });
    b.addSinglet("pos", { glassClass: "HIGH_INDEX_CROWN", r1Min: 0.30, r1Max: 0.78, r2Min: 0.7, r2Max: 1.7, apMin: 1.40, apMax: 1.95, tgMin: 0.07, tgMax: 0.18, taMin: 0.05, taMax: 0.16 });
    b.addSinglet("neg", { glassClass: "FLINT", r1Min: 0.70, r1Max: 1.70, r2Min: 0.70, r2Max: 1.90, apMin: 1.20, apMax: 1.70, tgMin: 0.05, tgMax: 0.13, taMin: 0.05, taMax: 0.16 });
    b.addSinglet("pos", { glassClass: "CROWN", r1Min: 0.90, r1Max: 2.50, r2Min: 1.8, r2Max: 5.8, apMin: 1.10, apMax: 1.45, tgMin: 0.03, tgMax: 0.09, taMin: 0.10, taMax: 0.32 });
    return b.finish();
  }

  function adTemplatePlBase(cfg) {
    const L = sanitizeLens(clone(omit50ConceptV1()));
    L.name = "AD Seed • PL Base (OMIT50)";
    const s = L.surfaces;
    const stopApTarget = adStopApFromTarget(cfg.targetEfl, cfg.targetT);

    for (let i = 0; i < 5; i++) {
      adQuickSanity(s, {
        targetStopAp: stopApTarget,
        minRearGap: Math.max(AD_CFG.minRearGapMm, AD_CFG.bflMinMm + 0.25),
        targetEfl: cfg.targetEfl,
      });
      adScaleTowardTargetEfl(s, cfg.targetEfl, cfg.wavePreset || "d");
      adNudgeStopToTargetT(s, cfg.targetT, cfg.wavePreset || "d");
      adNudgeBflForPL(s, cfg);
      adNudgeCoverage(s, cfg.sensorW, cfg.sensorH, cfg.wavePreset || "d", cfg.quickRayCount || AD_CFG.quickRayCount, {
        targetEfl: cfg.targetEfl,
        targetT: cfg.targetT,
      });
    }
    adQuickSanity(s, {
      targetStopAp: stopApTarget,
      minRearGap: Math.max(AD_CFG.minRearGapMm, AD_CFG.bflMinMm + 0.25),
      targetEfl: cfg.targetEfl,
    });
    return sanitizeLens(L);
  }

  function adFamilyPool(targetEfl, targetT, bflMinMm = AD_CFG.bflMinMm) {
    const f = Number(targetEfl || 50);
    const t = Number(targetT || 2.0);
    const bfl = Math.max(1, Number(bflMinMm || AD_CFG.bflMinMm || 52));
    const retroPressure = bfl / Math.max(1, f);
    if (retroPressure >= 1.12) {
      if (f <= 50) {
        return [
          { id: "plbase", w: 8 },
          { id: "distagon", w: 9 },
          { id: "retrofocus", w: 9 },
          { id: "gauss", w: 1 },
          { id: "biotar", w: 1 },
        ];
      }
      return [
        { id: "plbase", w: 6 },
        { id: "distagon", w: 7 },
        { id: "retrofocus", w: 7 },
        { id: "gauss", w: 2 },
        { id: "sonnar", w: 2 },
        { id: "telephoto", w: 1 },
      ];
    }
    if (f <= 28) {
      return [
        { id: "retrofocus", w: 6 },
        { id: "distagon", w: 5 },
        { id: "gauss", w: 1 },
      ];
    }
    if (f <= 36) {
      return [
        { id: "plbase", w: 5 },
        { id: "distagon", w: 4 },
        { id: "retrofocus", w: 4 },
        { id: "gauss", w: 3 },
        { id: "biotar", w: 2 },
        { id: "sonnar", w: 2 },
      ];
    }
    if (f <= 65) {
      return [
        { id: "plbase", w: 8 },
        { id: "gauss", w: 6 },
        { id: "biotar", w: 5 },
        { id: "sonnar", w: 3 },
        { id: "distagon", w: 1 },
        { id: "telephoto", w: 1 },
      ];
    }
    if (f >= 75) {
      return [
        { id: "telephoto", w: 6 },
        { id: "sonnar", w: 4 },
        { id: "gauss", w: 2 },
        { id: "biotar", w: 1 },
      ];
    }
    const speedBias = t <= 2.0 ? 1.0 : 0.7;
    return [
      { id: "plbase", w: 4 + speedBias },
      { id: "sonnar", w: 4 + speedBias },
      { id: "gauss", w: 4 + speedBias },
      { id: "telephoto", w: 3 + speedBias },
      { id: "biotar", w: 2 + speedBias },
    ];
  }

  function adBuildTemplateByFamily(family, cfg) {
    if (family === "plbase") return adTemplatePlBase(cfg);
    if (family === "gauss") return adTemplateGauss(cfg);
    if (family === "biotar") return adTemplateBiotar(cfg);
    if (family === "sonnar") return adTemplateSonnar(cfg);
    if (family === "telephoto") return adTemplateTelephoto(cfg);
    if (family === "retrofocus") return adTemplateRetrofocus(cfg);
    if (family === "distagon") return adTemplateDistagon(cfg);
    return adTemplateGauss(cfg);
  }

  function adEnsureSingleStop(surfaces) {
    if (!Array.isArray(surfaces) || !surfaces.length) return -1;
    let stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) {
      for (let i = 1; i < surfaces.length - 1; i++) {
        const t = String(surfaces[i]?.type || "").toUpperCase();
        if (t === "OBJ" || t === "IMS") continue;
        stopIdx = i;
        break;
      }
    }
    if (stopIdx < 0) return -1;
    surfaces.forEach((s, i) => { s.stop = i === stopIdx; });
    const sStop = surfaces[stopIdx];
    sStop.type = "STOP";
    sStop.R = 0;
    sStop.glass = "AIR";
    sStop.stop = true;
    if (stopIdx > 0) surfaces[stopIdx - 1].glass = "AIR";
    if (Number(sStop.t || 0) < PHYS_CFG.minStopSideAirGap) sStop.t = PHYS_CFG.minStopSideAirGap;
    return stopIdx;
  }

  function adQuickSanity(surfaces, opts = {}) {
    if (!Array.isArray(surfaces)) return;
    const targetStopAp = Number.isFinite(opts.targetStopAp) ? Number(opts.targetStopAp) : null;
    const minRearGap = Number.isFinite(opts.minRearGap) ? Number(opts.minRearGap) : 0;
    const targetEfl = Number.isFinite(opts.targetEfl) ? Number(opts.targetEfl) : 50;
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ") {
        s.type = "OBJ";
        s.t = 0;
        s.glass = "AIR";
        s.stop = false;
        continue;
      }
      if (t === "IMS") {
        s.type = "IMS";
        s.t = 0;
        s.glass = "AIR";
        s.ap = AD_CFG.sensorH * 0.5;
        s.stop = false;
        continue;
      }
      const minT = t === "STOP" ? PHYS_CFG.minStopSideAirGap : PHYS_CFG.minThickness;
      s.t = adClampThicknessForSurface(s, Number(s.t || 0), minT);
      s.ap = clamp(Number(s.ap || 0), PHYS_CFG.minAperture * 0.8, PHYS_CFG.maxAperture);
      s.glass = resolveGlassName(s.glass);
      if (Math.abs(Number(s.R || 0)) >= 1e-9) s.R = clampSignedRadius(Number(s.R || 0));
    }

    adEnforceRearGap(surfaces, minRearGap);

    const stopIdx = adEnsureSingleStop(surfaces);
    if (stopIdx >= 0) {
      const sStop = surfaces[stopIdx];
      if (targetStopAp != null) sStop.ap = Math.max(Number(sStop.ap || 0), targetStopAp * 0.94);
      sStop.ap = clamp(Number(sStop.ap || 0), PHYS_CFG.minAperture, PHYS_CFG.maxAperture * 0.92);
      if (stopIdx > 0) {
        const sPrev = surfaces[stopIdx - 1];
        sPrev.t = adClampThicknessForSurface(sPrev, Number(sPrev.t || 0), PHYS_CFG.minStopSideAirGap);
      }
      sStop.t = adClampThicknessForSurface(sStop, Number(sStop.t || 0), PHYS_CFG.minStopSideAirGap);
    }

    adRepairGeometryGaps(surfaces, targetStopAp, targetEfl);
    adEnforceRearGap(surfaces, minRearGap);
    adClampElementAperturesByZone(surfaces, { targetStopAp, targetEfl });

    clampAllApertures(surfaces);
    clampGlassPairClearApertures(surfaces, PHYS_CFG.minGlassCT, 0.985);
    expandMiddleApertures(surfaces, { targetStopAp: targetStopAp || undefined, nearStopHeadroom: 1.14 });
    adRepairGeometryGaps(surfaces, targetStopAp, targetEfl);
    clampGlassPairClearApertures(surfaces, PHYS_CFG.minGlassCT, 0.975);
    clampAllApertures(surfaces);
  }

  function adRepairGeometryGaps(surfaces, targetStopAp = null, targetEfl = 50) {
    if (!Array.isArray(surfaces) || surfaces.length < 3) return;
    const stopIdx = findStopSurfaceIndex(surfaces);
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      computeVertices(surfaces, 0, 0);
      for (let i = 0; i < surfaces.length - 1; i++) {
        const a = surfaces[i];
        const b = surfaces[i + 1];
        const ta = String(a?.type || "").toUpperCase();
        const tb = String(b?.type || "").toUpperCase();
        if (ta === "OBJ" || ta === "IMS" || tb === "OBJ" || tb === "IMS") continue;

        const medium = String(resolveGlassName(a?.glass || "AIR")).toUpperCase();
        const req = medium === "AIR" ? PHYS_CFG.minAirGap : PHYS_CFG.minGlassCT;
        const floorMul = adZoneFloorMul(i, stopIdx, targetEfl);
        const pairFloor = Number.isFinite(targetStopAp)
          ? Math.max(PHYS_CFG.minAperture, Number(targetStopAp) * floorMul)
          : PHYS_CFG.minAperture;

        for (const s of [a, b]) {
          if (Math.abs(Number(s.R || 0)) < 1e-9) continue;
          const needR = pairFloor / Math.max(1e-9, AP_SAFETY) * 1.03;
          if (Math.abs(Number(s.R || 0)) < needR) {
            const sign = Number(s.R || 0) >= 0 ? 1 : -1;
            s.R = sign * clamp(needR, AD_CFG.minRadiusAbs, AD_CFG.maxRadiusAbs);
            changed = true;
          }
          if (Number(s.ap || 0) < pairFloor) {
            s.ap = pairFloor;
            changed = true;
          }
        }

        let yRef = Math.max(0.2, Math.min(Number(a.ap || 0), Number(b.ap || 0)));
        if (Number.isFinite(targetStopAp)) {
          yRef = Math.max(yRef, pairFloor);
          yRef = Math.min(yRef, Math.max(1.0, Number(targetStopAp) * 1.85));
        }

        const xa = surfaceXatY(a, yRef);
        const xb = surfaceXatY(b, yRef);
        if (!Number.isFinite(xa) || !Number.isFinite(xb)) {
          for (const s of [a, b]) {
            if (Math.abs(Number(s.R || 0)) < 1e-9) continue;
            const needR = yRef * 1.08;
            if (Math.abs(Number(s.R || 0)) < needR) {
              const sign = Number(s.R || 0) >= 0 ? 1 : -1;
              s.R = sign * clamp(needR, AD_CFG.minRadiusAbs, AD_CFG.maxRadiusAbs);
              changed = true;
            }
          }
        }

        const gap = minGapBetweenSurfaces(a, b, yRef, 11);
        if (!Number.isFinite(gap) || gap < req) {
          const deficit = (!Number.isFinite(gap) ? (req + Math.max(0.6, yRef * 0.08)) : (req - gap)) + 0.08;
          const tFloor = ta === "STOP" ? PHYS_CFG.minStopSideAirGap : PHYS_CFG.minThickness;
          a.t = adClampThicknessForSurface(a, Number(a.t || 0) + deficit, tFloor);
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  function adScaleTowardTargetEfl(surfaces, targetEfl, wavePreset) {
    if (!Array.isArray(surfaces) || !Number.isFinite(targetEfl) || targetEfl <= 1) return;
    computeVertices(surfaces, 0, 0);
    const { efl } = estimateEflBflParaxial(surfaces, wavePreset);
    if (!Number.isFinite(efl) || efl <= 1) return;
    const ratio = targetEfl / efl;
    const k = clamp(ratio, 0.25, 3.20);
    if (!Number.isFinite(k) || Math.abs(k - 1) < 0.005) return;

    for (const s of surfaces) {
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      if (Math.abs(Number(s.R || 0)) >= 1e-9) s.R = clampSignedRadius(Number(s.R || 0) * k);
      const minT = t === "STOP" ? PHYS_CFG.minStopSideAirGap : PHYS_CFG.minThickness;
      s.t = adClampThicknessForSurface(s, Number(s.t || 0) * k, minT);
      s.ap = clamp(Number(s.ap || 0) * Math.sqrt(k), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
    }
    clampAllApertures(surfaces);
  }

  function adApproxSingletPower(surfaces, i, wavePreset = "d") {
    const a = surfaces?.[i];
    const b = surfaces?.[i + 1];
    if (!a || !b) return 0;
    if (airOrGlass(a?.glass) !== "GLASS") return 0;
    if (airOrGlass(b?.glass) !== "AIR") return 0;
    const R1 = Number(a.R || 0);
    const R2 = Number(b.R || 0);
    if (Math.abs(R1) < 1e-9 || Math.abs(R2) < 1e-9) return 0;
    const n = Number(glassN(a.glass, wavePreset) || 1.5);
    return (n - 1) * ((1 / R1) - (1 / R2));
  }

  function adNudgeStopToTargetT(surfaces, targetT, wavePreset) {
    if (!Array.isArray(surfaces) || !Number.isFinite(targetT) || targetT <= 0.2) return;
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return;
    for (let i = 0; i < 3; i++) {
      computeVertices(surfaces, 0, 0);
      const { efl } = estimateEflBflParaxial(surfaces, wavePreset);
      const tNow = estimateTStopApprox(efl, surfaces, wavePreset);
      if (!Number.isFinite(efl) || !Number.isFinite(tNow)) break;
      const desired = adStopApFromTarget(efl, targetT);
      const cur = Math.max(AP_MIN, Number(surfaces[stopIdx]?.ap || AP_MIN));
      const mul = clamp(desired / cur, 0.88, 1.45);
      surfaces[stopIdx].ap = clamp(cur * mul, PHYS_CFG.minAperture, maxApForSurface(surfaces[stopIdx]));
      expandMiddleApertures(surfaces, { targetStopAp: surfaces[stopIdx].ap, nearStopHeadroom: 1.12 });
      clampAllApertures(surfaces);
      if (Math.abs(tNow - targetT) < 0.03) break;
    }
  }

  function adNudgeBflForPL(surfaces, cfg) {
    if (!Array.isArray(surfaces) || !surfaces.length) return;
    const bflMin = Number(cfg?.bflMinMm || AD_CFG.bflMinMm || 52);
    const targetEfl = Number(cfg?.targetEfl || 50);
    const targetT = Number(cfg?.targetT || 2.0);
    const wavePreset = cfg?.wavePreset || "d";

    computeVertices(surfaces, 0, 0);
    let { bfl } = estimateEflBflParaxial(surfaces, wavePreset);
    if (!Number.isFinite(bfl)) return;
    let miss = bflMin - bfl;
    if (!(miss > 0.25)) return;

    const stopIdx = findStopSurfaceIndex(surfaces);
    const singlets = [];
    for (let i = 0; i < surfaces.length - 1; i++) {
      const a = surfaces[i];
      const b = surfaces[i + 1];
      const ta = String(a?.type || "").toUpperCase();
      const tb = String(b?.type || "").toUpperCase();
      if (ta === "OBJ" || ta === "IMS" || tb === "OBJ" || tb === "IMS") continue;
      if (ta === "STOP" || tb === "STOP") continue;
      if (airOrGlass(a?.glass) !== "GLASS") continue;
      if (airOrGlass(b?.glass) !== "AIR") continue;
      singlets.push(i);
    }

    for (let pass = 0; pass < 3; pass++) {
      const airBoost = clamp(1 + miss * (pass === 0 ? 0.012 : 0.007), 1.02, 1.32);
      for (let i = 0; i < surfaces.length - 1; i++) {
        const s = surfaces[i];
        const t = String(s?.type || "").toUpperCase();
        if (t === "OBJ" || t === "IMS") continue;
        if (airOrGlass(s?.glass) !== "AIR") continue;
        if (stopIdx >= 0 && i > stopIdx + 1) continue;
        const floor = stopIdx >= 0 && Math.abs(i - stopIdx) <= 1
          ? PHYS_CFG.minStopSideAirGap
          : PHYS_CFG.minThickness;
        s.t = adClampThicknessForSurface(s, Number(s.t || 0) * airBoost, floor);
      }

      for (const idx of singlets) {
        const inFront = stopIdx >= 0 ? idx < stopIdx : idx < Math.floor(surfaces.length * 0.45);
        const inRear = stopIdx >= 0 ? idx > stopIdx : idx > Math.floor(surfaces.length * 0.45);
        const p = adApproxSingletPower(surfaces, idx, wavePreset);

        if (inFront && p < 0) {
          const gain = clamp(1 - miss * 0.0048, 0.72, 0.97);
          surfaces[idx].R = clampSignedRadius(Number(surfaces[idx].R || 30) * gain);
          surfaces[idx + 1].R = clampSignedRadius(Number(surfaces[idx + 1].R || -30) * gain);
        } else if (inRear && p > 0) {
          const gain = clamp(1 + miss * 0.0038, 1.02, 1.28);
          surfaces[idx].R = clampSignedRadius(Number(surfaces[idx].R || 30) * gain);
          surfaces[idx + 1].R = clampSignedRadius(Number(surfaces[idx + 1].R || -30) * gain);
        }
      }

      adScaleTowardTargetEfl(surfaces, targetEfl, wavePreset);
      adNudgeStopToTargetT(surfaces, targetT, wavePreset);
      adQuickSanity(surfaces, {
        targetStopAp: adStopApFromTarget(targetEfl, targetT),
        minRearGap: Number(cfg?.minRearGapMm || AD_CFG.minRearGapMm),
        targetEfl,
      });

      computeVertices(surfaces, 0, 0);
      const est = estimateEflBflParaxial(surfaces, wavePreset);
      bfl = est?.bfl;
      if (!Number.isFinite(bfl)) break;
      miss = bflMin - bfl;
      if (!(miss > 0.2)) break;
    }
  }

  function adNudgeCoverage(surfaces, sensorW, sensorH, wavePreset, rayCount, opts = {}) {
    if (!Array.isArray(surfaces) || !surfaces.length) return;
    computeVertices(surfaces, 0, 0);
    const { efl } = estimateEflBflParaxial(surfaces, wavePreset);
    if (!Number.isFinite(efl) || efl <= 1) return;

    const req = coverageRequirementDeg(efl, sensorW, sensorH, COVERAGE_CFG.mode);
    if (!Number.isFinite(req)) return;
    const covHalfMm = coverageHalfSizeWithFloorMm(sensorW, sensorH, COVERAGE_CFG.mode);
    const maxFieldGeom = coverageTestMaxFieldDeg(surfaces, wavePreset, 0, covHalfMm);
    const maxFieldBundle = coverageTestBundleMaxFieldDeg(surfaces, wavePreset, 0, rayCount);
    const maxField = Math.min(maxFieldGeom, maxFieldBundle);
    const baseDeficit = Math.max(0, req - (maxField + COVERAGE_CFG.marginDeg));
    const force = clamp(Number(opts.force || 0), 0, 2.0);
    if (baseDeficit <= 0.03 && force <= 0.05) return;
    const deficitNorm = clamp(baseDeficit / Math.max(4, req), 0, 1.0);
    const push = clamp(deficitNorm + force * 0.8, 0.08, 1.8);

    const stopIdx = findStopSurfaceIndex(surfaces);
    const targetEfl = Number.isFinite(Number(opts.targetEfl)) ? Number(opts.targetEfl) : 50;
    const targetT = Number.isFinite(Number(opts.targetT)) ? Number(opts.targetT) : 2.0;
    const stopApTarget = adStopApFromTarget(targetEfl, targetT);

    function forceCoverageApertures() {
      const physIdx = [];
      for (let i = 0; i < surfaces.length; i++) {
        const t = String(surfaces[i]?.type || "").toUpperCase();
        if (t === "OBJ" || t === "IMS") continue;
        physIdx.push(i);
      }
      if (!physIdx.length) return;
      const lastPhys = physIdx[physIdx.length - 1];
      for (const i of physIdx) {
        const s = surfaces[i];
        const t = String(s?.type || "").toUpperCase();
        if (t === "STOP") continue;
        const nearStop = stopIdx >= 0 && Math.abs(i - stopIdx) <= 2;
        const inFront = stopIdx >= 0 && i < stopIdx;
        let mul = nearStop ? (1.70 + 0.26 * push) : (inFront ? (1.42 + 0.18 * push) : (1.28 + 0.14 * push));
        if (i === lastPhys) mul += 0.10;
        const desiredAp = stopApTarget * mul;
        const capBase = i === lastPhys
          ? Math.max(Number(AD_CFG.maxRearSurfaceApMm || 22), stopApTarget * 1.70)
          : Math.max(Number(AD_CFG.maxSurfaceApMm || 34), stopApTarget * 2.05);
        if (Math.abs(Number(s.R || 0)) > 1e-9 && maxApForSurface(s) < desiredAp * 0.98) {
          const relax = clamp(desiredAp / Math.max(0.25, maxApForSurface(s)), 1.02, 1.65);
          s.R = clampSignedRadius(Number(s.R || 0) * relax);
        }
        const cap = Math.min(capBase, maxApForSurface(s));
        s.ap = clamp(Math.max(Number(s.ap || 0), desiredAp * 0.86), PHYS_CFG.minAperture, cap);
      }
      if (stopIdx >= 0) {
        const sStop = surfaces[stopIdx];
        sStop.ap = clamp(
          Math.max(Number(sStop.ap || 0), stopApTarget * (1.08 + 0.22 * push)),
          PHYS_CFG.minAperture,
          maxApForSurface(sStop),
        );
        if (stopIdx > 0) {
          const sPrev = surfaces[stopIdx - 1];
          sPrev.t = adClampThicknessForSurface(sPrev, Number(sPrev.t || 0) * (1.08 + 0.12 * push), PHYS_CFG.minStopSideAirGap);
        }
        sStop.t = adClampThicknessForSurface(sStop, Number(sStop.t || 0) * (1.08 + 0.12 * push), PHYS_CFG.minStopSideAirGap);
        if (stopIdx + 1 < surfaces.length - 1) {
          const sNext = surfaces[stopIdx + 1];
          if (airOrGlass(sNext?.glass) === "AIR") {
            sNext.t = adClampThicknessForSurface(sNext, Number(sNext.t || 0) * (1.06 + 0.10 * push), PHYS_CFG.minThickness);
          }
        }
      }
    }

    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      const nearStop = stopIdx >= 0 && Math.abs(i - stopIdx) <= 2;
      const inFront = stopIdx >= 0 && i < stopIdx;
      const gain = 1 + (
        nearStop
          ? (0.08 + 0.22 * push)
          : (inFront ? (0.06 + 0.18 * push) : (0.04 + 0.12 * push))
      );
      let ap = clamp(Number(s.ap || 0) * gain, PHYS_CFG.minAperture, maxApForSurface(s));
      // If a surface is aperture-limited by steep curvature, relax curvature a bit so ap can grow.
      if (Math.abs(Number(s.R || 0)) > 1e-9 && ap >= maxApForSurface(s) * 0.94) {
        const relax = 1 + (0.04 + 0.10 * push);
        s.R = clampSignedRadius(Number(s.R || 0) * relax);
        ap = clamp(ap, PHYS_CFG.minAperture, maxApForSurface(s));
      }
      s.ap = ap;
    }
    if (push >= 0.65) forceCoverageApertures();
    if (stopIdx >= 0) {
      const sStop = surfaces[stopIdx];
      sStop.ap = clamp(
        Number(sStop.ap || 0) * (1 + (0.10 + 0.28 * push)),
        PHYS_CFG.minAperture,
        maxApForSurface(sStop),
      );
      if (stopIdx > 0) {
        const sPrev = surfaces[stopIdx - 1];
        sPrev.t = adClampThicknessForSurface(sPrev, Number(sPrev.t || 0) * (1.08 + 0.12 * push), PHYS_CFG.minStopSideAirGap);
      }
      sStop.t = adClampThicknessForSurface(sStop, Number(sStop.t || 0) * (1.08 + 0.12 * push), PHYS_CFG.minStopSideAirGap);
    }
    expandMiddleApertures(surfaces, { nearStopHeadroom: 1.16 + 0.14 * push });
    clampAllApertures(surfaces);
  }

  function adConditionSeedLens(lensObj, cfg) {
    const tmp = sanitizeLens(clone(lensObj));
    const s = tmp.surfaces;
    const stopApTarget = adStopApFromTarget(cfg.targetEfl, cfg.targetT);
    for (let i = 0; i < 7; i++) {
      adQuickSanity(s, { targetStopAp: stopApTarget, minRearGap: cfg.minRearGapMm, targetEfl: cfg.targetEfl });
      adScaleTowardTargetEfl(s, cfg.targetEfl, cfg.wavePreset);
      adNudgeStopToTargetT(s, cfg.targetT, cfg.wavePreset);
      adNudgeBflForPL(s, cfg);
      adNudgeCoverage(s, cfg.sensorW, cfg.sensorH, cfg.wavePreset, cfg.quickRayCount, {
        targetEfl: cfg.targetEfl,
        targetT: cfg.targetT,
      });
      adQuickSanity(s, { targetStopAp: stopApTarget, minRearGap: cfg.minRearGapMm, targetEfl: cfg.targetEfl });

      computeVertices(s, 0, 0);
      const est = estimateEflBflParaxial(s, cfg.wavePreset);
      const tNow = estimateTStopApprox(est?.efl, s, cfg.wavePreset);
      const eflOk = Number.isFinite(est?.efl) && Math.abs(est.efl - cfg.targetEfl) <= cfg.targetEfl * 0.05;
      const bflOk = Number.isFinite(est?.bfl) && est.bfl >= cfg.bflMinMm - 0.6;
      const tOk = Number.isFinite(tNow) && tNow <= cfg.targetT * 1.08;
      if (eflOk && bflOk && tOk) break;
    }
    return sanitizeLens(tmp);
  }

  function adIsInfinityDistance(d) {
    return !Number.isFinite(d) || d >= 1e8;
  }

  function adRearIntrusionAtShift(surfaces, shiftMm) {
    computeVertices(surfaces, Number(shiftMm || 0), 0);
    return lastPhysicalVertexX(surfaces) - (-PL_FFD);
  }

  function adRearSafeMaxPositiveShift(surfaces, marginMm = 0) {
    computeVertices(surfaces, 0, 0);
    const rearVx = lastPhysicalVertexX(surfaces);
    const limitX = -PL_FFD - Math.max(0, Number(marginMm || 0));
    return limitX - rearVx;
  }

  function adClampShiftForRearClearance(surfaces, desiredShiftMm, marginMm = 0) {
    const wanted = Number(desiredShiftMm || 0);
    const maxPos = adRearSafeMaxPositiveShift(surfaces, marginMm);
    if (!Number.isFinite(maxPos)) return wanted;
    return Math.min(wanted, maxPos);
  }

  function adBuildRaysForDistance(surfaces, fieldAngleDeg, count, objectDistanceMm) {
    if (adIsInfinityDistance(objectDistanceMm)) return buildRays(surfaces, fieldAngleDeg, count);

    const n = Math.max(3, Math.min(101, count | 0));
    const x0 = surfaces[0]?.vx ?? 0;
    const xObj = x0 - Math.max(80, Number(objectDistanceMm || 2000));
    const yObj = Math.tan(deg2rad(fieldAngleDeg)) * Math.max(1, Number(objectDistanceMm || 2000));
    const { xRef, apRef } = getRayReferencePlane(surfaces);
    const hMax = Math.max(0.5, apRef * 0.98);
    const rays = [];

    for (let k = 0; k < n; k++) {
      const a = (k / (n - 1)) * 2 - 1;
      const yRef = a * hMax;
      const dir = normalize({ x: xRef - xObj, y: yRef - yObj });
      rays.push({ p: { x: xObj, y: yObj }, d: dir });
    }
    return rays;
  }

  function adTraceBundleAtFieldDistance(surfaces, fieldDeg, rayCount, wavePreset, sensorX, objectDistanceMm) {
    const rays = adBuildRaysForDistance(surfaces, fieldDeg, rayCount, objectDistanceMm);
    const traces = rays.map((r) => traceRayForward(clone(r), surfaces, wavePreset));
    const vCount = traces.filter((t) => t.vignetted).length;
    const vigFrac = traces.length ? (vCount / traces.length) : 1;
    const { rms, n } = spotRmsAtSensorX(traces, sensorX);
    return { traces, rms, n, vigFrac, vCount };
  }

  function adBestLensShiftForDistance(surfaces, objectDistanceMm, rayCount, wavePreset, shiftMaxMm, focusFieldDeg = 0, maxPositiveShiftMm = null) {
    const sensorX = 0.0;
    const shiftMax = Math.max(1.0, Number(shiftMaxMm || AD_CFG.shiftMaxMm));
    const hiCap = Number.isFinite(maxPositiveShiftMm) ? Number(maxPositiveShiftMm) : shiftMax;
    const scanHi = Math.min(shiftMax, hiCap);
    if (scanHi < -shiftMax + 1e-9) {
      return { ok: false, shift: 0, rms: null, n: 0 };
    }
    const coarseStep = Math.max(0.25, shiftMax / 24);
    const fineStep = Math.max(0.05, shiftMax / 90);
    const minValid = Math.max(5, Math.floor(rayCount * 0.30));

    let best = { shift: 0, rms: Infinity, n: 0 };

    function evalShift(shift) {
      computeVertices(surfaces, shift, sensorX);
      return adTraceBundleAtFieldDistance(surfaces, focusFieldDeg, rayCount, wavePreset, sensorX, objectDistanceMm);
    }

    function scan(lo, hi, step) {
      for (let sh = lo; sh <= hi + 1e-9; sh += step) {
        const pack = evalShift(sh);
        if (!Number.isFinite(pack.rms) || (pack.n || 0) < minValid) continue;
        if (pack.rms < best.rms) best = { shift: sh, rms: pack.rms, n: pack.n || 0 };
      }
    }

    scan(-shiftMax, scanHi, coarseStep);
    if (Number.isFinite(best.rms)) {
      const loFine = Math.max(-shiftMax, best.shift - 1.2);
      const hiFine = Math.min(scanHi, best.shift + 1.2);
      if (hiFine >= loFine - 1e-9) scan(loFine, hiFine, fineStep);
    }

    if (!Number.isFinite(best.rms) || best.n < minValid) {
      return { ok: false, shift: 0, rms: null, n: best.n || 0 };
    }
    return { ok: true, shift: best.shift, rms: best.rms, n: best.n };
  }

  function adEvalDistanceMerit(surfaces, cfg) {
    const focus = adBestLensShiftForDistance(
      surfaces,
      cfg.objectDistanceMm,
      cfg.rayCount,
      cfg.wavePreset,
      cfg.shiftMaxMm,
      0,
      cfg.maxPositiveShiftMm,
    );
    if (!focus.ok) {
      return {
        ok: false,
        shift: 0,
        merit: 1e5,
        rmsCenter: null,
        rmsMid: null,
        rmsEdge: null,
        edgeVigFrac: 1,
        validFrac: 0,
      };
    }

    computeVertices(surfaces, focus.shift, 0);
    const reqField = Math.max(0.6, Number(cfg.reqFieldDeg || 12));
    const fields = [0, reqField * 0.5, reqField];

    let merit = 0;
    let vigAcc = 0;
    let validAcc = 0;
    let rmsCenter = null;
    let rmsMid = null;
    let rmsEdge = null;
    let edgeVigFrac = 1;
    let ok = true;

    for (let i = 0; i < fields.length; i++) {
      const pack = adTraceBundleAtFieldDistance(
        surfaces,
        fields[i],
        cfg.rayCount,
        cfg.wavePreset,
        0,
        cfg.objectDistanceMm,
      );
      const rms = Number(pack.rms);
      const validFrac = Number(pack.n || 0) / Math.max(1, cfg.rayCount);
      const vig = Number.isFinite(pack.vigFrac) ? pack.vigFrac : 1;

      if (!Number.isFinite(rms)) {
        merit += 30;
        ok = false;
      } else {
        merit += rms;
      }
      if (i === 0) rmsCenter = Number.isFinite(rms) ? rms : null;
      if (i === 1) rmsMid = Number.isFinite(rms) ? rms : null;
      if (i === 2) rmsEdge = Number.isFinite(rms) ? rms : null;
      if (i === 2) edgeVigFrac = vig;

      vigAcc += vig;
      validAcc += validFrac;
    }

    const vigAvg = vigAcc / fields.length;
    const validAvg = validAcc / fields.length;
    merit += 120 * Math.max(0, vigAvg - 0.03) ** 2;
    merit += 260 * Math.max(0, 0.55 - validAvg) ** 2;
    merit += 40 * Math.max(0, Math.abs(focus.shift) - cfg.shiftMaxMm) ** 2;

    return {
      ok,
      shift: focus.shift,
      merit,
      rmsCenter,
      rmsMid,
      rmsEdge,
      edgeVigFrac,
      validFrac: validAvg,
    };
  }

  function adEvaluateCandidate(lensObj, cfg, opts = {}) {
    const quick = !!opts.quick;
    const rayCount = quick ? cfg.quickRayCount : cfg.fullRayCount;
    const eflTol = quick ? cfg.eflQuickTolFrac : cfg.eflHardTolFrac;
    const tSlack = quick ? cfg.tQuickSlackFrac : cfg.tSlackFrac;

    const tmp = sanitizeLens(clone(lensObj));
    const surfaces = tmp.surfaces;
    adQuickSanity(surfaces, {
      targetStopAp: adStopApFromTarget(cfg.targetEfl, cfg.targetT),
      minRearGap: cfg.minRearGapMm,
      targetEfl: cfg.targetEfl,
    });
    computeVertices(surfaces, 0, 0);

    const phys = evaluatePhysicalConstraints(surfaces);
    const rearVx = lastPhysicalVertexX(surfaces);
    const intrusion = rearVx - (-PL_FFD);
    const { efl, bfl } = estimateEflBflParaxial(surfaces, cfg.wavePreset);
    const T = estimateTStopApprox(efl, surfaces, cfg.wavePreset);

    const req = coverageRequirementDeg(efl, cfg.sensorW, cfg.sensorH, COVERAGE_CFG.mode);
    const reqFieldDeg = Number.isFinite(req) ? req : 12.0;
    const covHalfMm = coverageHalfSizeWithFloorMm(cfg.sensorW, cfg.sensorH, COVERAGE_CFG.mode);
    const maxFieldGeom = coverageTestMaxFieldDeg(surfaces, cfg.wavePreset, 0, covHalfMm);
    const maxFieldBundleStrict = coverageTestBundleMaxFieldDeg(surfaces, cfg.wavePreset, 0, rayCount);
    const maxFieldBundleSoft = coverageTestBundleMaxFieldDeg(
      surfaces,
      cfg.wavePreset,
      0,
      rayCount,
      { maxReqVigFrac: IMAGE_CIRCLE_CFG.softMaxReqVigFrac, minReqValidFrac: IMAGE_CIRCLE_CFG.softMinReqValidFrac },
    );
    const maxFieldStrict = Math.min(maxFieldGeom, maxFieldBundleStrict);
    const maxFieldIllum = Math.min(maxFieldGeom, maxFieldBundleSoft);
    const covers = Number.isFinite(req) ? (maxFieldStrict + COVERAGE_CFG.marginDeg >= req) : false;
    const icDiagStrict = imageCircleDiagFromChiefAtField(surfaces, cfg.wavePreset, 0, maxFieldStrict) ?? imageCircleDiagFromHalfFieldMm(efl, maxFieldStrict);
    const icDiag = imageCircleDiagFromChiefAtField(surfaces, cfg.wavePreset, 0, maxFieldIllum) ?? imageCircleDiagFromHalfFieldMm(efl, maxFieldIllum);
    const icTarget = targetImageCircleDiagMm(cfg.sensorW, cfg.sensorH);
    const icOk = Number.isFinite(icDiag) && icDiag + 0.25 >= icTarget;
    const frontVx = firstPhysicalVertexX(surfaces);
    const lensLengthMm = Number.isFinite(frontVx) ? ((-PL_FFD) - frontVx + PL_LENS_LIP) : null;
    let maxAirGapMm = 0;
    for (let i = 0; i < surfaces.length; i++) {
      const sGap = surfaces[i];
      const tGap = String(sGap?.type || "").toUpperCase();
      if (tGap === "OBJ" || tGap === "IMS") continue;
      if (airOrGlass(sGap?.glass) !== "AIR") continue;
      const g = Number(sGap?.t || 0);
      if (Number.isFinite(g)) maxAirGapMm = Math.max(maxAirGapMm, g);
    }
    const lenSoftMax = Number(cfg.targetEfl || 50) <= 35
      ? 170
      : (Number(cfg.targetEfl || 50) <= 65 ? 145 : (Number(cfg.targetEfl || 50) <= 100 ? 195 : 240));
    const airGapSoftMax = Number(cfg.targetEfl || 50) <= 35
      ? 36
      : (Number(cfg.targetEfl || 50) <= 65 ? 30 : (Number(cfg.targetEfl || 50) <= 100 ? 44 : 60));
    const archBad =
      (Number.isFinite(lensLengthMm) && lensLengthMm > lenSoftMax * 1.35) ||
      (Number.isFinite(maxAirGapMm) && maxAirGapMm > airGapSoftMax * 1.60);
    const maxPosShift = adRearSafeMaxPositiveShift(surfaces, 0);

    const focusInf = adEvalDistanceMerit(surfaces, {
      objectDistanceMm: Infinity,
      reqFieldDeg,
      rayCount,
      wavePreset: cfg.wavePreset,
      shiftMaxMm: cfg.shiftMaxMm,
      maxPositiveShiftMm: maxPosShift,
    });
    const focusNear = adEvalDistanceMerit(surfaces, {
      objectDistanceMm: cfg.focusNearMm,
      reqFieldDeg,
      rayCount,
      wavePreset: cfg.wavePreset,
      shiftMaxMm: cfg.shiftMaxMm,
      maxPositiveShiftMm: maxPosShift,
    });

    const focusTarget = adNormalizeFocusTarget(cfg.focusTarget);
    const primaryFocus = focusTarget === "near" ? focusNear : focusInf;
    const distShift = primaryFocus.ok ? primaryFocus.shift : (focusInf.ok ? focusInf.shift : 0);
    computeVertices(surfaces, distShift, 0);
    const distPct = estimateDistortionPct(surfaces, cfg.wavePreset, 0, cfg.sensorW, cfg.sensorH, efl, COVERAGE_CFG.mode);
    const distAbs = Number.isFinite(distPct) ? Math.abs(distPct) : 12;

    const eflErrFrac = (Number.isFinite(efl) && cfg.targetEfl > 0)
      ? Math.abs(efl - cfg.targetEfl) / cfg.targetEfl
      : Infinity;
    const eflSignOk = Number.isFinite(efl) && efl > 1;
    const tModelOk = Number.isFinite(T) && T > 0.2 && T < 20;
    const eflOk = Number.isFinite(efl) && eflErrFrac <= eflTol;
    const tOk = Number.isFinite(T) && T <= cfg.targetT * (1 + tSlack);
    const bflOk = Number.isFinite(bfl) && bfl >= cfg.bflMinMm;
    const intrusionInfShift = focusInf.ok ? adRearIntrusionAtShift(surfaces, focusInf.shift) : Infinity;
    const intrusionNearShift = focusNear.ok ? adRearIntrusionAtShift(surfaces, focusNear.shift) : Infinity;
    const focusInfIntrusionOk = !focusInf.ok || intrusionInfShift <= 1e-6;
    const focusNearIntrusionOk = !focusNear.ok || intrusionNearShift <= 1e-6;
    const focusIntrusionOk = focusTarget === "both"
      ? (focusInfIntrusionOk && focusNearIntrusionOk)
      : (focusTarget === "near" ? focusNearIntrusionOk : focusInfIntrusionOk);
    const intrusionOk = intrusion <= 1e-6 && focusIntrusionOk;
    const focusInfOk = focusInf.ok && Math.abs(focusInf.shift) <= cfg.shiftMaxMm + 1e-6 && focusInfIntrusionOk;
    const focusNearOk = focusNear.ok && Math.abs(focusNear.shift) <= cfg.shiftMaxMm + 1e-6 && focusNearIntrusionOk;
    const focusOk = focusTarget === "both"
      ? (focusInfOk && focusNearOk)
      : (focusTarget === "near" ? focusNearOk : focusInfOk);
    const noHardVigInf =
      Number(focusInf.edgeVigFrac || 1) <= 0.35 &&
      Number(focusInf.validFrac || 0) >= 0.55;
    const noHardVigNear =
      Number(focusNear.edgeVigFrac || 1) <= 0.45 &&
      Number(focusNear.validFrac || 0) >= 0.50;
    const noHardVig = focusTarget === "both"
      ? (noHardVigInf && noHardVigNear)
      : (focusTarget === "near" ? noHardVigNear : noHardVigInf);

    const centerInfOk = Number.isFinite(focusInf.rmsCenter) && focusInf.rmsCenter <= Number(cfg.centerRmsMaxInf || 0.16);
    const centerNearOk = Number.isFinite(focusNear.rmsCenter) && focusNear.rmsCenter <= Number(cfg.centerRmsMaxNear || 0.20);
    const midInfOk = Number.isFinite(focusInf.rmsMid) && focusInf.rmsMid <= Number(cfg.midRmsMaxInf || 0.32);
    const midNearOk = Number.isFinite(focusNear.rmsMid) && focusNear.rmsMid <= Number(cfg.midRmsMaxNear || 0.38);
    const centerSpotOk = focusTarget === "both"
      ? (centerInfOk && centerNearOk)
      : (focusTarget === "near" ? centerNearOk : centerInfOk);
    const midSpotOk = focusTarget === "both"
      ? (midInfOk && midNearOk)
      : (focusTarget === "near" ? midNearOk : midInfOk);

    const reasons = [];
    if (phys.hardFail) reasons.push("PHYS");
    if (!intrusionOk) reasons.push("INTRUSION");
    if (!bflOk) reasons.push("BFL");
    if (!covers) reasons.push("COV");
    if (!icOk) reasons.push("IC");
    if (!noHardVig) reasons.push("VIG");
    if (archBad) reasons.push("ARCH");
    if (!focusOk) reasons.push("FOCUS");
    if (!centerSpotOk) reasons.push("FOCUS_SPOT");
    if (!midSpotOk) reasons.push("MID_SPOT");
    if (!eflOk) reasons.push("EFL");
    if (!tOk) reasons.push("T");
    if (!eflSignOk) reasons.push("EFL_SIGN");
    if (!tModelOk) reasons.push("T_MODEL");

    let score = 0;
    if (focusTarget === "both") {
      score += cfg.focusWeightInf * Number(focusInf.merit || 1e5);
      score += cfg.focusWeightNear * Number(focusNear.merit || 1e5);
    } else if (focusTarget === "near") {
      score += Number(focusNear.merit || 1e5);
    } else {
      score += Number(focusInf.merit || 1e5);
    }

    score += cfg.distWeight * distAbs * distAbs;
    if (focusTarget === "both") {
      score += cfg.vigWeight * (Number(focusInf.edgeVigFrac || 1) + Number(focusNear.edgeVigFrac || 1));
    } else if (focusTarget === "near") {
      score += cfg.vigWeight * Number(focusNear.edgeVigFrac || 1);
    } else {
      score += cfg.vigWeight * Number(focusInf.edgeVigFrac || 1);
    }
    score += cfg.physWeight * Math.max(0, Number(phys.penalty || 0));

    const cInf = Number(focusInf.rmsCenter);
    const cNear = Number(focusNear.rmsCenter);
    const mInf = Number(focusInf.rmsMid);
    const mNear = Number(focusNear.rmsMid);
    const cInfMax = Number(cfg.centerRmsMaxInf || 0.16);
    const cNearMax = Number(cfg.centerRmsMaxNear || 0.20);
    const mInfMax = Number(cfg.midRmsMaxInf || 0.32);
    const mNearMax = Number(cfg.midRmsMaxNear || 0.38);
    if (Number.isFinite(cInf)) score += Number(cfg.centerRmsWeight || 0) * Math.max(0, cInf - cInfMax) ** 2;
    else score += Number(cfg.centerRmsWeight || 0) * 0.9;
    if (Number.isFinite(cNear)) score += Number(cfg.centerRmsWeight || 0) * 0.75 * Math.max(0, cNear - cNearMax) ** 2;
    else score += Number(cfg.centerRmsWeight || 0) * 0.7;
    if (Number.isFinite(mInf)) score += Number(cfg.midRmsWeight || 0) * Math.max(0, mInf - mInfMax) ** 2;
    if (Number.isFinite(mNear)) score += Number(cfg.midRmsWeight || 0) * 0.75 * Math.max(0, mNear - mNearMax) ** 2;

    if (Number.isFinite(eflErrFrac)) score += cfg.eflWeight * eflErrFrac * eflErrFrac;
    else score += cfg.eflWeight;
    if (!eflSignOk) score += cfg.guardFailPenalty * 4;

    if (Number.isFinite(T)) {
      if (T > cfg.targetT) score += cfg.tSlowWeight * (T - cfg.targetT) ** 2;
      else score += cfg.tFastWeight * (cfg.targetT - T) ** 2;
    } else {
      score += cfg.tSlowWeight;
    }
    if (!tModelOk) score += cfg.guardFailPenalty * 3;

    if (Number.isFinite(bfl) && bfl < cfg.bflMinMm) score += cfg.bflWeight * (cfg.bflMinMm - bfl) ** 2;
    if (Number.isFinite(intrusion) && intrusion > 0) score += cfg.bflWeight * intrusion * intrusion;
    if (Number.isFinite(intrusionInfShift) && intrusionInfShift > 0) score += cfg.bflWeight * intrusionInfShift * intrusionInfShift;
    if (Number.isFinite(intrusionNearShift) && intrusionNearShift > 0) score += cfg.bflWeight * intrusionNearShift * intrusionNearShift;
    if (Number.isFinite(req) && Number.isFinite(maxFieldStrict) && maxFieldStrict < req) score += cfg.covWeight * (req - maxFieldStrict) ** 2;
    if (Number.isFinite(req) && Number.isFinite(maxFieldIllum) && maxFieldIllum < req) score += cfg.covWeight * 0.55 * (req - maxFieldIllum) ** 2;
    if (!icOk) score += cfg.covWeight * 1.35 * Math.max(1, (icTarget - Number(icDiag || 0)) ** 2);
    if (Number.isFinite(lensLengthMm) && lensLengthMm > lenSoftMax) score += 180 * (lensLengthMm - lenSoftMax) ** 2;
    if (Number.isFinite(maxAirGapMm) && maxAirGapMm > airGapSoftMax) score += 90 * (maxAirGapMm - airGapSoftMax) ** 2;
    if (focusTarget === "both" && focusInf.ok && focusNear.ok) {
      score += cfg.focusTravelWeight * (focusNear.shift - focusInf.shift) ** 2;
    }

    if (reasons.length) score += cfg.guardFailPenalty * reasons.length;

    return {
      lens: sanitizeLens(tmp),
      score,
      valid: reasons.length === 0,
      reasons,
      efl,
      T,
      bfl,
      reqFieldDeg,
      req,
      maxField: maxFieldStrict,
      maxFieldStrict,
      maxFieldIllum,
      icDiag,
      icDiagStrict,
      icTarget,
      lensLengthMm,
      maxAirGapMm,
      distPct,
      intrusion,
      intrusionInfShift: Number.isFinite(intrusionInfShift) ? intrusionInfShift : null,
      intrusionNearShift: Number.isFinite(intrusionNearShift) ? intrusionNearShift : null,
      phys,
      focusInf,
      focusNear,
      focusTarget,
    };
  }

  function adCaptureTopology(lensObj) {
    const s = lensObj?.surfaces || [];
    return {
      count: s.length,
      media: s.map((x) => airOrGlass(x?.glass)),
      stopIdx: findStopSurfaceIndex(s),
    };
  }

  function adEnforceTopology(surfaces, topo) {
    if (!Array.isArray(surfaces) || !topo) return false;
    if (surfaces.length !== topo.count) return false;
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      const want = topo.media?.[i];
      if (want === "AIR") s.glass = "AIR";
      else {
        const g = resolveGlassName(s.glass);
        s.glass = String(g).toUpperCase() === "AIR" ? "N-BK7HT" : g;
      }
    }
    surfaces.forEach((s, i) => {
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") {
        s.stop = false;
        return;
      }
      const isStop = i === topo.stopIdx;
      s.stop = isStop;
      if (isStop) {
        s.type = "STOP";
        s.R = 0;
        s.glass = "AIR";
      }
    });
    return true;
  }

  function adFindSingletStarts(surfaces) {
    const out = [];
    for (let i = 0; i < surfaces.length - 1; i++) {
      const a = surfaces[i], b = surfaces[i + 1];
      const ta = String(a?.type || "").toUpperCase();
      const tb = String(b?.type || "").toUpperCase();
      if (ta === "OBJ" || ta === "IMS" || tb === "OBJ" || tb === "IMS") continue;
      if (ta === "STOP" || tb === "STOP") continue;
      if (airOrGlass(a?.glass) !== "GLASS") continue;
      if (airOrGlass(b?.glass) !== "AIR") continue;
      out.push(i);
    }
    return out;
  }

  function adFindAirGapIndices(surfaces) {
    const out = [];
    for (let i = 0; i < surfaces.length - 1; i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS") continue;
      if (airOrGlass(s?.glass) !== "AIR") continue;
      out.push(i);
    }
    return out;
  }

  function adOpBendSinglet(surfaces) {
    const cands = adFindSingletStarts(surfaces);
    if (!cands.length) return false;
    const i = pick(cands);
    const s1 = surfaces[i], s2 = surfaces[i + 1];
    const k = randRange(-0.12, 0.12);
    s1.R = clampSignedRadius(Number(s1.R || 30) * (1 + k));
    s2.R = clampSignedRadius(Number(s2.R || -30) * (1 - k));
    return true;
  }

  function adOpAirgapTweak(surfaces) {
    const cands = adFindAirGapIndices(surfaces);
    if (!cands.length) return false;
    const i = pick(cands);
    const stopIdx = findStopSurfaceIndex(surfaces);
    const nearStop = stopIdx >= 0 && Math.abs(i - stopIdx) <= 2;
    const delta = nearStop ? randRange(-0.45, 0.45) : randRange(-1.0, 1.0);
    surfaces[i].t = adClampThicknessForSurface(surfaces[i], Number(surfaces[i].t || 0) + delta, PHYS_CFG.minThickness);
    return true;
  }

  function adOpStopTweak(surfaces) {
    const stopIdx = findStopSurfaceIndex(surfaces);
    if (stopIdx < 0) return false;

    if (Math.random() < 0.72) {
      const sStop = surfaces[stopIdx];
      sStop.ap = clamp(Number(sStop.ap || 0) * (1 + randRange(-0.03, 0.03)), PHYS_CFG.minAperture, PHYS_CFG.maxAperture * 0.92);
      return true;
    }

    const dir = Math.random() < 0.5 ? -1 : 1;
    const j = stopIdx + dir;
    if (j <= 0 || j >= surfaces.length - 1) return false;
    const sj = surfaces[j];
    const tj = String(sj?.type || "").toUpperCase();
    if (tj === "OBJ" || tj === "IMS") return false;
    const prevAir = airOrGlass(surfaces[j - 1]?.glass) === "AIR";
    const selfAir = airOrGlass(sj?.glass) === "AIR";
    if (!prevAir || !selfAir) return false;

    surfaces[stopIdx].stop = false;
    if (String(surfaces[stopIdx].type || "").toUpperCase() === "STOP") surfaces[stopIdx].type = "";

    sj.stop = true;
    sj.type = "STOP";
    sj.R = 0;
    sj.glass = "AIR";
    return true;
  }

  function adOpGlassSwap(surfaces) {
    const idxs = [];
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const t = String(s?.type || "").toUpperCase();
      if (t === "OBJ" || t === "IMS" || t === "STOP") continue;
      if (airOrGlass(s?.glass) !== "GLASS") continue;
      idxs.push(i);
    }
    if (!idxs.length) return false;
    const i = pick(idxs);
    surfaces[i].glass = pickNearbyGlass(surfaces[i].glass);
    return true;
  }

  function adOpSplitSinglet(surfaces, cfg) {
    if (surfaces.length + 2 > cfg.maxSurfaceCount) return false;
    const starts = adFindSingletStarts(surfaces);
    if (!starts.length) return false;
    const i = pick(starts);
    const a = clone(surfaces[i]);
    const b = clone(surfaces[i + 1]);
    const gA = resolveGlassName(a.glass || "N-BK7HT");
    const gB = pickNearbyGlass(gA);
    const ap = clamp(Math.max(Number(a.ap || 0), Number(b.ap || 0)), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
    const tG = clamp(Number(a.t || 0), AD_CFG.seedGlassMin, AD_CFG.seedGlassMax);
    const tAir = clamp(Number(b.t || 0), AD_CFG.seedAirMin, AD_CFG.seedAirMax);
    const gain1 = randRange(1.15, 1.50);
    const gain2 = randRange(1.40, 1.90);

    const n1 = { type: "", R: clampSignedRadius(Number(a.R || 30) * gain1), t: clamp(tG * 0.55, AD_CFG.seedGlassMin, AD_CFG.seedGlassMax), ap, glass: gA, stop: false };
    const n2 = { type: "", R: clampSignedRadius(Number(b.R || -30) * gain1), t: clamp(tAir * 0.35, AD_CFG.seedAirMin, AD_CFG.seedAirMax), ap, glass: "AIR", stop: false };
    const n3 = { type: "", R: clampSignedRadius(Number(a.R || 30) * gain2), t: clamp(tG * 0.45, AD_CFG.seedGlassMin, AD_CFG.seedGlassMax), ap, glass: gB, stop: false };
    const n4 = { type: "", R: clampSignedRadius(Number(b.R || -30) * gain2), t: clamp(tAir * 0.65, AD_CFG.seedAirMin, AD_CFG.seedAirMax), ap, glass: "AIR", stop: false };

    surfaces.splice(i, 2, n1, n2, n3, n4);
    return true;
  }

  function adOpAddFieldFlattener(surfaces, cfg) {
    if (surfaces.length + 2 > cfg.maxSurfaceCount) return false;
    const imsIdx = surfaces.findIndex((s) => String(s?.type || "").toUpperCase() === "IMS");
    if (imsIdx <= 1) return false;
    const stopIdx = findStopSurfaceIndex(surfaces);
    const stopAp = stopIdx >= 0 ? Number(surfaces[stopIdx]?.ap || 8) : 8;
    const f = Math.max(18, Number(cfg.targetEfl || 50));
    const ap = clamp(stopAp * randRange(1.15, 1.45), PHYS_CFG.minAperture, PHYS_CFG.maxAperture);
    const g = pickGlassByClass("CROWN");

    const s1 = {
      type: "",
      R: clampSignedRadius(+f * randRange(1.8, 3.8)),
      t: clamp(randRange(1.3, 2.5), AD_CFG.seedGlassMin, AD_CFG.seedGlassMax),
      ap,
      glass: g,
      stop: false,
    };
    const s2 = {
      type: "",
      R: clampSignedRadius(-f * randRange(2.2, 4.6)),
      t: clamp(randRange(0.9, 2.4), AD_CFG.seedAirMin, AD_CFG.seedAirMax),
      ap,
      glass: "AIR",
      stop: false,
    };

    surfaces.splice(imsIdx, 0, s1, s2);
    return true;
  }

  function adMutateLens(baseLens, cfg, topo, state = {}) {
    const L = sanitizeLens(clone(baseLens));
    const s = L.surfaces;
    const ops = [
      { id: "bend", w: 44, fn: () => adOpBendSinglet(s), topoChange: false },
      { id: "airgap", w: 21, fn: () => adOpAirgapTweak(s), topoChange: false },
      { id: "stop", w: 14, fn: () => adOpStopTweak(s), topoChange: false },
      { id: "glass", w: 12, fn: () => adOpGlassSwap(s), topoChange: false },
      { id: "split", w: 5, fn: () => adOpSplitSinglet(s, cfg), topoChange: true },
      { id: "field", w: 4, fn: () => adOpAddFieldFlattener(s, cfg), topoChange: true },
    ];

    const edgeBad = Number.isFinite(state.edgeRmsInf) && Number.isFinite(state.centerRmsInf) && state.edgeRmsInf > state.centerRmsInf * 2.4;
    const nearFail = state.focusNearOk === false;
    const covFail = !!state.covFail;
    const icFail = !!state.icFail;
    if (edgeBad) {
      for (const op of ops) if (op.id === "split" || op.id === "field") op.w *= 1.9;
    }
    if (nearFail) {
      for (const op of ops) if (op.id === "airgap" || op.id === "split") op.w *= 1.6;
    }
    if (covFail || icFail) {
      for (const op of ops) {
        if (op.id === "stop") op.w *= 2.2;
        else if (op.id === "airgap") op.w *= 1.9;
        else if (op.id === "field" || op.id === "split") op.w *= 1.8;
        else if (op.id === "bend") op.w *= 1.35;
        else if (op.id === "glass") op.w *= 0.8;
      }
    }

    let chosen = null;
    for (let tries = 0; tries < 5; tries++) {
      const id = pickWeighted(ops.map((o) => ({ id: o.id, w: o.w })));
      const op = ops.find((o) => o.id === id) || ops[0];
      chosen = op;

      if (topo && !op.topoChange) adEnforceTopology(s, topo);
      const changed = op.fn();
      if (!changed) continue;

      adScaleTowardTargetEfl(s, cfg.targetEfl, cfg.wavePreset);
      adNudgeStopToTargetT(s, cfg.targetT, cfg.wavePreset);
      adNudgeBflForPL(s, cfg);
      const coverageForce = (covFail || icFail) ? 1.0 : 0.0;
      if (coverageForce > 0 || Math.random() < 0.70) {
        adNudgeCoverage(s, cfg.sensorW, cfg.sensorH, cfg.wavePreset, cfg.quickRayCount, {
          force: coverageForce,
          targetEfl: cfg.targetEfl,
          targetT: cfg.targetT,
        });
      }
      adQuickSanity(s, {
        targetStopAp: adStopApFromTarget(cfg.targetEfl, cfg.targetT),
        minRearGap: cfg.minRearGapMm,
        targetEfl: cfg.targetEfl,
      });
      if (topo && !op.topoChange) adEnforceTopology(s, topo);
      adQuickSanity(s, {
        targetStopAp: adStopApFromTarget(cfg.targetEfl, cfg.targetT),
        minRearGap: cfg.minRearGapMm,
        targetEfl: cfg.targetEfl,
      });
      return {
        lens: sanitizeLens(L),
        op: op.id,
        topologyChanged: !!op.topoChange,
      };
    }

    adQuickSanity(s, {
      targetStopAp: adStopApFromTarget(cfg.targetEfl, cfg.targetT),
      minRearGap: cfg.minRearGapMm,
      targetEfl: cfg.targetEfl,
    });
    adScaleTowardTargetEfl(s, cfg.targetEfl, cfg.wavePreset);
    adNudgeStopToTargetT(s, cfg.targetT, cfg.wavePreset);
    adNudgeBflForPL(s, cfg);
    adQuickSanity(s, {
      targetStopAp: adStopApFromTarget(cfg.targetEfl, cfg.targetT),
      minRearGap: cfg.minRearGapMm,
      targetEfl: cfg.targetEfl,
    });
    if (topo) adEnforceTopology(s, topo);
    return {
      lens: sanitizeLens(L),
      op: chosen?.id || "none",
      topologyChanged: false,
    };
  }

  function adNearRank(ev, cfg) {
    let r = Number(ev?.score || 1e12);
    const efl = Number(ev?.efl);
    const t = Number(ev?.T);
    const bfl = Number(ev?.bfl);
    if (!Number.isFinite(efl) || efl <= 1) r += 600_000_000;
    if (!Number.isFinite(t) || t <= 0.2 || t > 20) r += 450_000_000;
    if (!Number.isFinite(bfl) || bfl < Number(cfg?.bflMinMm || AD_CFG.bflMinMm || 52)) {
      const miss = Number.isFinite(bfl)
        ? Math.max(0, Number(cfg?.bflMinMm || AD_CFG.bflMinMm || 52) - bfl)
        : 52;
      r += 40_000_000 + miss * miss * 900_000;
    }
    const reasons = Array.isArray(ev?.reasons) ? ev.reasons : [];
    if (reasons.includes("PHYS")) r += 300_000_000;
    if (reasons.includes("FOCUS")) r += 220_000_000;
    if (reasons.includes("COV") || reasons.includes("IC")) r += 120_000_000;
    if (reasons.includes("VIG")) r += 80_000_000;
    if (reasons.includes("ARCH")) r += 140_000_000;
    if (reasons.includes("EFL")) r += 120_000_000;
    if (reasons.includes("T")) r += 120_000_000;
    if (reasons.includes("EFL_SIGN")) r += 420_000_000;
    if (reasons.includes("T_MODEL")) r += 280_000_000;
    const vfInf = Number(ev?.focusInf?.validFrac);
    const vfNear = Number(ev?.focusNear?.validFrac);
    const vigInf = Number(ev?.focusInf?.edgeVigFrac);
    const vigNear = Number(ev?.focusNear?.edgeVigFrac);
    if (Number.isFinite(vfInf) && vfInf < 0.22) r += (0.22 - vfInf) * 320_000_000;
    if (Number.isFinite(vfNear) && vfNear < 0.22) r += (0.22 - vfNear) * 320_000_000;
    if (Number.isFinite(vigInf) && vigInf > 0.60) r += (vigInf - 0.60) * 260_000_000;
    if (Number.isFinite(vigNear) && vigNear > 0.60) r += (vigNear - 0.60) * 260_000_000;
    const icDiag = Number(ev?.icDiag);
    if (!Number.isFinite(icDiag) || icDiag < 6.0) r += 260_000_000 + (Number.isFinite(icDiag) ? (6 - icDiag) * 25_000_000 : 0);
    const len = Number(ev?.lensLengthMm);
    if (Number.isFinite(len) && len > 170) r += (len - 170) * (len - 170) * 42000;
    const maxGap = Number(ev?.maxAirGapMm);
    if (Number.isFinite(maxGap) && maxGap > 34) r += (maxGap - 34) * (maxGap - 34) * 58000;
    const targetEfl = Math.max(1, Number(cfg?.targetEfl || 50));
    if (Number.isFinite(efl) && efl > 0) {
      const eflErrFrac = Math.abs(efl - targetEfl) / targetEfl;
      r += 260_000_000 * eflErrFrac * eflErrFrac;
      if (eflErrFrac > 0.60) r += 300_000_000 * (eflErrFrac - 0.60);
    }
    const targetT = Math.max(0.4, Number(cfg?.targetT || 2.0));
    if (Number.isFinite(t) && t > 0.1) {
      const tSlow = Math.max(0, (t - targetT) / targetT);
      const tFast = Math.max(0, (targetT - t) / targetT);
      r += 220_000_000 * tSlow * tSlow + 60_000_000 * tFast * tFast;
      if (tSlow > 0.45) r += 180_000_000 * (tSlow - 0.45);
    }
    const cInf = Number(ev?.focusInf?.rmsCenter);
    const cNear = Number(ev?.focusNear?.rmsCenter);
    const cInfMax = Number(cfg?.centerRmsMaxInf || 0.16);
    const cNearMax = Number(cfg?.centerRmsMaxNear || 0.20);
    if (!Number.isFinite(cInf) || cInf > cInfMax) {
      const d = Number.isFinite(cInf) ? (cInf - cInfMax) : 0.8;
      r += 180_000_000 * d * d + 120_000_000;
    }
    if (!Number.isFinite(cNear) || cNear > cNearMax) {
      const d = Number.isFinite(cNear) ? (cNear - cNearMax) : 0.8;
      r += 170_000_000 * d * d + 100_000_000;
    }
    return r;
  }

  function adBuildRescueSeed(cfg, family = "distagon") {
    let seed = adBuildTemplateByFamily(family, cfg);
    const tmp = sanitizeLens(clone(seed));
    const s = tmp.surfaces;
    const stopApTarget = adStopApFromTarget(cfg.targetEfl, cfg.targetT);

    for (let i = 0; i < 12; i++) {
      adQuickSanity(s, { targetStopAp: stopApTarget, minRearGap: cfg.minRearGapMm, targetEfl: cfg.targetEfl });
      adScaleTowardTargetEfl(s, cfg.targetEfl, cfg.wavePreset);
      adNudgeStopToTargetT(s, cfg.targetT, cfg.wavePreset);
      adNudgeBflForPL(s, cfg);
      adNudgeCoverage(s, cfg.sensorW, cfg.sensorH, cfg.wavePreset, cfg.quickRayCount, {
        targetEfl: cfg.targetEfl,
        targetT: cfg.targetT,
      });
      adQuickSanity(s, { targetStopAp: stopApTarget, minRearGap: cfg.minRearGapMm, targetEfl: cfg.targetEfl });
    }
    return sanitizeLens(tmp);
  }

  function adBuildWarmStartSeed(prevBest, cfg) {
    const srcLens = prevBest?.eval?.lens || prevBest?.lens;
    if (!srcLens) return null;
    const tmp = sanitizeLens(clone(srcLens));
    const s = tmp.surfaces;
    const stopApTarget = adStopApFromTarget(cfg.targetEfl, cfg.targetT);

    for (let i = 0; i < 14; i++) {
      adQuickSanity(s, { targetStopAp: stopApTarget, minRearGap: cfg.minRearGapMm, targetEfl: cfg.targetEfl });
      adScaleTowardTargetEfl(s, cfg.targetEfl, cfg.wavePreset);
      adNudgeStopToTargetT(s, cfg.targetT, cfg.wavePreset);
      adNudgeBflForPL(s, cfg);
      adNudgeCoverage(s, cfg.sensorW, cfg.sensorH, cfg.wavePreset, cfg.quickRayCount, {
        targetEfl: cfg.targetEfl,
        targetT: cfg.targetT,
      });
      adQuickSanity(s, { targetStopAp: stopApTarget, minRearGap: cfg.minRearGapMm, targetEfl: cfg.targetEfl });
    }
    return sanitizeLens(tmp);
  }

  function adIsWarmStartCompatible(prevBest, cfg) {
    if (!prevBest?.eval || !prevBest?.lens) return false;
    const e = Number(prevBest.eval.efl);
    const t = Number(prevBest.eval.T);
    const bfl = Number(prevBest.eval.bfl);
    if (!Number.isFinite(e) || e <= 1) return false;
    const eFrac = Math.abs(e - Number(cfg.targetEfl || 50)) / Math.max(1, Number(cfg.targetEfl || 50));
    if (eFrac > 1.20) return false;
    if (Number.isFinite(t) && t > Number(cfg.targetT || 2.0) * 3.0) return false;
    if (Number.isFinite(bfl) && bfl < Number(cfg.bflMinMm || AD_CFG.bflMinMm || 52) - 8) return false;
    return true;
  }

  async function adGenerateSeeds(cfg) {
    const pool = adFamilyPool(cfg.targetEfl, cfg.targetT, cfg.bflMinMm);
    const valid = [];
    const near = [];
    const retroPressure = Number(cfg.bflMinMm || AD_CFG.bflMinMm || 52) / Math.max(1, Number(cfg.targetEfl || 50));
    const forceRetro = retroPressure >= 1.12;
    const forcedPool = [
      { id: "distagon", w: 1 },
      { id: "retrofocus", w: 1 },
    ];
    const mandatoryFamilies = ["plbase", "plbase", "distagon", "retrofocus"];

    for (let i = 0; i < cfg.seedCount; i++) {
      if (!adRunning) break;
      const forceFamily = i < mandatoryFamilies.length ? mandatoryFamilies[i] : null;
      const inRescueBand = i >= Math.floor(cfg.seedCount * 0.25);
      const family = forceFamily || ((forceRetro && inRescueBand && valid.length === 0)
        ? (pickWeighted(forcedPool) || "distagon")
        : (pickWeighted(pool) || "gauss"));
      let seed = adBuildTemplateByFamily(family, cfg);
      seed = adConditionSeedLens(seed, cfg);

      let evalRes = adEvaluateCandidate(seed, cfg, { quick: true });
      seed = evalRes.lens;
      if (!evalRes.valid) {
        for (let t = 0; t < 3; t++) {
          const m = adMutateLens(seed, cfg, null, {});
          seed = adConditionSeedLens(m.lens, cfg);
          const eTry = adEvaluateCandidate(seed, cfg, { quick: true });
          if (eTry.score < evalRes.score) {
            evalRes = eTry;
            seed = eTry.lens;
          }
          if (eTry.valid) {
            evalRes = eTry;
            seed = eTry.lens;
            break;
          }
        }
      }

      const item = { family, lens: clone(evalRes.lens || seed), eval: evalRes };
      if (evalRes.valid) valid.push(item);
      else near.push(item);

      if ((i + 1) % 8 === 0) {
        appendADLog(`Seeds ${i + 1}/${cfg.seedCount} • valid ${valid.length} • best ${valid[0]?.eval?.score?.toFixed?.(2) ?? "—"}`);
        await adYield();
      }
    }

    if (!valid.length) {
      appendADLog("Seed rescue: generating deterministic fallback seeds...");
      const rescueFamilies = cfg.targetEfl <= 60
        ? ["distagon", "retrofocus", "gauss"]
        : ["retrofocus", "distagon", "sonnar"];
      for (const fam of rescueFamilies) {
        const seed = adBuildRescueSeed(cfg, fam);
        const ev = adEvaluateCandidate(seed, cfg, { quick: false });
        const item = { family: `${fam}:rescue`, lens: clone(ev.lens), eval: ev };
        if (ev.valid) valid.push(item);
        else near.push(item);
      }
    }

    valid.sort((a, b) => a.eval.score - b.eval.score);
    near.sort((a, b) => adNearRank(a.eval, cfg) - adNearRank(b.eval, cfg));

    if (!valid.length && near.length) {
      const take = Math.min(Math.max(1, cfg.minValidSeeds), near.length);
      valid.push(...near.slice(0, take));
    }

    return { valid, near };
  }

  async function adOptimizeSeed(seedItem, cfg, seedRank, totalSeeds) {
    let cur = sanitizeLens(clone(seedItem?.eval?.lens || seedItem.lens));
    let curEval = adEvaluateCandidate(cur, cfg, { quick: false });
    cur = curEval.lens;
    let bestValid = curEval.valid ? { lens: clone(curEval.lens), eval: curEval, iter: 0 } : null;
    let bestInvalid = curEval.valid ? null : { lens: clone(curEval.lens), eval: curEval, iter: 0 };
    let bestAny = { lens: clone(curEval.lens), eval: curEval, iter: 0 };
    let topo = adCaptureTopology(cur);
    let invalidStreak = curEval.valid ? 0 : 1;

    for (let iter = 1; iter <= cfg.optimizeIters; iter++) {
      if (!adRunning) break;
      const a = iter / cfg.optimizeIters;
      const temp = cfg.tempStart * (1 - a) + cfg.tempEnd * a;

      const m = adMutateLens(cur, cfg, topo, {
        edgeRmsInf: curEval.focusInf?.rmsEdge,
        centerRmsInf: curEval.focusInf?.rmsCenter,
        focusNearOk: curEval.focusNear?.ok,
        covFail: Array.isArray(curEval?.reasons) && curEval.reasons.includes("COV"),
        icFail: Array.isArray(curEval?.reasons) && curEval.reasons.includes("IC"),
      });

      let cand = m.lens;
      let candEval = adEvaluateCandidate(cand, cfg, { quick: (iter % cfg.fullEvalStride) !== 0 });

      if (!candEval.valid && Math.random() < 0.30) {
        const repaired = adConditionSeedLens(cand, cfg);
        const repEval = adEvaluateCandidate(repaired, cfg, { quick: true });
        if (repEval.score <= candEval.score || repEval.valid) {
          cand = repaired;
          candEval = repEval;
        }
      }

      let accept = false;
      if (candEval.score <= curEval.score) accept = true;
      else {
        const d = candEval.score - curEval.score;
        accept = Math.random() < Math.exp(-d / Math.max(1e-9, temp));
      }

      if (accept) {
        cur = candEval.lens;
        curEval = candEval;
        if (m.topologyChanged) topo = adCaptureTopology(cur);
      }

      if (candEval.valid && (!bestValid || candEval.score < bestValid.eval.score)) {
        bestValid = { lens: clone(candEval.lens), eval: candEval, iter };
      } else if (!candEval.valid && (!bestInvalid || adNearRank(candEval, cfg) < adNearRank(bestInvalid.eval, cfg))) {
        bestInvalid = { lens: clone(candEval.lens), eval: candEval, iter };
      }

      if (curEval.score < bestAny.eval.score) {
        bestAny = { lens: clone(curEval.lens), eval: curEval, iter };
      }

      if (curEval.valid && (!bestValid || curEval.score < bestValid.eval.score)) {
        bestValid = { lens: clone(curEval.lens), eval: curEval, iter };
      } else if (!curEval.valid && (!bestInvalid || adNearRank(curEval, cfg) < adNearRank(bestInvalid.eval, cfg))) {
        bestInvalid = { lens: clone(curEval.lens), eval: curEval, iter };
      }

      invalidStreak = curEval.valid ? 0 : (invalidStreak + 1);
      if (invalidStreak >= cfg.invalidRestartEvery) {
        const seedBase = bestValid?.lens
          ? clone(bestValid.lens)
          : (bestInvalid?.lens ? clone(bestInvalid.lens) : (bestAny?.lens ? clone(bestAny.lens) : clone(seedItem.lens)));
        cur = adConditionSeedLens(seedBase, cfg);
        curEval = adEvaluateCandidate(cur, cfg, { quick: true });
        cur = curEval.lens;
        topo = adCaptureTopology(cur);
        invalidStreak = curEval.valid ? 0 : 1;
      }

      if (iter % cfg.logEvery === 0) {
        const bestTxt = bestValid?.eval
          ? bestValid.eval.score.toFixed(2)
          : (bestAny?.eval ? bestAny.eval.score.toFixed(2) : "—");
        appendADLog(`Opt ${seedRank}/${totalSeeds} • ${iter}/${cfg.optimizeIters} • cur ${curEval.score.toFixed(2)} • best ${bestTxt}`);
        await adYield();
      }
    }

    return bestValid || bestInvalid || bestAny || { lens: clone(curEval.lens || cur), eval: curEval, iter: cfg.optimizeIters };
  }

  async function adRescueInvalidBest(bestItem, cfg) {
    const fallback = adBuildRescueSeed(cfg, cfg.targetEfl <= 60 ? "distagon" : "retrofocus");
    let curLens = sanitizeLens(clone(bestItem?.eval?.lens || bestItem?.lens || fallback));
    let curEval = adEvaluateCandidate(curLens, cfg, { quick: false });
    curLens = curEval.lens;
    let best = { lens: clone(curLens), eval: curEval, iter: 0 };

    for (let iter = 1; iter <= 260; iter++) {
      if (!adRunning) break;
      let candEval;

      if (iter % 2 === 0) {
        const tuned = sanitizeLens(clone(curLens));
        const s = tuned.surfaces;
        adQuickSanity(s, {
          targetStopAp: adStopApFromTarget(cfg.targetEfl, cfg.targetT),
          minRearGap: cfg.minRearGapMm,
          targetEfl: cfg.targetEfl,
        });
        adScaleTowardTargetEfl(s, cfg.targetEfl, cfg.wavePreset);
        adNudgeStopToTargetT(s, cfg.targetT, cfg.wavePreset);
        adNudgeBflForPL(s, cfg);
        const covPush = Array.isArray(curEval?.reasons) && (curEval.reasons.includes("COV") || curEval.reasons.includes("IC")) ? 1.0 : 0.0;
        adNudgeCoverage(s, cfg.sensorW, cfg.sensorH, cfg.wavePreset, cfg.quickRayCount, {
          force: covPush,
          targetEfl: cfg.targetEfl,
          targetT: cfg.targetT,
        });
        adQuickSanity(s, {
          targetStopAp: adStopApFromTarget(cfg.targetEfl, cfg.targetT),
          minRearGap: cfg.minRearGapMm,
          targetEfl: cfg.targetEfl,
        });
        candEval = adEvaluateCandidate(tuned, cfg, { quick: (iter % 6) !== 0 });
      } else {
        const m = adMutateLens(curLens, cfg, null, {
          edgeRmsInf: curEval.focusInf?.rmsEdge,
          centerRmsInf: curEval.focusInf?.rmsCenter,
          focusNearOk: curEval.focusNear?.ok,
          covFail: Array.isArray(curEval?.reasons) && curEval.reasons.includes("COV"),
          icFail: Array.isArray(curEval?.reasons) && curEval.reasons.includes("IC"),
        });
        candEval = adEvaluateCandidate(m.lens, cfg, { quick: (iter % 5) !== 0 });
      }

      if (candEval.valid && !curEval.valid) {
        curEval = candEval;
        curLens = candEval.lens;
      } else if (candEval.valid && curEval.valid) {
        if (candEval.score < curEval.score) {
          curEval = candEval;
          curLens = candEval.lens;
        }
      } else if (!candEval.valid && !curEval.valid) {
        if (adNearRank(candEval, cfg) < adNearRank(curEval, cfg)) {
          curEval = candEval;
          curLens = candEval.lens;
        }
      }

      if (candEval.valid && !best.eval.valid) {
        best = { lens: clone(candEval.lens), eval: candEval, iter };
      } else if (candEval.valid && best.eval.valid) {
        if (candEval.score < best.eval.score) {
          best = { lens: clone(candEval.lens), eval: candEval, iter };
        }
      } else if (!candEval.valid && !best.eval.valid) {
        if (adNearRank(candEval, cfg) < adNearRank(best.eval, cfg)) {
          best = { lens: clone(candEval.lens), eval: candEval, iter };
        }
      }

      if (best.eval.valid) break;
      if (iter % 52 === 0) {
        appendADLog(`Rescue ${iter}/260 • cur ${curEval.score.toFixed(2)} • best ${best.eval.score.toFixed(2)}`);
        await adYield();
      }
    }

    return best;
  }

  function adFormatEval(ev) {
    if (!ev) return "—";
    const efl = Number.isFinite(ev.efl) ? `${ev.efl.toFixed(2)}mm` : "—";
    const t = Number.isFinite(ev.T) ? ev.T.toFixed(2) : "—";
    const bfl = Number.isFinite(ev.bfl) ? `${ev.bfl.toFixed(2)}mm` : "—";
    const infShift = Number.isFinite(ev.focusInf?.shift) ? `${ev.focusInf.shift.toFixed(2)}mm` : "—";
    const nearShift = Number.isFinite(ev.focusNear?.shift) ? `${ev.focusNear.shift.toFixed(2)}mm` : "—";
    const dist = Number.isFinite(ev.distPct) ? `${ev.distPct.toFixed(2)}%` : "—";
    const fm = adNormalizeFocusTarget(ev.focusTarget || "both");
    const fmTxt = fm === "near" ? "focus 2m" : fm === "inf" ? "focus ∞" : "focus ∞+2m";
    return `score ${ev.score.toFixed(2)} • EFL ${efl} • T ${t} • BFL ${bfl} • shift∞ ${infShift} • shift2m ${nearShift} • dist ${dist} • ${fmTxt}`;
  }

  function adRefinePreviewShift(lensObj, focusTarget, fallbackShift = 0, targetEfl = 50, targetT = 2.0) {
    const fm = adNormalizeFocusTarget(focusTarget || "inf");
    const mode = fm === "both" ? "inf" : fm;
    const tmp = sanitizeLens(clone(lensObj || lens));
    const surfaces = tmp.surfaces;
    const eflUse = Number.isFinite(targetEfl) ? Number(targetEfl) : 50;
    const tUse = Number.isFinite(targetT) ? Number(targetT) : 2.0;
    adQuickSanity(surfaces, {
      targetStopAp: adStopApFromTarget(eflUse, tUse),
      minRearGap: Math.max(AD_CFG.minRearGapMm, AD_CFG.bflMinMm + 0.25),
      targetEfl: eflUse,
    });

    const wavePreset = ui.wavePreset?.value || "d";
    const rayCount = clamp(Math.round(num(ui.rayCount?.value, AD_CFG.fullRayCount)), 17, 81);
    const focusFieldDeg = Math.abs(num(ui.fieldAngle?.value, 0));
    const maxPosShift = adRearSafeMaxPositiveShift(surfaces, 0);
    const objectDistanceMm = mode === "near" ? AD_CFG.focusNearMm : Infinity;

    const res = adBestLensShiftForDistance(
      surfaces,
      objectDistanceMm,
      rayCount,
      wavePreset,
      AD_CFG.shiftMaxMm,
      focusFieldDeg,
      maxPosShift,
    );

    let shift = res.ok ? Number(res.shift || 0) : Number(fallbackShift || 0);
    shift = adClampShiftForRearClearance(surfaces, shift, 0);
    shift = clamp(shift, -AD_CFG.shiftMaxMm, AD_CFG.shiftMaxMm);
    return { shift, refined: !!res.ok };
  }

  async function runAutodesignPrime(opts = {}) {
    if (adRunning) return;
    const mode = String(opts?.mode || "prime").toLowerCase();
    const refineOnly = mode === "refine";

    const targetEfl = num(ui.adTargetEFL?.value, 50);
    const targetT = num(ui.adTargetT?.value, 2.0);
    const focusTarget = adNormalizeFocusTarget(ui.adFocusTarget?.value || "both");
    const attempts = clamp(Math.round(num(ui.adAttempts?.value, 1)), 1, 12);
    if (ui.adFocusTarget) ui.adFocusTarget.value = focusTarget;
    if (ui.adAttempts) ui.adAttempts.value = String(attempts);
    if (!Number.isFinite(targetEfl) || targetEfl <= 8) return toast("Autodesign: invalid target EFL");
    if (!Number.isFinite(targetT) || targetT <= 0.6) return toast("Autodesign: invalid target T");

    const effort = attempts;
    const cfg = {
      ...AD_CFG,
      targetEfl,
      targetT,
      focusTarget,
      sensorW: AD_CFG.sensorW,
      sensorH: AD_CFG.sensorH,
      wavePreset: "d",
      minRearGapMm: Math.max(AD_CFG.minRearGapMm, AD_CFG.bflMinMm + 0.25),
      seedCount: clamp(Math.round(AD_CFG.seedCount * effort), 24, 600),
      topK: clamp(Math.round(AD_CFG.topK + (effort - 1) * 1.3), 3, 12),
      optimizeIters: clamp(Math.round(AD_CFG.optimizeIters * effort), 120, 5200),
      logEvery: clamp(Math.round(AD_CFG.logEvery * Math.sqrt(effort)), 32, 320),
    };

    const prevBest = adBest ? clone(adBest) : null;
    const currentLensSnapshot = sanitizeLens(clone(lens));
    adRunning = true;
    adSetRunningUI(true);

    try {
      adForceFixedSensorPreset();
      setADLog(
        `Autodesigner ${AD_BUILD_TAG} start\n` +
        `Target EFL ${targetEfl.toFixed(2)}mm • Target T ${targetT.toFixed(2)}\n` +
        `Focus target: ${focusTarget === "near" ? "2000mm" : focusTarget === "inf" ? "infinity" : "infinity + 2000mm"}\n` +
        `Mode: ${refineOnly ? "Refine only (from current/best lens JSON)" : "Synthesis + refine"}\n` +
        `Effort: ${attempts}x (seeds ${cfg.seedCount}, iters ${cfg.optimizeIters}, topK ${cfg.topK})\n` +
        `Sensor ${cfg.sensorW.toFixed(2)}x${cfg.sensorH.toFixed(2)}mm • PL BFL>=${cfg.bflMinMm.toFixed(1)}\n` +
        `Rear gap guard: >=${cfg.minRearGapMm.toFixed(1)}mm\n` +
        `Focus near distance: ${cfg.focusNearMm.toFixed(0)}mm\n`
      );

      const isUsableNear = (ev) => {
        if (!ev) return false;
        const targetE = Math.max(1, Number(cfg.targetEfl || 50));
        const e = Number(ev.efl);
        const ic = Number(ev.icDiag);
        const vf = Number(ev.focusNear?.validFrac ?? ev.focusInf?.validFrac);
        const tVal = Number(ev.T);
        if (!Number.isFinite(e) || e <= 1) return false;
        const eFrac = Math.abs(e - targetE) / targetE;
        if (eFrac > 0.95) return false;
        if (Number.isFinite(tVal) && tVal > Number(cfg.targetT || 2.0) * 2.2) return false;
        if (!Number.isFinite(ic) || ic < 4) return false;
        if (Number.isFinite(vf) && vf < 0.08) return false;
        return true;
      };

      const topSeeds = [];
      if (refineOnly) {
        appendADLog("Stage A skipped: refine-only mode.");
        const hasCurrentLens = Array.isArray(currentLensSnapshot?.surfaces) && currentLensSnapshot.surfaces.length >= 4;
        const srcLens = hasCurrentLens
          ? clone(currentLensSnapshot)
          : (prevBest?.lens ? clone(prevBest.lens) : clone(currentLensSnapshot));
        const srcLabel = hasCurrentLens ? "current lens/json" : (prevBest?.lens ? "previous best" : "current lens");
        const warmInput = { lens: srcLens, eval: { lens: srcLens } };
        const baseLens = adBuildWarmStartSeed(warmInput, cfg) || adConditionSeedLens(srcLens, cfg);
        const baseEval = adEvaluateCandidate(baseLens, cfg, { quick: false });
        const baseItem = { family: `refine-base:${srcLabel}`, lens: clone(baseEval.lens), eval: baseEval };
        const refinePool = [baseItem];
        appendADLog(`Refine baseline loaded: ${adFormatEval(baseEval)}`);

        const topoBase = adCaptureTopology(baseItem.lens);
        const extraVariants = clamp(Math.round(cfg.topK * 2.0), 4, 16);
        for (let i = 0; i < extraVariants; i++) {
          const m = adMutateLens(baseItem.lens, cfg, topoBase, {
            edgeRmsInf: baseEval.focusInf?.rmsEdge,
            centerRmsInf: baseEval.focusInf?.rmsCenter,
            focusNearOk: baseEval.focusNear?.ok,
            covFail: Array.isArray(baseEval?.reasons) && baseEval.reasons.includes("COV"),
            icFail: Array.isArray(baseEval?.reasons) && baseEval.reasons.includes("IC"),
          });
          const tuned = adConditionSeedLens(m.lens, cfg);
          const ev = adEvaluateCandidate(tuned, cfg, { quick: false });
          refinePool.push({ family: `refine-variant-${i + 1}`, lens: clone(ev.lens), eval: ev });
        }

        const hasTrueValid = refinePool.some((x) => !!x?.eval?.valid);
        refinePool.sort((a, b) => {
          if (hasTrueValid) return Number(a.eval?.score || 1e12) - Number(b.eval?.score || 1e12);
          return adNearRank(a.eval, cfg) - adNearRank(b.eval, cfg);
        });

        const take = Math.min(cfg.topK, refinePool.length);
        for (let i = 0; i < take; i++) {
          const item = refinePool[i];
          if (!item?.eval?.valid && !isUsableNear(item.eval) && i > 0) continue;
          topSeeds.push(item);
        }
        if (!topSeeds.length && refinePool.length) {
          topSeeds.push(refinePool[0]);
        }
        appendADLog(`Refine pool: ${refinePool.length} candidates • selected ${topSeeds.length}`);
      } else {
        appendADLog("Stage A: template synthesis + quick guards...");
        const seeds = await adGenerateSeeds(cfg);
        if (!adRunning) return;

        const seedPool = seeds.valid.length ? seeds.valid : seeds.near;
        if (!seedPool.length) {
          appendADLog("No candidates generated.");
          toast("Autodesign: geen candidates");
          return;
        }

        let warmStartItem = null;
        if (adIsWarmStartCompatible(prevBest, cfg)) {
          const warmLens = adBuildWarmStartSeed(prevBest, cfg);
          if (warmLens) {
            const warmEval = adEvaluateCandidate(warmLens, cfg, { quick: false });
            warmStartItem = { family: "warm-prev", lens: clone(warmEval.lens), eval: warmEval };
            seedPool.push(warmStartItem);
            appendADLog(`Warm start loaded: ${adFormatEval(warmEval)}`);
          }
        }

        const hasTrueValid = seedPool.some((x) => !!x?.eval?.valid);
        seedPool.sort((a, b) => {
          if (hasTrueValid) return a.eval.score - b.eval.score;
          return adNearRank(a.eval, cfg) - adNearRank(b.eval, cfg);
        });
        if (warmStartItem && (warmStartItem.eval.valid || isUsableNear(warmStartItem.eval))) {
          topSeeds.push(warmStartItem);
        }
        const forcedFamilies = ["plbase", "distagon", "retrofocus"];
        for (const fam of forcedFamilies) {
          if (topSeeds.length >= cfg.topK) break;
          const sForced = adBuildRescueSeed(cfg, fam);
          const eForced = adEvaluateCandidate(sForced, cfg, { quick: false });
          if (eForced.valid || isUsableNear(eForced)) {
            topSeeds.push({ family: `${fam}:forced`, lens: clone(eForced.lens), eval: eForced });
          }
        }
        for (const item of seedPool) {
          if (topSeeds.length >= cfg.topK) break;
          if (topSeeds.includes(item)) continue;
          if (!item?.eval?.valid && !isUsableNear(item.eval)) continue;
          topSeeds.push(item);
        }
        if (!topSeeds.length && seedPool.length) {
          topSeeds.push(seedPool[0]);
        }
        const minTop = Math.min(3, seedPool.length, cfg.topK);
        if (topSeeds.length < minTop) {
          for (const item of seedPool) {
            if (topSeeds.length >= minTop) break;
            if (topSeeds.includes(item)) continue;
            topSeeds.push(item);
          }
        }
        const trueValidCount = seeds.valid.filter((x) => !!x?.eval?.valid).length;
        appendADLog(`Stage A done: ${trueValidCount} valid seeds (${seedPool.length} usable).`);
        if (trueValidCount === 0) appendADLog("Stage A note: using near-ranked fallback candidates (no strictly valid seed yet).");
      }

      if (!topSeeds.length) {
        appendADLog("No refine candidates available.");
        toast("Autodesign: geen geschikte refine candidates");
        return;
      }
      appendADLog(`Stage B: optimize top ${topSeeds.length} seeds...`);

      let bestValid = null;
      let bestNear = null;
      for (let i = 0; i < topSeeds.length; i++) {
        if (!adRunning) break;
        appendADLog(`--- Seed ${i + 1}/${topSeeds.length} (${topSeeds[i].family}) ---`);
        const out = await adOptimizeSeed(topSeeds[i], cfg, i + 1, topSeeds.length);
        appendADLog(`Seed ${i + 1} done: ${adFormatEval(out.eval)}`);

        if (out?.eval?.valid) {
          if (!bestValid || out.eval.score < bestValid.eval.score) bestValid = out;
        } else {
          if (!bestNear || adNearRank(out.eval, cfg) < adNearRank(bestNear.eval, cfg)) bestNear = out;
        }
      }
      let globalBest = bestValid || bestNear;

      if (!adRunning) return;
      if (!globalBest) {
        appendADLog("No best result.");
        toast("Autodesign: geen resultaat");
        return;
      }

      adBest = globalBest;

      if (!globalBest.eval.valid) {
        appendADLog("Stage C: rescue invalid best candidate...");
        const rescued = await adRescueInvalidBest(globalBest, cfg);
        if (!adRunning) return;
        if (
          rescued?.eval && (
            rescued.eval.valid ||
            (
              !globalBest.eval.valid &&
              adNearRank(rescued.eval, cfg) < adNearRank(globalBest.eval, cfg)
            ) ||
            (
              globalBest.eval.valid &&
              rescued.eval.score < globalBest.eval.score
            )
          )
        ) {
          globalBest = rescued;
          adBest = rescued;
          appendADLog(`Rescue done: ${adFormatEval(rescued.eval)}`);
        }
      }

      if (!globalBest.eval.valid) {
        appendADLog("Stage D: continuation from best candidate...");
        const contCfg = {
          ...cfg,
          optimizeIters: clamp(Math.round(cfg.optimizeIters * 0.65), 280, 4200),
          logEvery: clamp(Math.round(cfg.logEvery * 0.85), 28, 280),
          tempStart: Math.max(0.7, cfg.tempStart * 0.72),
          tempEnd: Math.max(0.04, cfg.tempEnd * 0.70),
          invalidRestartEvery: clamp(Math.round(cfg.invalidRestartEvery * 0.75), 40, 140),
          covWeight: cfg.covWeight * 1.45,
          vigWeight: cfg.vigWeight * 1.35,
          midRmsWeight: cfg.midRmsWeight * 1.35,
        };
        const continued = await adOptimizeSeed(
          { family: "continuation", lens: clone(globalBest.lens), eval: clone(globalBest.eval) },
          contCfg,
          1,
          1,
        );
        if (!adRunning) return;
        if (
          continued?.eval && (
            continued.eval.valid ||
            (
              !globalBest.eval.valid &&
              adNearRank(continued.eval, cfg) < adNearRank(globalBest.eval, cfg)
            ) ||
            (
              globalBest.eval.valid &&
              continued.eval.score < globalBest.eval.score
            )
          )
        ) {
          globalBest = continued;
          adBest = continued;
          appendADLog(`Continuation done: ${adFormatEval(continued.eval)}`);
        }
      }

      if (!globalBest.eval.valid) {
        appendADLog(`Best candidate is still invalid: ${globalBest.eval.reasons.join(", ")}`);
        appendADLog(adFormatEval(globalBest.eval));
        appendADLog(`Preview Best is beschikbaar voor visuele inspectie.`);
        toast("Autodesign klaar (invalid), maar Preview Best is beschikbaar");
        return;
      }

      loadLens(globalBest.lens);
      if (ui.focusMode) ui.focusMode.value = "lens";
      if (ui.sensorOffset) ui.sensorOffset.value = "0";
      const previewShiftRaw = focusTarget === "near"
        ? Number(globalBest.eval.focusNear?.shift || 0)
        : Number(globalBest.eval.focusInf?.shift || 0);
      const refinedPreview = adRefinePreviewShift(
        globalBest.lens,
        focusTarget,
        previewShiftRaw,
        Number(globalBest.eval?.efl || targetEfl),
        targetT,
      );
      if (ui.lensFocus) ui.lensFocus.value = refinedPreview.shift.toFixed(2);
      scheduleAutosave();
      renderAll();
      if (Math.abs(refinedPreview.shift - previewShiftRaw) > 0.05) {
        appendADLog(`Preview focus refined: ${previewShiftRaw.toFixed(2)}mm -> ${refinedPreview.shift.toFixed(2)}mm.`);
      }

      appendADLog("Done: valid prime generated.");
      appendADLog(adFormatEval(globalBest.eval));
      appendADLog(`JSON ready via Save JSON. Je kunt ook altijd op "Preview Best" klikken.`);
      toast(`Autodesign done • merit ${globalBest.eval.score.toFixed(2)}`);
    } catch (err) {
      console.error(err);
      appendADLog(`ERROR: ${err?.message || String(err)}`);
      toast("Autodesign error");
    } finally {
      adRunning = false;
      adSetRunningUI(false);
    }
  }

  function previewAutodesignBest() {
    if (!adBest?.lens) return toast("No best design yet");

    const mode = adNormalizeFocusTarget(ui.adFocusTarget?.value || adBest?.eval?.focusTarget || "both");
    const shiftRaw = mode === "near"
      ? Number(adBest.eval?.focusNear?.shift || 0)
      : Number(adBest.eval?.focusInf?.shift || 0);
    const refined = adRefinePreviewShift(
      adBest.lens,
      mode,
      shiftRaw,
      Number(adBest.eval?.efl || num(ui.adTargetEFL?.value, 50)),
      num(ui.adTargetT?.value, 2.0),
    );
    const safeShift = refined.shift;
    const modeTxt = mode === "near"
      ? "focus 2000mm"
      : mode === "inf"
        ? "focus infinity"
        : "focus infinity (checked on both)";

    loadLens(adBest.lens);
    if (ui.focusMode) ui.focusMode.value = "lens";
    if (ui.sensorOffset) ui.sensorOffset.value = "0";
    if (ui.lensFocus) ui.lensFocus.value = safeShift.toFixed(2);
    scheduleAutosave();
    renderAll();

    if (Math.abs(safeShift - shiftRaw) > 1e-4) {
      appendADLog(`Preview focus refined ${shiftRaw.toFixed(2)}mm -> ${safeShift.toFixed(2)}mm.`);
    }

    appendADLog(
      `Preview Best loaded (${modeTxt}, shift ${safeShift.toFixed(2)}mm, ` +
      `EFL ${Number.isFinite(adBest.eval?.efl) ? adBest.eval.efl.toFixed(2) : "—"}mm, ` +
      `BFL ${Number.isFinite(adBest.eval?.bfl) ? adBest.eval.bfl.toFixed(2) : "—"}mm).`
    );
    toast("Preview Best loaded");
  }

  function stopAutodesign() {
    if (!adRunning) return;
    adRunning = false;
    appendADLog("Stop requested...");
    toast("Autodesigner stopping...");
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
    ["adTargetEFL", "adTargetT", "adFocusTarget", "adAttempts"].forEach((id) => {
      ui[id]?.addEventListener("input", () => scheduleAutosave());
      ui[id]?.addEventListener("change", () => scheduleAutosave());
    });

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
    ui.btnAutoDesign?.addEventListener("click", () => {
      runAutodesignPrime().catch((err) => {
        console.error(err);
        toast("Autodesign failed");
      });
    });
    ui.btnAutoDesignRefine?.addEventListener("click", () => {
      runAutodesignPrime({ mode: "refine" }).catch((err) => {
        console.error(err);
        toast("Refine failed");
      });
    });
    ui.btnAutoDesignPreview?.addEventListener("click", previewAutodesignBest);
    ui.btnAutoDesignStop?.addEventListener("click", stopAutodesign);
    ui.btnAdLogExpand?.addEventListener("click", toggleAdLogExpanded);
    ui.btnAdToggleDetails?.addEventListener("click", toggleAdDetailsCollapsed);

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
    setAdLogExpanded(false);
    setAdDetailsCollapsed(false);
    adSetRunningUI(false);
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
      expandMiddleApertures(lens.surfaces);
      clampAllApertures(lens.surfaces);
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

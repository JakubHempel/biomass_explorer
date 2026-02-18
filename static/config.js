const API_URL = window.location.origin;

// =========================================================================
//  TOAST NOTIFICATION SYSTEM
// =========================================================================
const TOAST_ICONS = { error: '!', warning: '!', success: '\u2713', info: 'i' };

function showToast(message, type, duration) {
    type = type || 'error';
    duration = duration !== undefined ? duration : 5000;
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML =
        '<span class="toast-icon">' + (TOAST_ICONS[type] || 'i') + '</span>' +
        '<span class="toast-body">' + message + '</span>' +
        '<button type="button" class="toast-close" aria-label="Dismiss notification">&times;</button>';
    toast.querySelector('.toast-close').addEventListener('click', function() { dismissToast(toast); });
    container.appendChild(toast);
    if (duration > 0) {
        setTimeout(function() { dismissToast(toast); }, duration);
    }
}

function dismissToast(toast) {
    if (!toast || toast.classList.contains('toast-removing')) return;
    toast.classList.add('toast-removing');
    setTimeout(function() { toast.remove(); }, 220);
}

// =========================================================================
//  ABOUT PANEL TOGGLE  (always accessible from header)
// =========================================================================
function toggleAboutPanel() {
    var overlay = document.getElementById('about-overlay');
    var btn = document.getElementById('btn-about');
    var isOpen = overlay.style.display !== 'none';
    if (isOpen) {
        overlay.classList.add('closing');
        setTimeout(function() {
            overlay.style.display = 'none';
            overlay.classList.remove('closing');
        }, 150);
    } else {
        overlay.style.display = 'flex';
        overlay.classList.remove('closing');
        var closeBtn = overlay.querySelector('.about-close-btn');
        if (closeBtn) closeBtn.focus();
    }
    btn.classList.toggle('active', !isOpen);
}

// =========================================================================
//  SENSOR ↔ INDEX MAPPING
// =========================================================================
const S2_INDICES = new Set(['NDVI','NDRE','GNDVI','EVI','SAVI','CIre','MTCI','IRECI','NDMI','NMDI']);
const LS_INDICES = new Set(['LST','VSWI','TVDI','TCI','VHI']);

// =========================================================================
//  INDEX METADATA  (short name, full name, formula, description, gradient, range)
// =========================================================================
const INDEX_INFO = {
    "NDVI":  { short: "NDVI",  full: "Normalized Difference Vegetation Index",        formula: "(B8 − B4) / (B8 + B4)",                          desc: "Crops 0.1–0.3 early growth, 0.4–0.6 mid-season, 0.6–0.9 peak canopy.",  gradient: "linear-gradient(to right, #a50026, #d73027, #f46d43, #fdae61, #fee08b, #d9ef8b, #a6d96a, #66bd63, #1a9850, #006837)", range: ["-0.2", "1.0"], chartColor: "#1a9850" },
    "NDRE":  { short: "NDRE",  full: "Normalized Difference Red Edge Index",           formula: "(B8 − B5) / (B8 + B5)",                          desc: "Best at mid-to-late season; <0.2 bare soil, 0.2–0.6 developing, >0.6 healthy.",  gradient: "linear-gradient(to right, #440154, #482878, #3e4989, #31688e, #26828e, #1f9e89, #35b779, #6ece58, #b5de2b, #fde725)", range: ["-0.2", "0.8"], chartColor: "#6ece58" },
    "GNDVI": { short: "GNDVI", full: "Green Normalized Difference Vegetation Index",   formula: "(B8 − B3) / (B8 + B3)",                          desc: "More sensitive to chlorophyll & nitrogen than NDVI in dense canopies.",   gradient: "linear-gradient(to right, #a50026, #f46d43, #fee08b, #addd8e, #66bd63, #006837)",                                     range: ["-0.2", "0.9"], chartColor: "#66bd63" },
    "EVI":   { short: "EVI",   full: "Enhanced Vegetation Index",                      formula: "2.5 × (B8 − B4) / (B8 + 6·B4 − 7.5·B2 + 1)",   desc: "Healthy crops 0.2–0.8; corrects atmospheric & soil noise in high-LAI.",  gradient: "linear-gradient(to right, #CE7E45, #DF923D, #F1B555, #FCD163, #99B718, #74A901, #66A000, #529400, #3E8601, #207401)", range: ["-0.2", "0.8"], chartColor: "#74A901" },
    "SAVI":  { short: "SAVI",  full: "Soil Adjusted Vegetation Index",                 formula: "1.5 × (B8 − B4) / (B8 + B4 + L)",               desc: "Best when canopy cover <40%; reduces soil brightness in sparse crops.",   gradient: "linear-gradient(to right, #8c510a, #bf812d, #dfc27d, #f6e8c3, #c7eae5, #80cdc1, #35978f, #01665e)",                  range: ["-0.2", "0.8"], chartColor: "#35978f" },
    "CIre":  { short: "CI-re", full: "Chlorophyll Index – Red Edge",                   formula: "(B7 / B5) − 1",                                  desc: "Linear proxy for canopy chlorophyll; crops typically 1–8.",              gradient: "linear-gradient(to right, #ffffcc, #d9f0a3, #addd8e, #78c679, #41ab5d, #238443, #005a32)",                            range: ["0", "10"], chartColor: "#238443" },
    "MTCI":  { short: "MTCI",  full: "MERIS Terrestrial Chlorophyll Index",            formula: "(B6 − B5) / (B5 − B4)",                          desc: "Near-linear with chlorophyll; crops 1–5, peak canopy ≈ 4–6.",           gradient: "linear-gradient(to right, #ffffb2, #fed976, #feb24c, #fd8d3c, #fc4e2a, #e31a1c, #b10026)",                            range: ["0", "6"], chartColor: "#e31a1c" },
    "IRECI": { short: "IRECI", full: "Inverted Red-Edge Chlorophyll Index",            formula: "(B7 − B4) / (B5 / B6)",                          desc: "Four-band red-edge chlorophyll; crops ~0.2–2.5, dense canopy up to 3.",  gradient: "linear-gradient(to right, #fef0d9, #fdd49e, #fdbb84, #fc8d59, #ef6548, #d7301f, #990000)",                            range: ["0", "3"], chartColor: "#d7301f" },
    "NDMI":  { short: "NDMI",  full: "Normalized Difference Moisture Index",           formula: "(B8 − B11) / (B8 + B11)",                        desc: "Leaf water content; <−0.2 dry stress, 0–0.4 adequate, >0.4 well-watered.",  gradient: "linear-gradient(to right, #8c510a, #d8b365, #f6e8c3, #c7eae5, #5ab4ac, #2166ac, #053061)",                        range: ["-0.8", "0.8"], chartColor: "#2166ac" },
    "NMDI":  { short: "NMDI",  full: "Normalized Multi-band Drought Index",            formula: "(B8 − (B11 − B12)) / (B8 + (B11 − B12))",        desc: "Dual-SWIR drought monitor; higher values = more soil/vegetation moisture.",  gradient: "linear-gradient(to right, #d73027, #fc8d59, #fee090, #ffffbf, #e0f3f8, #91bfdb, #4575b4)",                        range: ["0", "1.0"], chartColor: "#4575b4" },
    "LST":   { short: "LST",   full: "Land Surface Temperature",                    formula: "Landsat ST_B10 → °C",                               desc: "Thermal IR surface temp; crops stressed above 35 °C, optimal 15–30 °C.",     gradient: "linear-gradient(to right, #08306b, #2171b5, #6baed6, #bdd7e7, #ffffcc, #fed976, #fd8d3c, #e31a1c, #800026)",        range: ["0 °C", "45 °C"], chartColor: "#e31a1c" },
    "VSWI":  { short: "VSWI",  full: "Vegetation Supply Water Index",               formula: "NDVI / LST (°C)",                                   desc: "Water-availability proxy; higher = well-watered, lower = drought stress.",    gradient: "linear-gradient(to right, #d73027, #fc8d59, #fee08b, #d9ef8b, #66bd63, #1a9850)",                                   range: ["0", "0.06"], chartColor: "#1a9850" },
    "TVDI":  { short: "TVDI",  full: "Temperature–Vegetation Dryness Index",        formula: "(LST − LSTmin) / (LSTmax − LSTmin)",                desc: "Spatial moisture pattern; 0 = wet surface, 1 = dry/stressed surface.",       gradient: "linear-gradient(to right, #2166ac, #67a9cf, #d1e5f0, #fddbc7, #ef8a62, #b2182b)",                                   range: ["0", "1"], chartColor: "#b2182b" },
    "TCI":   { short: "TCI",   full: "Temperature Condition Index",                 formula: "(LSTmax − LST) / (LSTmax − LSTmin) × 100",         desc: "Kogan (1995); 0 % = extreme heat stress, 100 % = cool optimal.",            gradient: "linear-gradient(to right, #d73027, #fc8d59, #fee08b, #d9ef8b, #66bd63, #1a9850)",                                   range: ["0", "100"], chartColor: "#fc8d59" },
    "VHI":   { short: "VHI",   full: "Vegetation Health Index",                     formula: "0.5 × VCI + 0.5 × TCI",                            desc: "Composite; <40 drought, 40–60 fair, >60 healthy vegetation.",               gradient: "linear-gradient(to right, #d73027, #fc8d59, #fee08b, #d9ef8b, #66bd63, #1a9850)",                                   range: ["0", "100"], chartColor: "#66bd63" },
    "RGB":   { short: "RGB",   full: "True Color Composite",                       formula: "Red / Green / Blue",                                desc: "Natural-color satellite scene for visual reference.",                        gradient: "linear-gradient(to right, #000, #444, #888, #ccc, #fff)",                                                           range: ["Dark", "Bright"], isRGB: true }
};

// =========================================================================
//  CROP CONDITION THRESHOLDS
// =========================================================================
const INDEX_THRESHOLDS = {
    NDVI:  { dir: 'higher', levels: [{v:.70, l:'Excellent'},{v:.50, l:'Good'},{v:.30, l:'Fair'},{v:.10, l:'Poor'},{v:-Infinity, l:'Critical'}] },
    NDRE:  { dir: 'higher', levels: [{v:.50, l:'Excellent'},{v:.30, l:'Good'},{v:.20, l:'Fair'},{v:.10, l:'Poor'},{v:-Infinity, l:'Critical'}] },
    GNDVI: { dir: 'higher', levels: [{v:.60, l:'Excellent'},{v:.40, l:'Good'},{v:.30, l:'Fair'},{v:.15, l:'Poor'},{v:-Infinity, l:'Critical'}] },
    EVI:   { dir: 'higher', levels: [{v:.60, l:'Excellent'},{v:.40, l:'Good'},{v:.20, l:'Fair'},{v:.10, l:'Poor'},{v:-Infinity, l:'Critical'}] },
    SAVI:  { dir: 'higher', levels: [{v:.60, l:'Excellent'},{v:.40, l:'Good'},{v:.20, l:'Fair'},{v:.10, l:'Poor'},{v:-Infinity, l:'Critical'}] },
    CIre:  { dir: 'higher', levels: [{v:6,   l:'Excellent'},{v:4,   l:'Good'},{v:2,   l:'Fair'},{v:1,   l:'Poor'},{v:-Infinity, l:'Critical'}] },
    MTCI:  { dir: 'higher', levels: [{v:4,   l:'Excellent'},{v:3,   l:'Good'},{v:2,   l:'Fair'},{v:1,   l:'Poor'},{v:-Infinity, l:'Critical'}] },
    IRECI: { dir: 'higher', levels: [{v:2,   l:'Excellent'},{v:1.5, l:'Good'},{v:.8,  l:'Fair'},{v:.3,  l:'Poor'},{v:-Infinity, l:'Critical'}] },
    NDMI:  { dir: 'higher', levels: [{v:.30, l:'Excellent'},{v:.10, l:'Good'},{v: 0,  l:'Fair'},{v:-.2, l:'Poor'},{v:-Infinity, l:'Critical'}] },
    NMDI:  { dir: 'higher', levels: [{v:.70, l:'Excellent'},{v:.50, l:'Good'},{v:.30, l:'Fair'},{v:.10, l:'Poor'},{v:-Infinity, l:'Critical'}] },
    LST:   { dir: 'lower',  levels: [{v:25,  l:'Optimal'},{v:30,   l:'Good'},{v:35,  l:'Fair'},{v:40,  l:'Warm'},{v:Infinity, l:'Critical'}] },
    VSWI:  { dir: 'higher', levels: [{v:.04, l:'Excellent'},{v:.03, l:'Good'},{v:.02, l:'Fair'},{v:.01, l:'Poor'},{v:-Infinity, l:'Critical'}] },
    TVDI:  { dir: 'lower',  levels: [{v:.30, l:'Wet'},{v:.50,      l:'Normal'},{v:.70, l:'Dry'},{v:.85, l:'Very Dry'},{v:Infinity, l:'Critical'}] },
    TCI:   { dir: 'higher', levels: [{v:80,  l:'Excellent'},{v:60,  l:'Good'},{v:40,  l:'Fair'},{v:20,  l:'Poor'},{v:-Infinity, l:'Critical'}] },
    VHI:   { dir: 'higher', levels: [{v:60,  l:'Excellent'},{v:40,  l:'Good'},{v:30,  l:'Fair'},{v:20,  l:'Poor'},{v:-Infinity, l:'Critical'}] },
};

function conditionClass(label) {
    const m = {
        'Excellent':'cond-excellent','Optimal':'cond-excellent','Wet':'cond-excellent',
        'Good':'cond-good','Normal':'cond-good',
        'Fair':'cond-fair',
        'Poor':'cond-poor','Warm':'cond-poor','Dry':'cond-poor','Very Dry':'cond-poor',
        'Critical':'cond-critical'
    };
    return m[label] || 'cond-neutral';
}

function evaluateCondition(idx, value) {
    const t = INDEX_THRESHOLDS[idx];
    if (!t) return { label: '—', cls: 'cond-neutral' };
    for (const lv of t.levels) {
        if (t.dir === 'higher' && value >= lv.v) return { label: lv.l, cls: conditionClass(lv.l) };
        if (t.dir === 'lower'  && value <= lv.v) return { label: lv.l, cls: conditionClass(lv.l) };
    }
    return { label: '—', cls: 'cond-neutral' };
}

function formatStatValue(idx, val) {
    if (val == null) return 'N/A';
    if (idx === 'LST')  return val.toFixed(1) + ' °C';
    if (idx === 'TCI' || idx === 'VHI') return val.toFixed(1) + ' %';
    if (idx === 'VSWI') return val.toFixed(4);
    if (idx === 'CIre' || idx === 'MTCI' || idx === 'IRECI') return val.toFixed(2);
    return val.toFixed(3);
}

function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
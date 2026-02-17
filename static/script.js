const API_URL = window.location.origin;

// =========================================================================
//  ABOUT PANEL TOGGLE  (always accessible from header)
// =========================================================================
function toggleAboutPanel() {
    const overlay = document.getElementById('about-overlay');
    const btn = document.getElementById('btn-about');
    const isOpen = overlay.style.display !== 'none';
    overlay.style.display = isOpen ? 'none' : 'flex';
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

// =========================================================================
//  MAP CORE
// =========================================================================
const satellite = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=en', { maxNativeZoom: 20, maxZoom: 22 });
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 22 });

const map = L.map('map', { center: [52.0, 19.0], zoom: 6, maxZoom: 22, layers: [satellite] });
const baseMaps = { satellite, osm };

L.control.scale({ metric: true, imperial: false }).addTo(map);
const miniMap = new L.Control.MiniMap(L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'), { toggleDisplay: true, position: 'bottomleft' }).addTo(map);

const cadastralLayer = L.tileLayer.wms(
    'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow',
    { layers: 'dzialki,numery_dzialek', format: 'image/png', transparent: true, version: '1.1.1', maxZoom: 22 }
);

function toggleCadastral(on) {
    if (on) { cadastralLayer.addTo(map); }
    else    { map.removeLayer(cadastralLayer); }
}

const layersPanel = document.getElementById('layers-panel');
L.DomEvent.disableClickPropagation(layersPanel);
L.DomEvent.disableScrollPropagation(layersPanel);

const chartPopup = document.getElementById('chart-popup');
L.DomEvent.disableClickPropagation(chartPopup);
L.DomEvent.disableScrollPropagation(chartPopup);

const mapToolsEl = document.getElementById('map-tools');
L.DomEvent.disableClickPropagation(mapToolsEl);

const coordDisplayEl = document.getElementById('coord-display');
L.DomEvent.disableClickPropagation(coordDisplayEl);

const sidebarToggleEl = document.getElementById('sidebar-toggle');
L.DomEvent.disableClickPropagation(sidebarToggleEl);

let activeLayers = [];   // { layer, idx, date, sensor, label }
let aoiLayer = null;

// =========================================================================
//  SHARED AOI STATE
// =========================================================================
let currentAOI = null;
let mapPickActive = false;

// =========================================================================
//  LAST ANALYSIS DATA — kept for chart
// =========================================================================
let lastAnalysisData = null;
let lastRequestedIndices = [];

// =========================================================================
//  AOI TAB SWITCHING
// =========================================================================
function switchAoiTab(tab) {
    document.querySelectorAll('.aoi-method').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.aoi-tab-content').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById('aoi-panel-' + tab);
    if (panel) panel.classList.add('active');
    if (tab !== 'mapclick' && mapPickActive) disableMapPick();
    document.getElementById('aoi-status').style.display = 'none';
}

// =========================================================================
//  SET AOI
// =========================================================================
function setAOI(geojson, info) {
    currentAOI = geojson;
    if (aoiLayer) map.removeLayer(aoiLayer);
    aoiLayer = L.geoJSON(geojson, {
        style: { color: "#ffffff", weight: 3, fillOpacity: 0.05, dashArray: "8, 8" }
    }).addTo(map);
    map.fitBounds(aoiLayer.getBounds(), { padding: [50, 50], animate: true });

    const statusEl = document.getElementById('aoi-status');
    if (info) {
        let html = '<span class="aoi-ok-icon">&#10003;</span>';
        html += '<span>Parcel <b>' + (info.parcel_id || '—') + '</b>';
        if (info.region)  html += ' &middot; ' + info.region;
        if (info.commune) html += ' &middot; ' + info.commune;
        html += '</span>';
        statusEl.innerHTML = html;
    } else {
        statusEl.innerHTML = '<span class="aoi-ok-icon">&#10003;</span><span>Custom polygon loaded</span>';
    }
    statusEl.style.display = 'flex';

    const fieldName = document.getElementById('field_id').value.trim();
    if (fieldName) saveFieldToRecent(fieldName, geojson, info);

    // Show edit boundary button + recenter on map
    const editBtn = document.getElementById('btn-edit-aoi');
    if (editBtn) editBtn.style.display = 'flex';
    const recenterBtn = document.getElementById('btn-recenter');
    if (recenterBtn) recenterBtn.style.display = 'flex';
}

// =========================================================================
//  TAB 1 — PARCEL SEARCH
// =========================================================================
async function searchParcel() {
    const query = document.getElementById('parcel_query').value.trim();
    if (!query) { alert('Please enter a parcel ID or region name + number.'); return; }

    const btn = document.getElementById('btn-parcel-search');
    const txt = document.getElementById('btn-parcel-text');
    const spin = document.getElementById('btn-parcel-spinner');
    btn.disabled = true; txt.innerText = 'SEARCHING...'; spin.style.display = 'inline-block';

    try {
        const res = await fetch(API_URL + '/api/uldk/search?q=' + encodeURIComponent(query));
        if (res.status === 404) { throw new Error('No parcel found. Check the ID or name.'); }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'ULDK lookup failed (' + res.status + ')');
        }
        const data = await res.json();
        if (data.count === 0 || !data.results.length) throw new Error('No parcel found.');
        const first = data.results[0];
        setAOI(first.geojson, first);
        const infoEl = document.getElementById('parcel-info');
        infoEl.innerHTML = buildParcelInfoHTML(first, data.count);
        infoEl.style.display = 'block';
    } catch(e) { alert(e.message); }

    btn.disabled = false; txt.innerText = 'FIND PARCEL'; spin.style.display = 'none';
}

// =========================================================================
//  TAB 2 — MAP CLICK PICK
// =========================================================================
function toggleMapPick() {
    if (mapPickActive) { disableMapPick(); } else { enableMapPick(); }
}
function enableMapPick() {
    mapPickActive = true;
    document.getElementById('map').classList.add('map-pick-active');
    document.getElementById('btn-pick').classList.add('active');
    document.getElementById('btn-pick-text').innerText = 'CLICK ON MAP...';
    map.on('click', onMapPickClick);
}
function disableMapPick() {
    mapPickActive = false;
    document.getElementById('map').classList.remove('map-pick-active');
    document.getElementById('btn-pick').classList.remove('active');
    document.getElementById('btn-pick-text').innerText = 'PICK FROM MAP';
    map.off('click', onMapPickClick);
}
async function onMapPickClick(e) {
    const { lat, lng } = e.latlng;
    disableMapPick();
    const tempMarker = L.marker([lat, lng], {
        icon: L.divIcon({ className: 'pick-marker', html: '<div class="pick-marker-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })
    }).addTo(map);

    const pickInfo = document.getElementById('pick-info');
    pickInfo.innerHTML = '<span class="parcel-loading">Looking up parcel...</span>';
    pickInfo.style.display = 'block';

    try {
        const res = await fetch(API_URL + '/api/uldk/locate?lat=' + lat + '&lng=' + lng);
        if (res.status === 404) { throw new Error('No cadastral parcel found at this location. This service covers Poland only.'); }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'ULDK lookup failed (' + res.status + ')');
        }
        const data = await res.json();
        if (data.count === 0 || !data.results.length) throw new Error('No parcel found at this location.');
        const first = data.results[0];
        setAOI(first.geojson, first);
        pickInfo.innerHTML = buildParcelInfoHTML(first, 1);
    } catch(e) {
        pickInfo.innerHTML = '<span class="parcel-error">' + e.message + '</span>';
    }
    map.removeLayer(tempMarker);
}

// =========================================================================
//  TAB 3 — GEOJSON
// =========================================================================
function applyGeoJSON() {
    const raw = document.getElementById('geojson_input').value.trim();
    if (!raw) { alert('Paste GeoJSON coordinates first.'); return; }
    try {
        const coords = JSON.parse(raw);
        const geojson = { type: "Polygon", coordinates: coords };
        setAOI(geojson, null);
    } catch(e) {
        alert('Invalid GeoJSON. Expected a coordinates array like [[[lon,lat], ...]]. Error: ' + e.message);
    }
}

// =========================================================================
//  PARCEL INFO HTML HELPER
// =========================================================================
function buildParcelInfoHTML(parcel, totalCount) {
    let html = '<div class="parcel-meta">';
    html += '<div class="parcel-id-row"><span class="parcel-id-label">Parcel ID</span><span class="parcel-id-value">' + (parcel.parcel_id || '—') + '</span></div>';
    if (parcel.region)      html += '<div class="parcel-detail"><span>Region:</span><span>' + parcel.region + '</span></div>';
    if (parcel.commune)     html += '<div class="parcel-detail"><span>Commune:</span><span>' + parcel.commune + '</span></div>';
    if (parcel.county)      html += '<div class="parcel-detail"><span>County:</span><span>' + parcel.county + '</span></div>';
    if (parcel.voivodeship) html += '<div class="parcel-detail"><span>Voivodeship:</span><span>' + parcel.voivodeship + '</span></div>';
    if (totalCount > 1)     html += '<div class="parcel-note">Showing first of ' + totalCount + ' results</div>';
    html += '</div>';
    return html;
}

// =========================================================================
//  CUSTOM LAYERS PANEL
// =========================================================================
let layersPanelOpen = true;

function toggleLayersPanel() {
    layersPanelOpen = !layersPanelOpen;
    document.getElementById('lp-body').style.display = layersPanelOpen ? 'block' : 'none';
    document.querySelector('.layers-panel').classList.toggle('collapsed', !layersPanelOpen);
}

function switchBaseMap(key) {
    Object.values(baseMaps).forEach(l => map.removeLayer(l));
    baseMaps[key].addTo(map);
}

function addOverlayToPanel(layer, idx, date, sensor) {
    const container = document.getElementById('lp-overlays');
    const section = document.getElementById('lp-overlays-section');
    const opSection = document.getElementById('lp-opacity-section');
    section.style.display = 'block';
    opSection.style.display = 'block';

    const id = 'ol-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const info = INDEX_INFO[idx];
    const displayName = info ? info.short : idx;
    const sensorTag = sensor === 'Sentinel-2' ? 'S2' : 'L8/9';
    const sensorCls = sensor === 'Sentinel-2' ? 's2' : 'ls';

    const isRGB = (idx === 'RGB');
    const row = document.createElement('label');
    row.className = 'lp-overlay-row' + (isRGB ? ' lp-rgb-row' : '');
    row.setAttribute('for', id);

    const label = (isRGB ? 'RGB Scene' : displayName) + ' — ' + formatDate(date);
    row.innerHTML =
        '<input type="checkbox" id="' + id + '" class="lp-overlay-cb" data-layer-id="' + id + '">' +
        '<span class="lp-cb-mark"></span>' +
        '<span class="lp-overlay-info">' +
        '  <span class="lp-overlay-name">' + (isRGB ? 'RGB Scene' : displayName) + '</span>' +
        '  <span class="lp-overlay-meta">' +
        '    <span class="lp-sensor ' + sensorCls + '">' + sensorTag + '</span>' +
        '    <span class="lp-date">' + formatDate(date) + '</span>' +
        '  </span>' +
        '</span>';

    const cb = row.querySelector('input');
    cb.addEventListener('change', function() {
        if (this.checked) { layer.addTo(map); }
        else              { map.removeLayer(layer); }
    });

    container.appendChild(row);
    updateLayerCount();
}

function clearAllOverlays() {
    activeLayers.forEach(l => map.removeLayer(l));
    activeLayers = [];
    document.getElementById('lp-overlays').innerHTML = '';
    document.getElementById('lp-overlays-section').style.display = 'none';
    document.getElementById('lp-opacity-section').style.display = 'none';
    document.getElementById('legend-panel').style.display = 'none';
    document.getElementById('legend-tabs').innerHTML = '';
    updateLayerCount();
}

function updateLayerCount() {
    const count = document.querySelectorAll('.lp-overlay-cb').length;
    const badge = document.getElementById('lp-count');
    if (count > 0) { badge.innerText = count; badge.style.display = 'inline-flex'; }
    else           { badge.style.display = 'none'; }
}

function setOverlayOpacity(val) {
    const opacity = val / 100;
    document.getElementById('lp-opacity-val').innerText = val + '%';
    activeLayers.forEach(l => l.setOpacity(opacity));
}

// =========================================================================
//  STATUS BAR + PROGRESS
// =========================================================================
function setStatus(msg, type) {
    const el = document.getElementById('status');
    const txt = document.getElementById('status-text');
    txt.innerText = msg;
    el.className = '';
    if (type) el.classList.add('status-' + type);
}

function setProgress(pct) {
    const bar = document.getElementById('progress-bar');
    const fill = document.getElementById('progress-fill');
    if (pct < 0) { bar.style.display = 'none'; fill.style.width = '0%'; }
    else         { bar.style.display = 'block'; fill.style.width = Math.min(100, Math.max(0, pct)) + '%'; }
}

// =========================================================================
//  SELECT-ALL TOGGLE
// =========================================================================
function toggleGroupIndices(group, linkEl) {
    const boxes = document.querySelectorAll('input[name="idx"][data-group="' + group + '"]');
    const allChecked = Array.from(boxes).every(cb => cb.checked);
    boxes.forEach(cb => cb.checked = !allChecked);
    linkEl.innerText = allChecked ? 'select all' : 'deselect all';
}
function toggleSensorDates(sensor, linkEl) {
    const boxes = document.querySelectorAll('.date-checkbox[data-sensor="' + sensor + '"]');
    const allChecked = Array.from(boxes).every(cb => cb.checked);
    boxes.forEach(cb => cb.checked = !allChecked);
    linkEl.innerText = allChecked ? 'all' : 'none';
}

// =========================================================================
//  ZOOM TO AOI
// =========================================================================
function zoomToAOI() {
    if (!currentAOI) { alert("Please select an area of interest first."); return; }
    if (aoiLayer) { map.fitBounds(aoiLayer.getBounds(), { padding: [50, 50], animate: true }); }
}

// =========================================================================
//  LEGEND
// =========================================================================
function updateLegend(idx) {
    const info = INDEX_INFO[idx];
    if (!info) return;
    document.getElementById('legend-panel').style.display = 'block';
    document.getElementById('full-name').innerText = info.full;
    document.getElementById('leg-formula').innerText = info.formula;
    document.getElementById('leg-desc').innerText = info.desc;
    document.getElementById('leg-gradient').style.background = info.gradient;
    document.getElementById('leg-min').innerText = info.range[0];
    document.getElementById('leg-max').innerText = info.range[1];
    document.querySelectorAll('.leg-tab').forEach(t => t.classList.toggle('active', t.dataset.idx === idx));
}

// =========================================================================
//  SAVED FIELDS / RECENT SEARCHES  (localStorage)
// =========================================================================
const SAVED_FIELDS_KEY = 'biomass_explorer_saved_fields';
const MAX_SAVED_FIELDS = 10;

function getSavedFields() {
    try { return JSON.parse(localStorage.getItem(SAVED_FIELDS_KEY) || '[]'); }
    catch { return []; }
}
function saveFieldToRecent(name, geojson, info) {
    let fields = getSavedFields();
    fields = fields.filter(f => f.name !== name);
    fields.unshift({
        name, geojson,
        info: info ? { parcel_id: info.parcel_id, region: info.region, commune: info.commune } : null,
        savedAt: new Date().toISOString()
    });
    if (fields.length > MAX_SAVED_FIELDS) fields = fields.slice(0, MAX_SAVED_FIELDS);
    localStorage.setItem(SAVED_FIELDS_KEY, JSON.stringify(fields));
}
function removeSavedField(index) {
    let fields = getSavedFields();
    fields.splice(index, 1);
    localStorage.setItem(SAVED_FIELDS_KEY, JSON.stringify(fields));
    renderSavedFields();
}
function toggleSavedFields() {
    const dd = document.getElementById('saved-fields-dropdown');
    if (dd.style.display === 'none') { renderSavedFields(); dd.style.display = 'block'; }
    else { dd.style.display = 'none'; }
}
function renderSavedFields() {
    const dd = document.getElementById('saved-fields-dropdown');
    const fields = getSavedFields();
    if (fields.length === 0) { dd.innerHTML = '<div class="saved-empty">No saved fields yet</div>'; return; }
    dd.innerHTML = fields.map((f, i) => {
        const date = new Date(f.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        return '<div class="saved-field-item" onclick="loadSavedField(' + i + ')">'
             + '  <div><span class="saved-field-name">' + f.name + '</span>'
             + '  <span class="saved-field-date">' + date + '</span></div>'
             + '  <button type="button" class="saved-field-remove" onclick="event.stopPropagation(); removeSavedField(' + i + ')" title="Remove">&times;</button>'
             + '</div>';
    }).join('');
}
function loadSavedField(index) {
    const fields = getSavedFields();
    const f = fields[index];
    if (!f) return;
    document.getElementById('field_id').value = f.name;
    setAOI(f.geojson, f.info);
    document.getElementById('saved-fields-dropdown').style.display = 'none';

    // Show saved-field confirmation banner
    const statusEl = document.getElementById('aoi-status');
    let html = '<span class="aoi-ok-icon">&#128190;</span>';
    html += '<span><b>' + f.name + '</b> loaded from saved fields';
    if (f.info && f.info.parcel_id) html += ' &middot; Parcel ' + f.info.parcel_id;
    html += '<br><span class="aoi-saved-hint">AOI geometry restored — select dates &amp; indices, then search. You can also edit the boundary below.</span>';
    html += '</span>';
    statusEl.innerHTML = html;
    statusEl.style.display = 'flex';
}

// =========================================================================
//  SUMMARY STATISTICS PANEL  (simple — period average only)
// =========================================================================
function buildSummaryPanel(periodSummary, requestedIndices) {
    const panel = document.getElementById('summary-panel');
    if (!periodSummary || requestedIndices.length === 0) { panel.innerHTML = ''; return; }

    let html = '<div class="stats-section-label">Period Averages</div><div class="stats-grid">';
    for (const idx of requestedIndices) {
        const val = periodSummary[idx];
        const info = INDEX_INFO[idx];
        const shortName = info ? info.short : idx;

        if (val != null) {
            const cond = evaluateCondition(idx, val);
            html += '<div class="stat-tile">'
                  + '  <div class="stat-label">' + shortName + '</div>'
                  + '  <div class="stat-value">' + formatStatValue(idx, val) + '</div>'
                  + '  <div class="stat-avg-hint">period avg</div>'
                  + '  <div class="stat-condition ' + cond.cls + '"><span class="dot"></span>' + cond.label + '</div>'
                  + '</div>';
        } else {
            html += '<div class="stat-tile">'
                  + '  <div class="stat-label">' + shortName + '</div>'
                  + '  <div class="stat-value stat-na">N/A</div>'
                  + '  <div class="stat-condition cond-neutral">No data</div>'
                  + '</div>';
        }
    }
    html += '</div>';
    panel.innerHTML = html;
}

// =========================================================================
//  WARNINGS PANEL
// =========================================================================
function buildWarnings(periodSummary, requestedIndices, s2Count, lsCount) {
    const panel = document.getElementById('warnings-panel');
    const msgs = [];
    const missing = requestedIndices.filter(i => periodSummary[i] == null);
    if (missing.length > 0) {
        const names = missing.map(i => INDEX_INFO[i] ? INDEX_INFO[i].short : i).join(', ');
        msgs.push({ type: 'warning', text: 'No data could be computed for <b>' + names + '</b>. This is usually caused by persistent cloud cover over your field during the selected period.' });
    }
    const hasS2Req = requestedIndices.some(i => S2_INDICES.has(i));
    const hasLsReq = requestedIndices.some(i => LS_INDICES.has(i));
    if (hasS2Req && s2Count === 0) msgs.push({ type: 'warning', text: 'No cloud-free optical satellite images were found. Try extending the time period.' });
    if (hasLsReq && lsCount === 0) msgs.push({ type: 'warning', text: 'No cloud-free thermal satellite images were found. The thermal satellite revisits every 8–16 days — try a wider date range.' });
    if (msgs.length === 0) { panel.innerHTML = ''; return; }
    panel.innerHTML = msgs.map(m => {
        if (m.type === 'warning') return '<div class="warning-box"><span class="warn-icon">&#9888;&#65039;</span><span>' + m.text + '</span></div>';
        return '<div class="info-box"><span class="info-icon">&#8505;&#65039;</span><span>' + m.text + '</span></div>';
    }).join('');
}

// =========================================================================
//  TIME SERIES CHART  (floating popup panel with per-index tabs)
// =========================================================================
let chartHasData = false;
let chartPopupVisible = false;
let chartInstance = null;
let chartActiveFilter = 'all';

function prepareChartData(timeseries, requestedIndices) {
    chartHasData = timeseries && timeseries.length > 0 && requestedIndices.length > 0;
    chartPopupVisible = false;
    document.getElementById('chart-popup').style.display = 'none';
    const btn = document.getElementById('btn-chart-toggle');
    btn.style.display = chartHasData ? 'flex' : 'none';
    document.getElementById('btn-chart-text').innerText = 'SHOW TIME SERIES CHART';
}

function toggleChartPopup() {
    chartPopupVisible = !chartPopupVisible;
    const popup = document.getElementById('chart-popup');
    const btnText = document.getElementById('btn-chart-text');

    if (chartPopupVisible && chartHasData && lastAnalysisData) {
        popup.style.display = 'flex';
        btnText.innerText = 'HIDE TIME SERIES CHART';

        const fieldName = document.getElementById('field_id').value.trim() || 'Field';
        const start = document.getElementById('start_date').value;
        const end = document.getElementById('end_date').value;
        document.getElementById('chart-popup-sub').innerText = fieldName + ' \u00B7 ' + start + ' \u2192 ' + end;

        buildChartTabs();
        chartActiveFilter = 'all';
        setActiveChartTab('all');
        buildPopupChart();
    } else {
        popup.style.display = 'none';
        btnText.innerText = 'SHOW TIME SERIES CHART';
        chartPopupVisible = false;
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    }
}

function buildChartTabs() {
    const container = document.getElementById('chart-popup-tabs');
    container.innerHTML = '';
    const indices = lastRequestedIndices.filter(idx => {
        const info = INDEX_INFO[idx];
        return info && !info.isRGB;
    });

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'chart-tab tab-all active';
    allBtn.dataset.filter = 'all';
    allBtn.innerText = 'All';
    allBtn.onclick = function() { chartActiveFilter = 'all'; setActiveChartTab('all'); buildPopupChart(); };
    container.appendChild(allBtn);

    for (const idx of indices) {
        const info = INDEX_INFO[idx];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chart-tab';
        btn.dataset.filter = idx;
        btn.innerText = info.short;
        btn.style.setProperty('--tab-color', info.chartColor || '#2563eb');
        btn.onclick = function() { chartActiveFilter = idx; setActiveChartTab(idx); buildPopupChart(); };
        container.appendChild(btn);
    }
}

function setActiveChartTab(filter) {
    document.querySelectorAll('.chart-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === filter));
}

function buildPopupChart() {
    if (!lastAnalysisData) return;
    const timeseries = lastAnalysisData.timeseries;
    const allIndices = lastRequestedIndices;

    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    const showIndices = chartActiveFilter === 'all'
        ? allIndices.filter(i => { const info = INDEX_INFO[i]; return info && !info.isRGB; })
        : [chartActiveFilter];

    const datasets = [];
    for (const idx of showIndices) {
        const info = INDEX_INFO[idx];
        if (!info || info.isRGB) continue;
        const points = [];
        for (const t of timeseries) { if (t.values[idx] != null) points.push({ x: t.date, y: t.values[idx] }); }
        if (points.length === 0) continue;
        const isLandsat = LS_INDICES.has(idx);
        const isSingle = showIndices.length === 1;
        datasets.push({
            label: info.short, data: points,
            borderColor: info.chartColor || '#2563eb',
            backgroundColor: (info.chartColor || '#2563eb') + (isSingle ? '18' : '20'),
            borderWidth: isSingle ? 2.5 : 2,
            pointRadius: isSingle ? 5 : 3,
            pointHoverRadius: isSingle ? 7 : 5,
            tension: 0.3, fill: isSingle,
            borderDash: isLandsat ? [6, 3] : [],
        });
    }

    if (datasets.length === 0) return;

    const labels = [...new Set(timeseries.map(t => t.date))].sort();
    const ctx = document.getElementById('chart-popup-canvas').getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: showIndices.length > 1, position: 'bottom', labels: { boxWidth: 14, boxHeight: 2, padding: 10, font: { size: 10, family: 'Inter', weight: '600' }, color: '#94a3b8', usePointStyle: false } },
                tooltip: {
                    backgroundColor: 'rgba(30,41,59,0.95)', titleFont: { size: 11, family: 'Inter' }, bodyFont: { size: 11, family: 'JetBrains Mono' },
                    titleColor: '#f1f5f9', bodyColor: '#cbd5e1', padding: 10, cornerRadius: 8, borderColor: '#475569', borderWidth: 1,
                    callbacks: {
                        title: (items) => items.length > 0 ? formatDate(items[0].raw.x) : '',
                        label: (item) => ' ' + item.dataset.label + ': ' + item.formattedValue
                    }
                }
            },
            scales: {
                x: { type: 'category',
                     ticks: { font: { size: 9, family: 'Inter' }, color: '#64748b', maxRotation: 45,
                              callback: function(val, i) { const d = new Date(this.getLabelForValue(i) + 'T00:00:00'); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } },
                     grid: { color: 'rgba(30,41,59,0.6)' } },
                y: { ticks: { font: { size: 9, family: 'JetBrains Mono' }, color: '#64748b' }, grid: { color: 'rgba(30,41,59,0.6)' } }
            }
        }
    });
}

// =========================================================================
//  SKELETON LOADING
// =========================================================================
function showStatsSkeleton() {
    const panel = document.getElementById('summary-panel');
    let html = '<div class="skeleton" style="height:14px;width:120px;margin-bottom:10px;"></div><div class="stats-grid">';
    for (let i = 0; i < 6; i++) {
        html += '<div class="stat-tile skeleton-tile">'
              + '<div class="skeleton" style="height:10px;width:40%;margin:0 auto 8px;"></div>'
              + '<div class="skeleton" style="height:22px;width:60%;margin:0 auto 6px;"></div>'
              + '<div class="skeleton" style="height:8px;width:50%;margin:0 auto;"></div>'
              + '</div>';
    }
    html += '</div>';
    panel.innerHTML = html;
}

function showDatesSkeleton() {
    const cont = document.getElementById('dates-container');
    let html = '';
    for (let i = 0; i < 5; i++) {
        html += '<div style="padding:10px 12px;border-bottom:1px solid var(--border-light);display:flex;align-items:center;gap:10px;">'
              + '<div class="skeleton" style="width:15px;height:15px;border-radius:3px;flex-shrink:0;"></div>'
              + '<div class="skeleton" style="height:14px;flex:1;"></div>'
              + '</div>';
    }
    cont.innerHTML = html;
}

// =========================================================================
//  MAIN ANALYSIS
// =========================================================================
async function startAnalysis() {
    const fieldInput = document.getElementById('field_id');
    if (!fieldInput.value.trim()) {
        const counter = localStorage.getItem('biomass_field_counter') || '1';
        fieldInput.value = 'Field_' + counter;
    }
    const field_id = fieldInput.value.trim();
    const start    = document.getElementById('start_date').value;
    const end      = document.getElementById('end_date').value;
    const indices  = Array.from(document.querySelectorAll('input[name="idx"]:checked')).map(cb => cb.value);

    if (!start || !end) { alert("Please select a time period."); return; }
    if (!currentAOI) { alert("Please select an area of interest using one of the methods (Parcel Search, Map Click, or GeoJSON)."); return; }
    if (indices.length === 0) { alert("Please select at least one index to compute."); return; }

    clearAllOverlays();

    // Show result card with skeleton loading immediately
    document.getElementById('result-card').style.display = 'block';
    showStatsSkeleton();
    showDatesSkeleton();
    document.getElementById('warnings-panel').innerHTML = '';
    document.getElementById('btn-chart-toggle').style.display = 'none';

    setStatus("Searching for cloud-free satellite images over your field...", "loading");
    setProgress(10);
    document.getElementById('btn-search').disabled = true;
    document.getElementById('btn-search-text').innerText = 'SEARCHING...';
    document.getElementById('btn-search-spinner').style.display = 'inline-block';

    try {
        const currentQuery = {
            field_id, start_date: start, end_date: end, indices,
            geojson: currentAOI, cloud_cover: 20
        };

        setProgress(25);
        const t0 = performance.now();
        const res = await fetch(API_URL + '/calculate/biomass', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentQuery)
        });

        setProgress(80);

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Server returned an error (' + res.status + ')');
        }

        const data = await res.json();
        lastAnalysisData = data;
        lastRequestedIndices = indices;

        const cont = document.getElementById('dates-container');
        cont.innerHTML = '';

        buildSummaryPanel(data.period_summary, indices);

        prepareChartData(data.timeseries, indices);

        if (data.timeseries.length === 0) {
            buildWarnings(data.period_summary || {}, indices, 0, 0);
            setStatus("No cloud-free images were found for this period. Try a wider date range.", "warning");
        } else {
            const s2Dates = data.timeseries.filter(t => t.sensor === 'Sentinel-2');
            const lsDates = data.timeseries.filter(t => t.sensor === 'Landsat 8/9');

            buildWarnings(data.period_summary || {}, indices, s2Dates.length, lsDates.length);

            let html = '';
            if (s2Dates.length > 0) {
                html += '<div class="sensor-group">';
                html += '<div class="sensor-header"><span class="sensor-badge s2">Optical</span><div class="sensor-meta"><span class="sensor-count">' + s2Dates.length + ' dates</span><a href="#" class="select-all-link" onclick="toggleSensorDates(\'Sentinel-2\', this); return false;">all</a></div></div>';
                s2Dates.forEach(t => {
                    html += '<div class="date-row"><input type="checkbox" class="date-checkbox" value="' + t.date + '" data-sensor="Sentinel-2"><span>' + formatDate(t.date) + '</span></div>';
                });
                html += '</div>';
            }
            if (lsDates.length > 0) {
                html += '<div class="sensor-group">';
                html += '<div class="sensor-header"><span class="sensor-badge ls">Thermal</span><div class="sensor-meta"><span class="sensor-count">' + lsDates.length + ' dates</span><a href="#" class="select-all-link" onclick="toggleSensorDates(\'Landsat 8/9\', this); return false;">all</a></div></div>';
                lsDates.forEach(t => {
                    html += '<div class="date-row"><input type="checkbox" class="date-checkbox" value="' + t.date + '" data-sensor="Landsat 8/9"><span>' + formatDate(t.date) + '</span></div>';
                });
                html += '</div>';
            }
            cont.innerHTML = html;
            zoomToAOI();

            const total = s2Dates.length + lsDates.length;
            const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
            setStatus("Analysis complete — " + total + " cloud-free observations found in " + elapsed + "s.", "success");

            if (field_id && currentAOI) saveFieldToRecent(field_id, currentAOI, null);
        }
        setProgress(100);
        setTimeout(() => setProgress(-1), 800);
    } catch(e) {
        console.error(e);
        setStatus("Error: " + e.message, "error");
        setProgress(-1);
        document.getElementById('summary-panel').innerHTML = '';
        document.getElementById('dates-container').innerHTML = '';
    }

    document.getElementById('btn-search').disabled = false;
    document.getElementById('btn-search-text').innerText = 'SEARCH FOR IMAGES';
    document.getElementById('btn-search-spinner').style.display = 'none';
}

// =========================================================================
//  LOAD SELECTED LAYERS ONTO MAP
// =========================================================================
async function loadSelectedLayers() {
    const checkedItems = Array.from(document.querySelectorAll('.date-checkbox:checked'))
        .map(cb => ({ date: cb.value, sensor: cb.dataset.sensor }));
    const allIndices = Array.from(document.querySelectorAll('input[name="idx"]:checked')).map(cb => cb.value);

    if (checkedItems.length === 0) { alert("Please select at least one date from the list above."); return; }
    if (!currentAOI) { alert("No area of interest set."); return; }

    setStatus("Generating map overlays...", "loading");
    setProgress(5);
    document.getElementById('btn-load').disabled = true;
    document.getElementById('btn-load-text').innerText = 'LOADING...';
    document.getElementById('btn-load-spinner').style.display = 'inline-block';
    zoomToAOI();

    clearAllOverlays();

    document.getElementById('lp-opacity').value = 100;
    document.getElementById('lp-opacity-val').innerText = '100%';

    const batchRequests = checkedItems.map(({ date, sensor }) => {
        const dateIndices = allIndices.filter(idx => {
            if (sensor === 'Sentinel-2') return S2_INDICES.has(idx);
            if (sensor === 'Landsat 8/9') return LS_INDICES.has(idx);
            return true;
        });
        return { date, sensor, indices: [...dateIndices, 'RGB'] };
    });

    const totalDates = batchRequests.length;
    let completedDates = 0, loaded = 0, failed = 0, firstLayerShown = false;

    const promises = batchRequests.map(({ date, sensor, indices }) =>
        fetch(API_URL + '/visualize/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, sensor, indices, geojson: currentAOI, cloud_cover: 20 })
        })
        .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
        .then(data => ({ status: 'ok', date, sensor, data }))
        .catch(err => ({ status: 'error', date, sensor, error: err }))
    );

    const results = await Promise.all(promises);

    const dateOrder = {};
    checkedItems.forEach((item, i) => { dateOrder[item.date + '|' + item.sensor] = i; });
    results.sort((a, b) => (dateOrder[a.date + '|' + a.sensor] || 0) - (dateOrder[b.date + '|' + b.sensor] || 0));

    for (const result of results) {
        completedDates++;
        setProgress((completedDates / totalDates) * 90 + 5);

        if (result.status === 'error') {
            console.error('Batch failed for', result.date, result.error);
            failed++;
            setStatus("Loading layers... " + completedDates + " / " + totalDates + " dates processed", "loading");
            continue;
        }

        const { date, sensor, data } = result;
        const elapsed = data.elapsed_ms ? ' (' + (data.elapsed_ms / 1000).toFixed(1) + 's)' : '';

        for (const layer of data.layers) {
            const idx = layer.index_name;
            const tileLayer = L.tileLayer(layer.layer_url, { opacity: 1.0, maxNativeZoom: 15, maxZoom: 22 });
            tileLayer._idxKey = idx;
            tileLayer._date = date;
            tileLayer._sensor = sensor;
            activeLayers.push(tileLayer);
            addOverlayToPanel(tileLayer, idx, date, sensor);

            if (idx !== 'RGB' && !Array.from(document.querySelectorAll('.leg-tab')).some(t => t.dataset.idx === idx)) {
                const btn = document.createElement('div');
                btn.className = 'leg-tab'; btn.dataset.idx = idx;
                btn.innerText = INDEX_INFO[idx] ? INDEX_INFO[idx].short : idx;
                btn.onclick = () => updateLegend(idx);
                document.getElementById('legend-tabs').appendChild(btn);
            }

            if (!firstLayerShown && idx !== 'RGB') {
                tileLayer.addTo(map);
                updateLegend(idx);
                const cbs = document.querySelectorAll('.lp-overlay-cb');
                if (cbs.length > 0) cbs[cbs.length - 1].checked = true;
                firstLayerShown = true;
            }
            loaded++;
        }
        setStatus("Loading layers... " + completedDates + " / " + totalDates + " dates processed" + elapsed, "loading");
    }

    if (!layersPanelOpen && loaded > 0) toggleLayersPanel();

    setProgress(100);
    setTimeout(() => setProgress(-1), 600);

    if (failed > 0 && loaded > 0) setStatus("Map layers loaded (" + loaded + " OK, " + failed + " date(s) failed). Toggle layers in the panel.", "warning");
    else if (loaded > 0) setStatus("Map ready — " + loaded + " layers loaded. Toggle visibility in the layer panel.", "success");
    else setStatus("Could not load any map layers. The selected dates may not have matching index data.", "error");

    document.getElementById('btn-load').disabled = false;
    document.getElementById('btn-load-text').innerText = 'VISUALIZE ON MAP';
    document.getElementById('btn-load-spinner').style.display = 'none';
}

// =========================================================================
//  OVERLAY ADD → UPDATE LEGEND
// =========================================================================
map.on('layeradd', (e) => {
    if (e.layer._idxKey) updateLegend(e.layer._idxKey);
});

// =========================================================================
//  1. GEOCODER (Location Search)
// =========================================================================
(function initGeocoder() {
    const geocoder = L.Control.geocoder({
        defaultMarkGeocode: false,
        position: 'topleft',
        placeholder: 'Search location...',
        geocoder: L.Control.Geocoder.nominatim(),
        collapsed: true,
        showUniqueResult: true,
        showResultIcons: false
    });
    geocoder.on('markgeocode', function(e) {
        const bbox = e.geocode.bbox;
        map.fitBounds(bbox, { maxZoom: 15, animate: true });
    });
    geocoder.addTo(map);
})();

// =========================================================================
//  2. MEASUREMENT TOOLS
// =========================================================================
let measureMode = null;
let measurePoints = [];
let measureLayer = null;
let measureLabels = [];

function toggleMeasure(mode) {
    if (pixelInspectorActive) disablePixelInspector();
    if (measureMode === mode) { cancelMeasure(); return; }
    cancelMeasure();
    measureMode = mode;
    document.getElementById('map').style.cursor = 'crosshair';
    document.getElementById('btn-measure-' + (mode === 'distance' ? 'dist' : 'area')).classList.add('active');
    map.on('click', onMeasureClick);
    map.on('dblclick', onMeasureFinish);
    map.doubleClickZoom.disable();
}

function onMeasureClick(e) {
    L.DomEvent.stopPropagation(e);
    measurePoints.push(e.latlng);

    if (measureLayer) map.removeLayer(measureLayer);
    measureLabels.forEach(l => map.removeLayer(l));
    measureLabels = [];

    if (measureMode === 'distance') {
        measureLayer = L.polyline(measurePoints, { color: '#2563eb', weight: 3, dashArray: '6,4' }).addTo(map);
        if (measurePoints.length >= 2) {
            const dist = measureTotalDistance(measurePoints);
            const lbl = L.marker(e.latlng, {
                icon: L.divIcon({ className: 'measure-label', html: formatMeasureDistance(dist), iconSize: null })
            }).addTo(map);
            measureLabels.push(lbl);
        }
    } else {
        measureLayer = L.polygon(measurePoints, { color: '#2563eb', weight: 3, fillOpacity: 0.12, dashArray: '6,4' }).addTo(map);
        if (measurePoints.length >= 3) {
            const area = L.GeometryUtil.geodesicArea(measurePoints);
            const center = measureLayer.getBounds().getCenter();
            const lbl = L.marker(center, {
                icon: L.divIcon({ className: 'measure-label', html: formatMeasureArea(area), iconSize: null })
            }).addTo(map);
            measureLabels.push(lbl);
        }
    }
}

function onMeasureFinish(e) {
    L.DomEvent.stopPropagation(e);
    L.DomEvent.preventDefault(e);
    map.off('click', onMeasureClick);
    map.off('dblclick', onMeasureFinish);
    map.doubleClickZoom.enable();
    document.getElementById('map').style.cursor = '';
    document.querySelectorAll('.map-tool-btn').forEach(b => b.classList.remove('active'));
    measureMode = null;
}

function cancelMeasure() {
    if (measureLayer) { map.removeLayer(measureLayer); measureLayer = null; }
    measureLabels.forEach(l => map.removeLayer(l));
    measureLabels = [];
    measurePoints = [];
    measureMode = null;
    document.getElementById('map').style.cursor = '';
    document.querySelectorAll('.map-tool-btn').forEach(b => b.classList.remove('active'));
    map.off('click', onMeasureClick);
    map.off('dblclick', onMeasureFinish);
    map.doubleClickZoom.enable();
}

function measureTotalDistance(pts) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += pts[i - 1].distanceTo(pts[i]);
    return total;
}

function formatMeasureDistance(m) {
    if (m < 1000) return m.toFixed(0) + ' m';
    return (m / 1000).toFixed(2) + ' km';
}

function formatMeasureArea(sqm) {
    const ha = sqm / 10000;
    if (ha < 0.01) return sqm.toFixed(0) + ' m\u00B2';
    return ha.toFixed(2) + ' ha';
}

// =========================================================================
//  5. PIXEL INSPECTOR
// =========================================================================
let pixelInspectorActive = false;

function togglePixelInspector() {
    if (measureMode) cancelMeasure();
    if (pixelInspectorActive) { disablePixelInspector(); }
    else { enablePixelInspector(); }
}

function enablePixelInspector() {
    pixelInspectorActive = true;
    document.getElementById('map').style.cursor = 'crosshair';
    document.getElementById('btn-pixel-inspect').classList.add('active');
    map.on('click', onPixelInspectClick);
}

function disablePixelInspector() {
    pixelInspectorActive = false;
    document.getElementById('map').style.cursor = '';
    document.getElementById('btn-pixel-inspect').classList.remove('active');
    map.off('click', onPixelInspectClick);
}

async function onPixelInspectClick(e) {
    const { lat, lng } = e.latlng;

    // Find first visible non-RGB overlay layer to get date/sensor
    const visibleLayer = activeLayers.find(l => l._idxKey !== 'RGB' && map.hasLayer(l));
    if (!visibleLayer) {
        L.popup().setLatLng(e.latlng)
            .setContent('<div style="font-family:Inter,sans-serif;font-size:0.78rem;padding:4px;">No visible index layer. Load and show a layer first.</div>')
            .openOn(map);
        return;
    }

    const date = visibleLayer._date;
    const sensor = visibleLayer._sensor;
    const indices = lastRequestedIndices.filter(i => {
        if (sensor === 'Sentinel-2') return S2_INDICES.has(i);
        if (sensor === 'Landsat 8/9') return LS_INDICES.has(i);
        return true;
    });

    if (!currentAOI || indices.length === 0) return;

    const popup = L.popup({ maxWidth: 280 })
        .setLatLng(e.latlng)
        .setContent('<div style="font-family:Inter,sans-serif;font-size:0.78rem;padding:4px;color:#64748b;">Querying pixel values...</div>')
        .openOn(map);

    try {
        const res = await fetch(API_URL + '/api/pixel-value', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng, date, sensor, indices, geojson: currentAOI, cloud_cover: 20 })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        let html = '<div style="font-family:Inter,sans-serif;font-size:0.72rem;">';
        html += '<div style="font-weight:700;margin-bottom:6px;color:#1e293b;">Pixel Values — ' + formatDate(date) + '</div>';
        html += '<div style="font-size:0.64rem;color:#94a3b8;margin-bottom:6px;">' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '</div>';

        for (const [idx, val] of Object.entries(data.values)) {
            const info = INDEX_INFO[idx];
            const name = info ? info.short : idx;
            const cond = evaluateCondition(idx, val);
            html += '<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #f1f5f9;">';
            html += '<span style="font-weight:600;color:#475569;">' + name + '</span>';
            html += '<span style="font-family:JetBrains Mono,monospace;font-weight:700;">' + formatStatValue(idx, val) + ' <span style="color:' + (cond.cls === 'cond-excellent' ? '#059669' : cond.cls === 'cond-good' ? '#16a34a' : cond.cls === 'cond-fair' ? '#ca8a04' : cond.cls === 'cond-poor' ? '#ea580c' : '#dc2626') + ';font-size:0.6rem;">' + cond.label + '</span></span>';
            html += '</div>';
        }

        if (Object.keys(data.values).length === 0) {
            html += '<div style="color:#94a3b8;font-style:italic;">No data at this location</div>';
        }
        html += '</div>';
        popup.setContent(html);
    } catch (err) {
        popup.setContent('<div style="font-family:Inter,sans-serif;font-size:0.78rem;color:#dc2626;padding:4px;">Error: ' + err.message + '</div>');
    }
}

// =========================================================================
//  6. EDIT AOI (vertex editing)
// =========================================================================
let aoiEditing = false;
let editableLayers = [];

function startEditAOI() {
    if (!aoiLayer) { alert('No AOI polygon to edit.'); return; }
    if (aoiEditing) { finishEditAOI(); return; }

    aoiEditing = true;
    map.doubleClickZoom.disable();

    const btn = document.getElementById('btn-edit-aoi');
    btn.classList.add('editing');
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> SAVE BOUNDARY <span class="edit-hint">(or double-click map)</span>';

    aoiLayer.eachLayer(function(layer) {
        if (layer.editing) {
            layer.editing.enable();
            layer.setStyle({ color: '#2563eb', weight: 2, fillOpacity: 0.08, dashArray: '' });
            editableLayers.push(layer);
        }
    });

    map.once('dblclick', onEditDblClick);
}

function onEditDblClick(e) {
    L.DomEvent.stopPropagation(e);
    L.DomEvent.preventDefault(e);
    finishEditAOI();
}

function finishEditAOI() {
    if (!aoiEditing) return;
    aoiEditing = false;

    map.off('dblclick', onEditDblClick);
    map.doubleClickZoom.enable();

    let newGeojson = null;
    editableLayers.forEach(function(layer) {
        if (layer.editing) layer.editing.disable();
        newGeojson = layer.toGeoJSON().geometry;
    });
    editableLayers = [];

    if (newGeojson) {
        setAOI(newGeojson, null);
    } else {
        aoiLayer.eachLayer(function(layer) {
            layer.setStyle({ color: '#ffffff', weight: 3, fillOpacity: 0.05, dashArray: '8, 8' });
        });
    }

    const btn = document.getElementById('btn-edit-aoi');
    btn.classList.remove('editing');
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> EDIT BOUNDARY';
}

// =========================================================================
//  7. COORDINATE DISPLAY
// =========================================================================
let lastCoords = { lat: 0, lng: 0 };

map.on('mousemove', function(e) {
    lastCoords = e.latlng;
    document.getElementById('coord-text').innerText =
        'Lat: ' + e.latlng.lat.toFixed(5) + ', Lng: ' + e.latlng.lng.toFixed(5) + ' | Zoom: ' + map.getZoom();
});

map.on('zoomend', function() {
    document.getElementById('coord-text').innerText =
        'Lat: ' + lastCoords.lat.toFixed(5) + ', Lng: ' + lastCoords.lng.toFixed(5) + ' | Zoom: ' + map.getZoom();
});

function copyCoords() {
    const text = 'Lat: ' + lastCoords.lat.toFixed(5) + ', Lng: ' + lastCoords.lng.toFixed(5);
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector('.coord-copy-btn');
        btn.innerText = '\u2713';
        setTimeout(() => { btn.innerHTML = '&#128203;'; }, 1500);
    });
}

// =========================================================================
//  8. DARK MODE
// =========================================================================
function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('biomass_dark_mode', isDark ? '1' : '0');
    document.getElementById('btn-dark-mode').classList.toggle('active', isDark);
    document.getElementById('btn-dark-mode').innerHTML = isDark ? '&#9788;' : '&#9789;';
}

(function initDarkMode() {
    const isDark = document.body.classList.contains('dark-mode');
    const btn = document.getElementById('btn-dark-mode');
    if (btn) {
        btn.classList.toggle('active', isDark);
        btn.innerHTML = isDark ? '&#9788;' : '&#9789;';
    }
})();

// =========================================================================
//  SIDEBAR TOGGLE (desktop)
// =========================================================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    setTimeout(function() { map.invalidateSize(); }, 320);
}

// =========================================================================
//  9. MOBILE RESPONSIVENESS
// =========================================================================
function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('active');
}

function closeMobileSidebar() {
    document.getElementById('sidebar').classList.remove('mobile-open');
    document.getElementById('mobile-overlay').classList.remove('active');
}

// =========================================================================
//  10. KEYBOARD SHORTCUTS
// =========================================================================
document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    switch (e.key) {
        case 'Escape':
            cancelMeasure();
            if (pixelInspectorActive) disablePixelInspector();
            if (mapPickActive) disableMapPick();
            if (aoiEditing) finishEditAOI();
            map.closePopup();
            const aboutOverlay = document.getElementById('about-overlay');
            if (aboutOverlay.style.display !== 'none') toggleAboutPanel();
            break;
        case 'l': case 'L':
            toggleLayersPanel();
            break;
        case 'f': case 'F':
            zoomToAOI();
            break;
        case 'd': case 'D':
            toggleDarkMode();
            break;
        case '?':
            toggleAboutPanel();
            break;
        case 'g': case 'G':
            startOnboardingTour();
            break;
    }
});

// =========================================================================
//  FIELD NAME AUTO-COUNTER
// =========================================================================
(function initFieldName() {
    const counter = parseInt(localStorage.getItem('biomass_field_counter') || '0', 10) + 1;
    localStorage.setItem('biomass_field_counter', counter);
    document.getElementById('field_id').placeholder = 'e.g. Field_' + counter;
})();

// =========================================================================
//  DATE AUTO-SUGGESTION (end date = start + 30 days)
// =========================================================================
document.getElementById('start_date').addEventListener('change', function() {
    const endInput = document.getElementById('end_date');
    if (this.value && !endInput.value) {
        const start = new Date(this.value);
        start.setDate(start.getDate() + 30);
        endInput.value = start.toISOString().split('T')[0];
    }
});

// =========================================================================
//  11. ONBOARDING TOUR
// =========================================================================
function startOnboardingTour() {
    if (typeof window.driver === 'undefined') return;

    const driverObj = window.driver.js.driver({
        showProgress: true,
        animate: true,
        overlayColor: 'rgba(15, 23, 42, 0.6)',
        stagePadding: 8,
        stageRadius: 12,
        popoverClass: 'biomass-tour-popover',
        nextBtnText: 'Next &rarr;',
        prevBtnText: '&larr; Back',
        doneBtnText: 'Start exploring!',
        steps: [
            {
                popover: {
                    title: 'Welcome to Biomass Explorer! 🌍',
                    description: 'This tool uses Sentinel-2 and Landsat satellite imagery to monitor crop health, vegetation, and drought over your fields.<br><br>Let\'s take a quick tour of the key features. You can replay this guide anytime by pressing <kbd>G</kbd>.',
                }
            },
            {
                element: '#setup-card',
                popover: {
                    title: 'Step 1 — Analysis Setup',
                    description: 'This panel has three sections:<br>• <b>Field & Time</b> — name your field and pick a date range<br>• <b>Indices</b> — choose which vegetation or drought indices to compute<br>• <b>Area of Interest</b> — select your field boundary',
                    side: 'right',
                    align: 'start'
                }
            },
            {
                element: '#aoi-tabs',
                popover: {
                    title: 'Choose Your Field',
                    description: '<b>Parcel Search</b> — find by cadastral ID or region name<br><b>Map Click</b> — click directly on the map<br><b>GeoJSON</b> — paste custom coordinates<br><br>After loading, an <em>Edit Boundary</em> button lets you adjust the polygon.',
                    side: 'right'
                }
            },
            {
                element: '#btn-search',
                popover: {
                    title: 'Run the Analysis',
                    description: 'After setting your AOI, dates, and indices — click here to search for cloud-free satellite images. Results will appear below with period averages and available dates.',
                    side: 'right'
                }
            },
            {
                element: '#map',
                popover: {
                    title: 'Interactive Map',
                    description: 'Your field boundary and satellite index overlays appear here. After running an analysis, select dates and click <b>Visualize on Map</b> to load layers.',
                    side: 'left'
                }
            },
            {
                element: '#map-tools',
                popover: {
                    title: 'Map Tools',
                    description: 'Four tools at your disposal:<br>• <b>Ruler</b> — measure distances<br>• <b>Polygon</b> — measure areas<br>• <b>Info</b> — click any pixel to see its index value<br>• <b>Target</b> — recenter on your field (appears after AOI is set)',
                    side: 'right'
                }
            },
            {
                element: '#layers-panel',
                popover: {
                    title: 'Layer Control',
                    description: 'Switch between Satellite and Street base maps, toggle cadastral boundaries, and manage loaded index overlays. The opacity slider controls overlay transparency.',
                    side: 'left'
                }
            },
            {
                element: '#btn-dark-mode',
                popover: {
                    title: 'Keyboard Shortcuts',
                    description: '<kbd>D</kbd> Dark mode &middot; <kbd>L</kbd> Layers panel &middot; <kbd>F</kbd> Recenter on field &middot; <kbd>G</kbd> This guided tour &middot; <kbd>?</kbd> About panel &middot; <kbd>Esc</kbd> Cancel tools',
                    side: 'bottom'
                }
            }
        ],
        onDestroyed: function() {
            localStorage.setItem('biomass_tour_done', '1');
        }
    });

    driverObj.drive();
}

// Auto-start tour on first visit only
(function checkOnboarding() {
    if (!localStorage.getItem('biomass_tour_done')) {
        setTimeout(startOnboardingTour, 800);
    }
})();

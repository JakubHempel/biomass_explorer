const API_URL = window.location.origin;

// =========================================================================
//  SENSOR ↔ INDEX MAPPING
// =========================================================================
const S2_INDICES = new Set(['NDVI','NDRE','GNDVI','EVI','SAVI','CIre','MTCI','IRECI','NDMI','NMDI']);
const LS_INDICES = new Set(['LST','VSWI','TVDI','TCI','VHI']);

// =========================================================================
//  INDEX METADATA  (short name, full name, formula, description, gradient, range)
// =========================================================================
const INDEX_INFO = {
    "NDVI":  { short: "NDVI",  full: "Normalized Difference Vegetation Index",        formula: "(B8 − B4) / (B8 + B4)",                          desc: "Crops 0.1–0.3 early growth, 0.4–0.6 mid-season, 0.6–0.9 peak canopy.",  gradient: "linear-gradient(to right, #a50026, #d73027, #f46d43, #fdae61, #fee08b, #d9ef8b, #a6d96a, #66bd63, #1a9850, #006837)", range: ["-0.2", "1.0"] },
    "NDRE":  { short: "NDRE",  full: "Normalized Difference Red Edge Index",           formula: "(B8 − B5) / (B8 + B5)",                          desc: "Best at mid-to-late season; <0.2 bare soil, 0.2–0.6 developing, >0.6 healthy.",  gradient: "linear-gradient(to right, #440154, #482878, #3e4989, #31688e, #26828e, #1f9e89, #35b779, #6ece58, #b5de2b, #fde725)", range: ["-0.2", "0.8"] },
    "GNDVI": { short: "GNDVI", full: "Green Normalized Difference Vegetation Index",   formula: "(B8 − B3) / (B8 + B3)",                          desc: "More sensitive to chlorophyll & nitrogen than NDVI in dense canopies.",   gradient: "linear-gradient(to right, #a50026, #f46d43, #fee08b, #addd8e, #66bd63, #006837)",                                     range: ["-0.2", "0.9"] },
    "EVI":   { short: "EVI",   full: "Enhanced Vegetation Index",                      formula: "2.5 × (B8 − B4) / (B8 + 6·B4 − 7.5·B2 + 1)",   desc: "Healthy crops 0.2–0.8; corrects atmospheric & soil noise in high-LAI.",  gradient: "linear-gradient(to right, #CE7E45, #DF923D, #F1B555, #FCD163, #99B718, #74A901, #66A000, #529400, #3E8601, #207401)", range: ["-0.2", "0.8"] },
    "SAVI":  { short: "SAVI",  full: "Soil Adjusted Vegetation Index",                 formula: "1.5 × (B8 − B4) / (B8 + B4 + L)",               desc: "Best when canopy cover <40%; reduces soil brightness in sparse crops.",   gradient: "linear-gradient(to right, #8c510a, #bf812d, #dfc27d, #f6e8c3, #c7eae5, #80cdc1, #35978f, #01665e)",                  range: ["-0.2", "0.8"] },
    "CIre":  { short: "CI-re", full: "Chlorophyll Index – Red Edge",                   formula: "(B7 / B5) − 1",                                  desc: "Linear proxy for canopy chlorophyll; crops typically 1–8.",              gradient: "linear-gradient(to right, #ffffcc, #d9f0a3, #addd8e, #78c679, #41ab5d, #238443, #005a32)",                            range: ["0", "10"] },
    "MTCI":  { short: "MTCI",  full: "MERIS Terrestrial Chlorophyll Index",            formula: "(B6 − B5) / (B5 − B4)",                          desc: "Near-linear with chlorophyll; crops 1–5, peak canopy ≈ 4–6.",           gradient: "linear-gradient(to right, #ffffb2, #fed976, #feb24c, #fd8d3c, #fc4e2a, #e31a1c, #b10026)",                            range: ["0", "6"] },
    "IRECI": { short: "IRECI", full: "Inverted Red-Edge Chlorophyll Index",            formula: "(B7 − B4) / (B5 / B6)",                          desc: "Four-band red-edge chlorophyll; crops ~0.2–2.5, dense canopy up to 3.",  gradient: "linear-gradient(to right, #fef0d9, #fdd49e, #fdbb84, #fc8d59, #ef6548, #d7301f, #990000)",                            range: ["0", "3"] },
    "NDMI":  { short: "NDMI",  full: "Normalized Difference Moisture Index",           formula: "(B8 − B11) / (B8 + B11)",                        desc: "Leaf water content; <−0.2 dry stress, 0–0.4 adequate, >0.4 well-watered.",  gradient: "linear-gradient(to right, #8c510a, #d8b365, #f6e8c3, #c7eae5, #5ab4ac, #2166ac, #053061)",                        range: ["-0.8", "0.8"] },
    "NMDI":  { short: "NMDI",  full: "Normalized Multi-band Drought Index",            formula: "(B8 − (B11 − B12)) / (B8 + (B11 − B12))",        desc: "Dual-SWIR drought monitor; higher values = more soil/vegetation moisture.",  gradient: "linear-gradient(to right, #d73027, #fc8d59, #fee090, #ffffbf, #e0f3f8, #91bfdb, #4575b4)",                        range: ["0", "1.0"] },
    "LST":   { short: "LST",   full: "Land Surface Temperature",                    formula: "Landsat ST_B10 → °C",                               desc: "Thermal IR surface temp; crops stressed above 35 °C, optimal 15–30 °C.",     gradient: "linear-gradient(to right, #08306b, #2171b5, #6baed6, #bdd7e7, #ffffcc, #fed976, #fd8d3c, #e31a1c, #800026)",        range: ["0 °C", "45 °C"] },
    "VSWI":  { short: "VSWI",  full: "Vegetation Supply Water Index",               formula: "NDVI / LST (°C)",                                   desc: "Water-availability proxy; higher = well-watered, lower = drought stress.",    gradient: "linear-gradient(to right, #d73027, #fc8d59, #fee08b, #d9ef8b, #66bd63, #1a9850)",                                   range: ["0", "0.06"] },
    "TVDI":  { short: "TVDI",  full: "Temperature–Vegetation Dryness Index",        formula: "(LST − LSTmin) / (LSTmax − LSTmin)",                desc: "Spatial moisture pattern; 0 = wet surface, 1 = dry/stressed surface.",       gradient: "linear-gradient(to right, #2166ac, #67a9cf, #d1e5f0, #fddbc7, #ef8a62, #b2182b)",                                   range: ["0", "1"] },
    "TCI":   { short: "TCI",   full: "Temperature Condition Index",                 formula: "(LSTmax − LST) / (LSTmax − LSTmin) × 100",         desc: "Kogan (1995); 0 % = extreme heat stress, 100 % = cool optimal.",            gradient: "linear-gradient(to right, #d73027, #fc8d59, #fee08b, #d9ef8b, #66bd63, #1a9850)",                                   range: ["0", "100"] },
    "VHI":   { short: "VHI",   full: "Vegetation Health Index",                     formula: "0.5 × VCI + 0.5 × TCI",                            desc: "Composite; <40 drought, 40–60 fair, >60 healthy vegetation.",               gradient: "linear-gradient(to right, #d73027, #fc8d59, #fee08b, #d9ef8b, #66bd63, #1a9850)",                                   range: ["0", "100"] }
};

// =========================================================================
//  CROP CONDITION THRESHOLDS
//  Higher-is-better indices use `min` breakpoints (first match wins).
//  Inverted indices (lower-is-better) use `max` breakpoints.
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

// Map condition label → CSS class
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
const satellite = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=en', { maxZoom: 20 });
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });

const map = L.map('map', { center: [52.0, 19.0], zoom: 6, layers: [satellite] });

const baseMaps = { "Satellite View": satellite, "Street Map (OSM)": osm };
let layerControl = L.control.layers(baseMaps, {}, { collapsed: false }).addTo(map);

L.control.scale({ metric: true, imperial: false }).addTo(map);
const miniMap = new L.Control.MiniMap(L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'), { toggleDisplay: true, position: 'bottomleft' }).addTo(map);

let activeLayers = [];
let aoiLayer = null;

// =========================================================================
//  STATUS BAR  (loading / success / error / warning / info)
// =========================================================================
function setStatus(msg, type) {
    const el = document.getElementById('status');
    const txt = document.getElementById('status-text');
    txt.innerText = msg;
    el.className = '';                  // reset
    if (type) el.classList.add('status-' + type);
}

// =========================================================================
//  SELECT-ALL TOGGLE for index groups & sensor dates
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
    const geoJSONStr = document.getElementById('geojson_input').value.trim();
    if (!geoJSONStr) { alert("Enter GeoJSON coordinates first."); return; }
    try {
        const coords = JSON.parse(geoJSONStr);
        if (aoiLayer) map.removeLayer(aoiLayer);
        aoiLayer = L.geoJSON({ type: "Polygon", coordinates: coords }, {
            style: { color: "#ffffff", weight: 3, fillOpacity: 0.05, dashArray: "8, 8" }
        }).addTo(map);
        map.fitBounds(aoiLayer.getBounds(), { padding: [50, 50], animate: true });
    } catch(e) { alert("The GeoJSON polygon you entered doesn't look right. Please check the format."); }
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
//  SUMMARY STATISTICS PANEL
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

    // Missing indices
    const missing = requestedIndices.filter(i => periodSummary[i] == null);
    if (missing.length > 0) {
        const names = missing.map(i => INDEX_INFO[i] ? INDEX_INFO[i].short : i).join(', ');
        msgs.push({ type: 'warning', text: 'No data could be computed for <b>' + names + '</b>. This is usually caused by persistent cloud cover over your field during the selected period.' });
    }

    // Satellite-specific notes
    const hasS2Req = requestedIndices.some(i => S2_INDICES.has(i));
    const hasLsReq = requestedIndices.some(i => LS_INDICES.has(i));

    if (hasS2Req && s2Count === 0) {
        msgs.push({ type: 'warning', text: 'No cloud-free optical satellite images were found. Try extending the time period.' });
    }
    if (hasLsReq && lsCount === 0) {
        msgs.push({ type: 'warning', text: 'No cloud-free thermal satellite images were found. The thermal satellite revisits every 8–16 days — try a wider date range.' });
    }

    if (msgs.length === 0) { panel.innerHTML = ''; return; }

    panel.innerHTML = msgs.map(m => {
        if (m.type === 'warning') {
            return '<div class="warning-box"><span class="warn-icon">&#9888;&#65039;</span><span>' + m.text + '</span></div>';
        }
        return '<div class="info-box"><span class="info-icon">&#8505;&#65039;</span><span>' + m.text + '</span></div>';
    }).join('');
}

// =========================================================================
//  MAIN ANALYSIS
// =========================================================================
async function startAnalysis() {
    const field_id = document.getElementById('field_id').value.trim();
    const start    = document.getElementById('start_date').value;
    const end      = document.getElementById('end_date').value;
    const geoJSONStr = document.getElementById('geojson_input').value.trim();
    const indices  = Array.from(document.querySelectorAll('input[name="idx"]:checked')).map(cb => cb.value);

    // --- Validation ---
    if (!field_id || !start || !end || !geoJSONStr) {
        alert("Please fill in all fields: name, dates, area of interest.");
        return;
    }
    if (indices.length === 0) {
        alert("Please select at least one index to compute.");
        return;
    }

    // Show spinner
    setStatus("Searching for cloud-free satellite images over your field...", "loading");
    document.getElementById('btn-search').disabled = true;
    document.getElementById('btn-search-text').innerText = 'SEARCHING...';
    document.getElementById('btn-search-spinner').style.display = 'inline-block';

    try {
        const currentQuery = {
            field_id,
            start_date: start,
            end_date: end,
            indices,
            geojson: { type: "Polygon", coordinates: JSON.parse(geoJSONStr) }
        };

        const res = await fetch(API_URL + '/calculate/biomass', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentQuery)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Server returned an error (' + res.status + ')');
        }

        const data = await res.json();
        const cont = document.getElementById('dates-container');
        cont.innerHTML = '';

        // --- Summary statistics ---
        buildSummaryPanel(data.period_summary, indices);

        if (data.timeseries.length === 0) {
            buildWarnings(data.period_summary || {}, indices, 0, 0);
            setStatus("No cloud-free images were found for this period. Try a wider date range.", "warning");
        } else {
            // Group dates by sensor
            const s2Dates = data.timeseries.filter(t => t.sensor === 'Sentinel-2');
            const lsDates = data.timeseries.filter(t => t.sensor === 'Landsat 8/9');

            buildWarnings(data.period_summary || {}, indices, s2Dates.length, lsDates.length);

            let html = '';
            if (s2Dates.length > 0) {
                html += '<div class="sensor-group">';
                html += '<div class="sensor-header">'
                      + '  <span class="sensor-badge s2">Optical</span>'
                      + '  <div class="sensor-meta">'
                      + '    <span class="sensor-count">' + s2Dates.length + ' dates</span>'
                      + '    <a href="#" class="select-all-link" onclick="toggleSensorDates(\'Sentinel-2\', this); return false;">all</a>'
                      + '  </div>'
                      + '</div>';
                s2Dates.forEach(t => {
                    html += '<div class="date-row">'
                          + '  <input type="checkbox" class="date-checkbox" value="' + t.date + '" data-sensor="Sentinel-2">'
                          + '  <span>' + formatDate(t.date) + '</span>'
                          + '</div>';
                });
                html += '</div>';
            }
            if (lsDates.length > 0) {
                html += '<div class="sensor-group">';
                html += '<div class="sensor-header">'
                      + '  <span class="sensor-badge ls">Thermal</span>'
                      + '  <div class="sensor-meta">'
                      + '    <span class="sensor-count">' + lsDates.length + ' dates</span>'
                      + '    <a href="#" class="select-all-link" onclick="toggleSensorDates(\'Landsat 8/9\', this); return false;">all</a>'
                      + '  </div>'
                      + '</div>';
                lsDates.forEach(t => {
                    html += '<div class="date-row">'
                          + '  <input type="checkbox" class="date-checkbox" value="' + t.date + '" data-sensor="Landsat 8/9">'
                          + '  <span>' + formatDate(t.date) + '</span>'
                          + '</div>';
                });
                html += '</div>';
            }
            cont.innerHTML = html;

            document.getElementById('result-card').style.display = 'block';
            zoomToAOI();

            const total = s2Dates.length + lsDates.length;
            setStatus("Analysis complete — " + total + " cloud-free observations found.", "success");
        }
    } catch(e) {
        console.error(e);
        setStatus("Error: " + e.message, "error");
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
    const geoJSONStr = document.getElementById('geojson_input').value.trim();
    const allIndices = Array.from(document.querySelectorAll('input[name="idx"]:checked')).map(cb => cb.value);

    if (checkedItems.length === 0) { alert("Please select at least one date from the list above."); return; }

    setStatus("Generating map overlays...", "loading");
    document.getElementById('btn-load').disabled = true;
    document.getElementById('btn-load-text').innerText = 'LOADING...';
    document.getElementById('btn-load-spinner').style.display = 'inline-block';
    zoomToAOI();

    // Clear old layers
    activeLayers.forEach(l => { map.removeLayer(l); layerControl.removeLayer(l); });
    activeLayers = [];
    document.getElementById('legend-tabs').innerHTML = '';

    let loaded = 0;
    let failed = 0;

    for (const { date, sensor } of checkedItems) {
        // Only request indices that match this date's sensor
        const dateIndices = allIndices.filter(idx => {
            if (sensor === 'Sentinel-2') return S2_INDICES.has(idx);
            if (sensor === 'Landsat 8/9') return LS_INDICES.has(idx);
            return true;
        });

        for (const idx of dateIndices) {
            try {
                const res = await fetch(API_URL + '/visualize/map', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        field_id: "tmp",
                        start_date: date,
                        end_date: date,
                        indices: [idx],
                        geojson: { type: "Polygon", coordinates: JSON.parse(geoJSONStr) }
                    })
                });

                if (!res.ok) { failed++; continue; }

                const data = await res.json();
                const tileLayer = L.tileLayer(data.layer_url, { opacity: 1.0 });
                const displayName = INDEX_INFO[idx] ? INDEX_INFO[idx].short : idx;
                const sensorTag = sensor === 'Sentinel-2' ? 'S2' : 'L8/9';
                tileLayer._idxKey = idx;
                layerControl.addOverlay(
                    tileLayer,
                    '<b>' + formatDate(date) + '</b> <span class="layer-sensor ' + (sensor === 'Sentinel-2' ? 's2' : 'ls') + '">' + sensorTag + '</span> ' + displayName
                );
                activeLayers.push(tileLayer);

                // Create legend tab if not present
                if (!Array.from(document.querySelectorAll('.leg-tab')).some(t => t.dataset.idx === idx)) {
                    const btn = document.createElement('div');
                    btn.className = 'leg-tab';
                    btn.dataset.idx = idx;
                    btn.innerText = INDEX_INFO[idx] ? INDEX_INFO[idx].short : idx;
                    btn.onclick = () => updateLegend(idx);
                    document.getElementById('legend-tabs').appendChild(btn);
                }
                if (activeLayers.length === 1) { tileLayer.addTo(map); updateLegend(idx); }
                loaded++;
            } catch(e) { console.error(e); failed++; }
        }
    }

    // Final status
    if (failed > 0 && loaded > 0) {
        setStatus("Map layers loaded (" + loaded + " OK, " + failed + " failed). Toggle layers in the panel on the right.", "warning");
    } else if (loaded > 0) {
        setStatus("Map ready — " + loaded + " layers loaded. Toggle visibility in the layer panel.", "success");
    } else {
        setStatus("Could not load any map layers. The selected dates may not have matching index data.", "error");
    }

    document.getElementById('btn-load').disabled = false;
    document.getElementById('btn-load-text').innerText = 'VISUALIZE ON MAP';
    document.getElementById('btn-load-spinner').style.display = 'none';
}

// =========================================================================
//  OVERLAY ADD → UPDATE LEGEND
// =========================================================================
map.on('overlayadd', (e) => {
    if (e.layer._idxKey) updateLegend(e.layer._idxKey);
});

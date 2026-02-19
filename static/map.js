// =========================================================================
//  MAP CORE
// =========================================================================
const satellite = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=en', { maxNativeZoom: 20, maxZoom: 22 });
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 22 });

const map = L.map('map', { center: [52.0, 19.0], zoom: 7, maxZoom: 22, layers: [satellite] });
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
    if (!query) { showToast('Please enter a parcel ID or region name + number.', 'warning'); return; }

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
    } catch(e) { showToast(e.message, 'error'); }

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
    if (!raw) { showToast('Paste GeoJSON coordinates first.', 'warning'); return; }
    try {
        const coords = JSON.parse(raw);
        const geojson = { type: "Polygon", coordinates: coords };
        setAOI(geojson, null);
    } catch(e) {
        showToast('Invalid GeoJSON. Expected a coordinates array like [[[lon,lat], ...]].', 'error');
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
    map.addLayer(baseMaps[key]);
    baseMaps[key].bringToBack();
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
    if (!currentAOI) { showToast('Please select an area of interest first.', 'warning'); return; }
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
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
    if (typeof applyStaticTranslations === 'function') applyStaticTranslations();
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
            .setContent('<div style="font-family:Inter,sans-serif;font-size:0.78rem;padding:4px;">' + (currentLang() === 'pl' ? 'Brak widocznej warstwy indeksu. Najpierw wczytaj i pokaż warstwę.' : 'No visible index layer. Load and show a layer first.') + '</div>')
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

    var currentZoom = map.getZoom();
    if (currentZoom < 15 || currentZoom > 19) {
        L.popup().setLatLng(e.latlng)
            .setContent('<div style="font-family:Inter,sans-serif;font-size:0.78rem;padding:4px;">' + (currentLang() === 'pl' ? 'Przybliż mapę do poziomu 15–19, aby sprawdzić wartości piksela.' : 'Zoom in to level 15–19 to inspect pixel values.') + '</div>')
            .openOn(map);
        return;
    }

    var popup = L.popup({ maxWidth: 280, minWidth: 160, autoPan: true, closeOnClick: true, className: 'pixel-popup' })
        .setLatLng(e.latlng)
        .setContent('<div style="font-family:Inter,sans-serif;font-size:0.78rem;padding:4px;color:#64748b;">' + (currentLang() === 'pl' ? 'Pobieranie wartości piksela...' : 'Querying pixel values...') + '</div>')
        .openOn(map);

    function checkPixelPopupZoom() {
        var zoom = map.getZoom();
        if (zoom < 15 || zoom > 19) {
            map.closePopup(popup);
        }
    }
    map.on('zoomend', checkPixelPopupZoom);
    popup.on('remove', function() { map.off('zoomend', checkPixelPopupZoom); });

    try {
        const res = await fetch(API_URL + '/api/pixel-value', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng, date, sensor, indices, geojson: currentAOI, cloud_cover: 20 })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        let html = '<div style="font-family:Inter,sans-serif;font-size:0.72rem;">';
        html += '<div style="font-weight:700;margin-bottom:6px;color:#1e293b;">' + (currentLang() === 'pl' ? 'Wartości piksela' : 'Pixel Values') + ' — ' + formatDate(date) + '</div>';
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
            html += '<div style="color:#94a3b8;font-style:italic;">' + (currentLang() === 'pl' ? 'Brak danych w tej lokalizacji' : 'No data at this location') + '</div>';
        }
        html += '</div>';
        popup.setContent(html);
    } catch (err) {
        popup.setContent('<div style="font-family:Inter,sans-serif;font-size:0.78rem;color:#dc2626;padding:4px;">' + (currentLang() === 'pl' ? 'Błąd: ' : 'Error: ') + err.message + '</div>');
    }
}

// =========================================================================
//  6. EDIT AOI (vertex editing)
// =========================================================================
let aoiEditing = false;
let editableLayers = [];

function startEditAOI() {
    if (!aoiLayer) { showToast(currentLang() === 'pl' ? 'Brak poligonu AOI do edycji.' : 'No AOI polygon to edit.', 'warning'); return; }
    if (aoiEditing) { finishEditAOI(); return; }

    aoiEditing = true;
    map.doubleClickZoom.disable();

    const btn = document.getElementById('btn-edit-aoi');
    btn.classList.add('editing');
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ' + t('save_boundary') + ' <span class="edit-hint">' + t('save_boundary_hint') + '</span>';

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
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> ' + t('edit_boundary');
}

// =========================================================================
//  7. COORDINATE DISPLAY
// =========================================================================
let lastCoords = { lat: 0, lng: 0 };

map.on('mousemove', function(e) {
    lastCoords = e.latlng;
    document.getElementById('coord-text').innerText =
        (currentLang() === 'pl' ? 'Szer.: ' : 'Lat: ') + e.latlng.lat.toFixed(5) + ', ' + (currentLang() === 'pl' ? 'Dł.: ' : 'Lng: ') + e.latlng.lng.toFixed(5) + ' | Zoom: ' + map.getZoom();
});

map.on('zoomend', function() {
    document.getElementById('coord-text').innerText =
        (currentLang() === 'pl' ? 'Szer.: ' : 'Lat: ') + lastCoords.lat.toFixed(5) + ', ' + (currentLang() === 'pl' ? 'Dł.: ' : 'Lng: ') + lastCoords.lng.toFixed(5) + ' | Zoom: ' + map.getZoom();
});

function copyCoords() {
    const text = (currentLang() === 'pl' ? 'Szer.: ' : 'Lat: ') + lastCoords.lat.toFixed(5) + ', ' + (currentLang() === 'pl' ? 'Dł.: ' : 'Lng: ') + lastCoords.lng.toFixed(5);
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector('.coord-copy-btn');
        btn.innerText = '\u2713';
        setTimeout(() => { btn.innerHTML = '&#128203;'; }, 1500);
    });
}


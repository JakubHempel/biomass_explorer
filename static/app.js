// =========================================================================
//  COLLAPSIBLE SETUP CARD
// =========================================================================
let setupCardOpen = true;

function toggleSetupCard() {
    setupCardOpen = !setupCardOpen;
    document.getElementById('setup-body').classList.toggle('collapsed', !setupCardOpen);
    document.getElementById('setup-chevron').classList.toggle('collapsed', !setupCardOpen);
    var summary = document.getElementById('setup-summary');
    if (!setupCardOpen) renderSetupSummary();
    summary.style.display = setupCardOpen ? 'none' : 'block';
}

function renderSetupSummary() {
    var empty = '---';
    var fieldName = document.getElementById('field_id').value.trim() || empty;
    var start = document.getElementById('start_date').value;
    var end = document.getElementById('end_date').value;
    var indices = Array.from(document.querySelectorAll('input[name="idx"]:checked')).map(function(cb) { return cb.value; });
    var summary = document.getElementById('setup-summary');
    summary.innerHTML =
        '<div class="ss-row"><span class="ss-label">' + (currentLang() === 'pl' ? 'Pole' : 'Field') + '</span><span class="ss-value">' + fieldName + '</span></div>' +
        '<div class="ss-row"><span class="ss-label">' + (currentLang() === 'pl' ? 'Okres' : 'Period') + '</span><span class="ss-value">' + (start || empty) + ' → ' + (end || empty) + '</span></div>' +
        '<div class="ss-row"><span class="ss-label">' + (currentLang() === 'pl' ? 'Indeksy' : 'Indices') + '</span><span class="ss-value">' + (indices.length > 0 ? indices.join(', ') : empty) + '</span></div>';
}

function collapseSetupCard() {
    if (!setupCardOpen) return;
    var summary = document.getElementById('setup-summary');
    renderSetupSummary();

    setupCardOpen = false;
    document.getElementById('setup-body').classList.add('collapsed');
    document.getElementById('setup-chevron').classList.add('collapsed');
    summary.style.display = 'block';
}

function refreshSetupSummaryTranslations() {
    const summary = document.getElementById('setup-summary');
    if (!summary || setupCardOpen) return;
    renderSetupSummary();
}

function expandSetupCard() {
    if (setupCardOpen) return;
    setupCardOpen = true;
    document.getElementById('setup-body').classList.remove('collapsed');
    document.getElementById('setup-chevron').classList.remove('collapsed');
    document.getElementById('setup-summary').style.display = 'none';
}

// =========================================================================
//  SUMMARY STATISTICS PANEL  (simple — period average only)
// =========================================================================
function buildSummaryPanel(periodSummary, requestedIndices) {
    const panel = document.getElementById('summary-panel');
    if (!periodSummary || requestedIndices.length === 0) { panel.innerHTML = ''; return; }

    let html = '<div class="stats-section-label">' + t('period_averages') + '</div><div class="stats-grid">';
    for (const idx of requestedIndices) {
        const val = periodSummary[idx];
        const info = INDEX_INFO[idx];
        const shortName = info ? info.short : idx;

        if (val == null) continue;
        const cond = evaluateCondition(idx, val);
        html += '<div class="stat-tile">'
              + '  <div class="stat-label">' + shortName + '</div>'
              + '  <div class="stat-value">' + formatStatValue(idx, val) + '</div>'
              + '  <div class="stat-avg-hint">' + t('period_avg') + '</div>'
              + '  <div class="stat-condition ' + cond.cls + '"><span class="dot"></span>' + cond.label + '</div>'
              + '</div>';
    }
    html += '</div>';
    panel.innerHTML = html;
    panel.querySelectorAll('.stat-tile').forEach(function(tile, i) {
        tile.classList.add('stat-tile-animate');
        tile.style.animationDelay = (i * 0.05) + 's';
    });
}

// =========================================================================
//  WARNINGS PANEL
// =========================================================================
function buildWarnings(periodSummary, requestedIndices, s2Count, lsCount) {
    const panel = document.getElementById('warnings-panel');
    const missing = requestedIndices.filter(i => periodSummary[i] == null);
    if (missing.length === 0) { panel.innerHTML = ''; return; }

    const hasS2Req = requestedIndices.some(i => S2_INDICES.has(i));
    const hasLsReq = requestedIndices.some(i => LS_INDICES.has(i));
    const missingS2 = missing.filter(i => S2_INDICES.has(i));
    const missingLs = missing.filter(i => LS_INDICES.has(i));

    var lines = [];

    if (missingS2.length > 0) {
        var names = missingS2.map(i => INDEX_INFO[i] ? INDEX_INFO[i].short : i).join(', ');
        if (hasS2Req && s2Count === 0) {
            lines.push(t('warning_s2_no_images', { names: names }));
        } else {
            lines.push(t('warning_cannot_compute_cloud', { names: names }));
        }
    }
    if (missingLs.length > 0) {
        var names = missingLs.map(i => INDEX_INFO[i] ? INDEX_INFO[i].short : i).join(', ');
        if (hasLsReq && lsCount === 0) {
            lines.push(t('warning_ls_no_images', { names: names }));
        } else {
            lines.push(t('warning_cannot_compute_cloud', { names: names }));
        }
    }

    if (lines.length === 0) { panel.innerHTML = ''; return; }

    var html = '<div class="warning-box"><span class="warn-icon">&#9888;&#65039;</span><div>'
        + '<div style="margin-bottom:4px;">' + t('missing_data_title', { missing: missing.length, total: requestedIndices.length }) + '</div>'
        + '<ul style="margin:0;padding-left:18px;line-height:1.65;">'
        + lines.map(function(l) { return '<li>' + l + '</li>'; }).join('')
        + '</ul>'
        + '<div style="margin-top:6px;font-size:0.66rem;opacity:0.8;">' + t('try_extend_period') + '</div>'
        + '</div></div>';
    panel.innerHTML = html;
}

function refreshResultsTranslations() {
    if (!lastAnalysisData || !lastRequestedIndices || lastRequestedIndices.length === 0) return;

    const periodSummary = lastAnalysisData.period_summary || {};
    const timeseries = lastAnalysisData.timeseries || [];
    buildSummaryPanel(periodSummary, lastRequestedIndices);

    const s2Dates = timeseries.filter(ti => ti.sensor === 'Sentinel-2');
    const lsDates = timeseries.filter(ti => ti.sensor === 'Landsat 8/9');
    buildWarnings(periodSummary, lastRequestedIndices, s2Dates.length, lsDates.length);

    const cont = document.getElementById('dates-container');
    if (!cont || timeseries.length === 0) return;

    const selected = new Set(
        Array.from(cont.querySelectorAll('.date-checkbox:checked')).map(cb => cb.dataset.sensor + '|' + cb.value)
    );

    let html = '';
    if (s2Dates.length > 0) {
        html += '<div class="sensor-group">';
        html += '<div class="sensor-header"><span class="sensor-badge s2">' + t('optical') + '</span><div class="sensor-meta"><span class="sensor-count">' + s2Dates.length + ' ' + t('dates_suffix') + '</span><a href="#" class="select-all-link" onclick="toggleSensorDates(\'Sentinel-2\', this); return false;">' + t('all').toLowerCase() + '</a></div></div>';
        s2Dates.forEach(ti => {
            html += '<div class="date-row"><input type="checkbox" class="date-checkbox" value="' + ti.date + '" data-sensor="Sentinel-2"><span>' + formatDate(ti.date) + '</span></div>';
        });
        html += '</div>';
    }
    if (lsDates.length > 0) {
        html += '<div class="sensor-group">';
        html += '<div class="sensor-header"><span class="sensor-badge ls">' + t('thermal') + '</span><div class="sensor-meta"><span class="sensor-count">' + lsDates.length + ' ' + t('dates_suffix') + '</span><a href="#" class="select-all-link" onclick="toggleSensorDates(\'Landsat 8/9\', this); return false;">' + t('all').toLowerCase() + '</a></div></div>';
        lsDates.forEach(ti => {
            html += '<div class="date-row"><input type="checkbox" class="date-checkbox" value="' + ti.date + '" data-sensor="Landsat 8/9"><span>' + formatDate(ti.date) + '</span></div>';
        });
        html += '</div>';
    }
    cont.innerHTML = html;

    Array.from(cont.querySelectorAll('.date-checkbox')).forEach(function(cb) {
        cb.checked = selected.has(cb.dataset.sensor + '|' + cb.value);
    });
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
    document.getElementById('btn-chart-text').innerText = t('show_chart');
}

function toggleChartPopup() {
    chartPopupVisible = !chartPopupVisible;
    const popup = document.getElementById('chart-popup');
    const btnText = document.getElementById('btn-chart-text');

    if (chartPopupVisible && chartHasData && lastAnalysisData) {
        popup.style.display = 'flex';
        btnText.innerText = t('hide_chart');

        const fieldName = document.getElementById('field_id').value.trim() || (currentLang() === 'pl' ? 'Pole' : 'Field');
        const start = document.getElementById('start_date').value;
        const end = document.getElementById('end_date').value;
        document.getElementById('chart-popup-sub').innerText = fieldName + ' \u00B7 ' + start + ' \u2192 ' + end;

        buildChartTabs();
        chartActiveFilter = 'all';
        setActiveChartTab('all');
        buildPopupChart();
    } else {
        popup.classList.add('closing');
        setTimeout(function() {
            popup.style.display = 'none';
            popup.classList.remove('closing');
            if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
        }, 150);
        btnText.innerText = t('show_chart');
        chartPopupVisible = false;
    }
}

function buildChartTabs() {
    const container = document.getElementById('chart-popup-tabs');
    container.innerHTML = '';
    const timeseries = lastAnalysisData ? lastAnalysisData.timeseries : [];
    const indices = lastRequestedIndices.filter(idx => {
        const info = INDEX_INFO[idx];
        if (!info || info.isRGB) return false;
        return timeseries.some(t => t.values[idx] != null);
    });

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'chart-tab tab-all active';
    allBtn.dataset.filter = 'all';
    allBtn.innerText = t('all');
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
        fieldInput.value = (currentLang() === 'pl' ? 'Pole_' : 'Field_') + counter;
    }
    const field_id = fieldInput.value.trim();
    const start    = document.getElementById('start_date').value;
    const end      = document.getElementById('end_date').value;
    const indices  = Array.from(document.querySelectorAll('input[name="idx"]:checked')).map(cb => cb.value);

    if (!start || !end) { showToast(t('toast_time_period'), 'warning'); return; }
    if (!currentAOI) { showToast(t('toast_select_aoi'), 'warning'); return; }
    if (indices.length === 0) { showToast(t('toast_select_index'), 'warning'); return; }

    clearAllOverlays();

    var resultCard = document.getElementById('result-card');
    resultCard.style.display = 'block';
    resultCard.classList.remove('card-animate-in');
    void resultCard.offsetWidth;
    resultCard.classList.add('card-animate-in');
    showStatsSkeleton();
    showDatesSkeleton();
    document.getElementById('warnings-panel').innerHTML = '';
    document.getElementById('btn-chart-toggle').style.display = 'none';

    setStatus(t('status_searching'), "loading");
    setProgress(10);
    document.getElementById('btn-search').disabled = true;
    document.getElementById('btn-search-text').innerText = t('searching');
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

        var allMissing = indices.every(function(i) { return data.period_summary[i] == null; });

        if (data.timeseries.length === 0 || allMissing) {
            buildWarnings(data.period_summary || {}, indices, 0, 0);
            document.getElementById('summary-panel').innerHTML = '';
            document.getElementById('dates-container').innerHTML = '';
            document.getElementById('btn-chart-toggle').style.display = 'none';
            document.getElementById('btn-load').style.display = 'none';
            document.querySelector('#result-card label[style]').style.display = 'none';
            setStatus(t('status_no_images'), "warning");
        } else {
            document.getElementById('btn-load').style.display = '';
            document.querySelector('#result-card label[style]').style.display = '';

            const s2Dates = data.timeseries.filter(t => t.sensor === 'Sentinel-2');
            const lsDates = data.timeseries.filter(t => t.sensor === 'Landsat 8/9');

            buildWarnings(data.period_summary || {}, indices, s2Dates.length, lsDates.length);

            let html = '';
            if (s2Dates.length > 0) {
                html += '<div class="sensor-group">';
                html += '<div class="sensor-header"><span class="sensor-badge s2">' + t('optical') + '</span><div class="sensor-meta"><span class="sensor-count">' + s2Dates.length + ' ' + t('dates_suffix') + '</span><a href="#" class="select-all-link" onclick="toggleSensorDates(\'Sentinel-2\', this); return false;">' + t('all').toLowerCase() + '</a></div></div>';
                s2Dates.forEach(t => {
                    html += '<div class="date-row"><input type="checkbox" class="date-checkbox" value="' + t.date + '" data-sensor="Sentinel-2"><span>' + formatDate(t.date) + '</span></div>';
                });
                html += '</div>';
            }
            if (lsDates.length > 0) {
                html += '<div class="sensor-group">';
                html += '<div class="sensor-header"><span class="sensor-badge ls">' + t('thermal') + '</span><div class="sensor-meta"><span class="sensor-count">' + lsDates.length + ' ' + t('dates_suffix') + '</span><a href="#" class="select-all-link" onclick="toggleSensorDates(\'Landsat 8/9\', this); return false;">' + t('all').toLowerCase() + '</a></div></div>';
                lsDates.forEach(t => {
                    html += '<div class="date-row"><input type="checkbox" class="date-checkbox" value="' + t.date + '" data-sensor="Landsat 8/9"><span>' + formatDate(t.date) + '</span></div>';
                });
                html += '</div>';
            }
            cont.innerHTML = html;
            zoomToAOI();

            const total = s2Dates.length + lsDates.length;
            const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
            setStatus(t('status_complete', { total: total, elapsed: elapsed }), "success");

            if (field_id && currentAOI) saveFieldToRecent(field_id, currentAOI, null);
        }
        setProgress(100);
        setTimeout(() => setProgress(-1), 800);
        setTimeout(collapseSetupCard, 600);
    } catch(e) {
        console.error(e);
        setStatus("Error: " + e.message, "error");
        setProgress(-1);
        document.getElementById('summary-panel').innerHTML = '';
        document.getElementById('dates-container').innerHTML = '';
    }

    document.getElementById('btn-search').disabled = false;
    document.getElementById('btn-search-text').innerText = t('search_images');
    document.getElementById('btn-search-spinner').style.display = 'none';
}

// =========================================================================
//  LOAD SELECTED LAYERS ONTO MAP
// =========================================================================
async function loadSelectedLayers() {
    const checkedItems = Array.from(document.querySelectorAll('.date-checkbox:checked'))
        .map(cb => ({ date: cb.value, sensor: cb.dataset.sensor }));
    const allIndices = Array.from(document.querySelectorAll('input[name="idx"]:checked')).map(cb => cb.value);

    if (checkedItems.length === 0) { showToast(t('toast_select_date'), 'warning'); return; }
    if (!currentAOI) { showToast(t('toast_no_aoi'), 'warning'); return; }

    setStatus(currentLang() === 'pl' ? 'Generowanie nakładek mapowych...' : "Generating map overlays...", "loading");
    setProgress(5);
    document.getElementById('btn-load').disabled = true;
    document.getElementById('btn-load-text').innerText = t('loading');
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
            setStatus(t('status_loading_overlays', { done: completedDates, total: totalDates, elapsed: '' }), "loading");
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
        setStatus(t('status_loading_overlays', { done: completedDates, total: totalDates, elapsed: elapsed }), "loading");
    }

    if (!layersPanelOpen && loaded > 0) toggleLayersPanel();

    setProgress(100);
    setTimeout(() => setProgress(-1), 600);

    if (failed > 0 && loaded > 0) setStatus(t('status_layers_partial', { loaded: loaded, failed: failed }), "warning");
    else if (loaded > 0) setStatus(t('status_layers_ready', { loaded: loaded }), "success");
    else setStatus(t('status_layers_none'), "error");

    document.getElementById('btn-load').disabled = false;
    document.getElementById('btn-load-text').innerText = t('visualize_map');
    document.getElementById('btn-load-spinner').style.display = 'none';
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

    if ((e.key === 'W' || e.key === 'w') && e.shiftKey) {
        openWelcomePanel();
        return;
    }

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
    document.getElementById('field_id').placeholder = (currentLang() === 'pl' ? 'np. Pole_' : 'e.g. Field_') + counter;
})();

// =========================================================================
//  DATE AUTO-SUGGESTION (end date = start + 1 month)
// =========================================================================
document.getElementById('start_date').addEventListener('change', function() {
    const endInput = document.getElementById('end_date');
    if (this.value && !endInput.value) {
        const start = new Date(this.value);
        const day = start.getDate();
        start.setMonth(start.getMonth() + 1);
        // If month rollover overflowed day (e.g. Jan 31 -> Mar 3), clamp to last day of previous month.
        if (start.getDate() < day) start.setDate(0);
        endInput.value = start.toISOString().split('T')[0];
    }
});

// =========================================================================
//  REAL-TIME INPUT VALIDATION + SEARCH BUTTON GATING
// =========================================================================
function validateDates() {
    var startEl = document.getElementById('start_date');
    var endEl = document.getElementById('end_date');
    var msgEl = document.getElementById('date-validation');
    var start = startEl.value;
    var end = endEl.value;

    startEl.classList.remove('input-error', 'input-success');
    endEl.classList.remove('input-error', 'input-success');
    msgEl.className = 'validation-msg';
    msgEl.textContent = '';

    if (!start && !end) { updateSearchBtn(); return true; }

    var today = new Date().toISOString().split('T')[0];
    if (start && start > today) {
        startEl.classList.add('input-error');
        msgEl.textContent = t('validation_start_future');
        msgEl.classList.add('val-error', 'visible');
        updateSearchBtn();
        return false;
    }
    if (end && end > today) {
        endEl.classList.add('input-error');
        msgEl.textContent = t('validation_end_future');
        msgEl.classList.add('val-error', 'visible');
        updateSearchBtn();
        return false;
    }

    if (start && end) {
        if (end < start) {
            startEl.classList.add('input-error');
            endEl.classList.add('input-error');
            msgEl.textContent = t('validation_end_before_start');
            msgEl.classList.add('val-error', 'visible');
            updateSearchBtn();
            return false;
        }
        var diffMs = new Date(end) - new Date(start);
        var diffDays = Math.round(diffMs / 86400000);
        if (diffDays > 365) {
            msgEl.textContent = t('validation_long_range', { days: diffDays });
            msgEl.classList.add('val-error', 'visible');
        }
        startEl.classList.add('input-success');
        endEl.classList.add('input-success');
    }

    updateSearchBtn();
    return true;
}

document.getElementById('start_date').addEventListener('change', validateDates);
document.getElementById('end_date').addEventListener('change', validateDates);

(function initGeoJSONValidation() {
    var textarea = document.getElementById('geojson_input');
    var msgEl = document.getElementById('geojson-validation');
    textarea.addEventListener('input', function() {
        var raw = textarea.value.trim();
        textarea.classList.remove('input-error', 'input-success');
        msgEl.className = 'validation-msg';
        msgEl.textContent = '';
        if (!raw) return;
        try {
            var coords = JSON.parse(raw);
            if (!Array.isArray(coords) || !Array.isArray(coords[0]) || !Array.isArray(coords[0][0])) {
                throw new Error('Not a valid coordinates array');
            }
            textarea.classList.add('input-success');
            msgEl.textContent = t('validation_geojson_ok', { count: coords[0].length });
            msgEl.classList.add('val-success', 'visible');
        } catch(e) {
            textarea.classList.add('input-error');
            msgEl.textContent = t('validation_geojson_bad');
            msgEl.classList.add('val-error', 'visible');
        }
    });
})();

function updateSearchBtn() {
    var btn = document.getElementById('btn-search');
    var start = document.getElementById('start_date').value;
    var end = document.getElementById('end_date').value;
    var indices = document.querySelectorAll('input[name="idx"]:checked');
    var hasAOI = !!currentAOI;

    var datesOk = start && end && end >= start;
    var today = new Date().toISOString().split('T')[0];
    if (start > today || end > today) datesOk = false;

    var ready = datesOk && indices.length > 0 && hasAOI;
    btn.disabled = !ready;
}

document.querySelectorAll('input[name="idx"]').forEach(function(cb) {
    cb.addEventListener('change', updateSearchBtn);
});
document.getElementById('start_date').addEventListener('change', updateSearchBtn);
document.getElementById('end_date').addEventListener('change', updateSearchBtn);

// Recheck when AOI changes (called from setAOI)
var origSetAOI = setAOI;
setAOI = function(geojson, info) {
    origSetAOI(geojson, info);
    updateSearchBtn();
};

// Initial state
setTimeout(updateSearchBtn, 100);

// =========================================================================
//  FOCUS TRAP FOR MODALS  (about overlay, chart popup)
// =========================================================================
function trapFocus(containerEl) {
    var focusable = containerEl.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return null;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    function handler(e) {
        if (e.key !== 'Tab') return;
        if (e.shiftKey) {
            if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
            if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    }
    containerEl.addEventListener('keydown', handler);
    return function release() { containerEl.removeEventListener('keydown', handler); };
}

var aboutTrapRelease = null;
var origToggleAbout = toggleAboutPanel;
toggleAboutPanel = function() {
    origToggleAbout();
    var overlay = document.getElementById('about-overlay');
    if (overlay.style.display !== 'none' && !overlay.classList.contains('closing')) {
        aboutTrapRelease = trapFocus(overlay);
    } else if (aboutTrapRelease) {
        aboutTrapRelease();
        aboutTrapRelease = null;
    }
};

// =========================================================================
//  11. ONBOARDING TOUR
// =========================================================================
function startOnboardingTour() {
    if (typeof window.driver === 'undefined') return;
    const sidebarEl = document.getElementById('sidebar');
    const layersBodyEl = document.getElementById('lp-body');
    const tourUiState = {
        sidebarWasCollapsed: !!(sidebarEl && sidebarEl.classList.contains('collapsed')),
        setupWasCollapsed: !setupCardOpen,
        layersWasCollapsed: !!(layersBodyEl && layersBodyEl.style.display === 'none')
    };

    // Ensure guided elements are visible before starting tour.
    if (tourUiState.sidebarWasCollapsed) toggleSidebar();
    if (tourUiState.setupWasCollapsed) expandSetupCard();
    if (tourUiState.layersWasCollapsed) toggleLayersPanel();

    const driverObj = window.driver.js.driver({
        showProgress: true,
        animate: true,
        overlayColor: 'rgba(15, 23, 42, 0.6)',
        stagePadding: 8,
        stageRadius: 12,
        popoverClass: 'biomass-tour-popover',
        nextBtnText: t('tour_next'),
        prevBtnText: t('tour_prev'),
        doneBtnText: t('tour_done'),
        steps: [
            {
                popover: {
                    title: t('tour_welcome_title'),
                    description: t('tour_welcome_desc_html'),
                }
            },
            {
                element: '#setup-card',
                popover: {
                    title: t('tour_setup_title'),
                    description: t('tour_setup_desc_html'),
                    side: 'right',
                    align: 'start'
                }
            },
            {
                element: '#aoi-tabs',
                popover: {
                    title: t('tour_aoi_title'),
                    description: t('tour_aoi_desc_html'),
                    side: 'right'
                }
            },
            {
                element: '#btn-search',
                popover: {
                    title: t('tour_run_title'),
                    description: t('tour_run_desc_html'),
                    side: 'right'
                }
            },
            {
                element: '#map',
                popover: {
                    title: t('tour_map_title'),
                    description: t('tour_map_desc_html'),
                    side: 'left'
                }
            },
            {
                element: '#map-tools',
                popover: {
                    title: t('tour_tools_title'),
                    description: t('tour_tools_desc_html'),
                    side: 'right'
                }
            },
            {
                element: '#layers-panel',
                popover: {
                    title: t('tour_layers_title'),
                    description: t('tour_layers_desc_html'),
                    side: 'left'
                }
            },
            {
                element: '#btn-dark-mode',
                popover: {
                    title: t('tour_shortcuts_title'),
                    description: t('tour_shortcuts_desc_html'),
                    side: 'bottom'
                }
            }
        ],
        onDestroyed: function() {
            localStorage.setItem('biomass_tour_done', '1');
            // Restore previous layout state after tour closes.
            if (tourUiState.setupWasCollapsed) collapseSetupCard();
            if (tourUiState.layersWasCollapsed) toggleLayersPanel();
            if (tourUiState.sidebarWasCollapsed) toggleSidebar();
        }
    });

    // Wait for sidebar animation if we had to open it.
    setTimeout(function() { driverObj.drive(); }, tourUiState.sidebarWasCollapsed ? 340 : 40);
}

function initWelcomePanel() {
    const overlay = document.getElementById('welcome-overlay');
    if (!overlay) return;
    const langBtns = overlay.querySelectorAll('.welcome-lang-btn');
    const continueBtn = document.getElementById('welcome-continue');
    let selectedLang = localStorage.getItem('biomass_lang') || 'en';
    if (!selectedLang || (selectedLang !== 'en' && selectedLang !== 'pl')) selectedLang = 'en';

    function syncLangButtons() {
        langBtns.forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.lang === selectedLang);
        });
    }

    langBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            selectedLang = this.dataset.lang || 'en';
            syncLangButtons();
        });
    });

    continueBtn.addEventListener('click', function() {
        setLanguage(selectedLang);
        overlay.style.display = 'none';
        localStorage.setItem('biomass_welcome_done', '1');
        if (!localStorage.getItem('biomass_tour_done')) setTimeout(startOnboardingTour, 120);
    });

    syncLangButtons();
}

function openWelcomePanel() {
    const overlay = document.getElementById('welcome-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
}

// Auto-start tour on first visit only
(function checkOnboarding() {
    initWelcomePanel();
    const welcomeDone = localStorage.getItem('biomass_welcome_done');
    const tourDone = localStorage.getItem('biomass_tour_done');
    const welcomeOverlay = document.getElementById('welcome-overlay');
    if (!welcomeDone && welcomeOverlay) {
        welcomeOverlay.style.display = 'flex';
    } else if (!tourDone) {
        setTimeout(startOnboardingTour, 800);
    }
})();

window.refreshResultsTranslations = refreshResultsTranslations;
window.refreshSetupSummaryTranslations = refreshSetupSummaryTranslations;

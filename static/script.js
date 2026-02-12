const API_URL = window.location.origin;
    
    const INDEX_INFO = {
        "NDVI": { short: "NDVI", full: "Normalized Difference Vegetation Index", formula: "(NIR - Red) / (NIR + Red)", desc: "Standard for assessing green biomass health.", gradient: "linear-gradient(to right, #a50026, #f46d43, #fee08b, #d9ef8b, #66bd63, #006837)", range: ["-1.0", "1.0"] },
        "GNDVI": { short: "GNDVI", full: "Green Normalized Difference Vegetation Index", formula: "(NIR - Green) / (NIR + Green)", desc: "Optimized for chlorophyll and nitrogen monitoring.", gradient: "linear-gradient(to right, #a50026, #f46d43, #ffffbf, #a6d96a, #1a9850)", range: ["-1.0", "1.0"] },
        "EVI": { short: "EVI", full: "Enhanced Vegetation Index", formula: "2.5 * ((NIR - Red) / (NIR + 6*Red - 7.5*Blue + 1))", desc: "Reduces atmospheric and soil background interference.", gradient: "linear-gradient(to right, #CE7E45, #FCD163, #66A000, #207401)", range: ["-1.0", "1.0"] },
        "MSAVI2": { short: "MSAVI2", full: "Modified Soil Adjusted Vegetation Index", formula: "(2*NIR + 1 - sqrt((2*NIR+1)^2 - 8*(NIR-Red))) / 2", desc: "Best for early growth with low plant density.", gradient: "linear-gradient(to right, #8c510a, #d8b365, #f6e8c3, #c7eae5, #5ab4ac, #01665e)", range: ["-1.0", "1.0"] },
        "NDRE": { short: "NDRE", full: "Normalized Difference Red Edge Index", formula: "(NIR - RE1) / (NIR + RE1)", desc: "Critical for late-stage nitrogen analysis.", gradient: "linear-gradient(to right, #440154, #3b528b, #21908c, #5dc963, #fde725)", range: ["-1.0", "1.0"] },
        "NDWI": { short: "NDWI", full: "Normalized Difference Water Index", formula: "(Green - NIR) / (Green + NIR)", desc: "Detects plant water stress and moisture levels.", gradient: "linear-gradient(to right, #ffffd9, #41b6c4, #225ea8, #081d58)", range: ["-1.0", "1.0"] },
        "SAVI": { short: "SAVI", full: "Soil Adjusted Vegetation Index", formula: "((NIR - Red) / (NIR + Red + 0.5)) * 1.5", desc: "Corrects for soil brightness background.", gradient: "linear-gradient(to right, #8c510a, #f6e8c3, #01665e)", range: ["-1.0", "1.0"] },
        "OSAVI": { short: "OSAVI", full: "Optimized Soil Adjusted Vegetation Index", formula: "(NIR - Red) / (NIR + Red + 0.16)", desc: "Improved soil adjustment for sparse vegetation.", gradient: "linear-gradient(to right, #8c510a, #f6e8c3, #01665e)", range: ["-1.0", "1.0"] },
        "REIP": { short: "REIP", full: "Red Edge Inflection Point", formula: "700 + 40 * (((Red + RE3)/2 - RE1)/(RE2 - RE1))", desc: "Tracks spectral shifts in the red-edge slope (nm).", gradient: "linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)", range: ["700", "760"] }
    };

    // --- MAP CORE ---
    const satellite = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=en', { maxZoom: 20 });
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });

    const map = L.map('map', { center: [52.0, 19.0], zoom: 6, layers: [satellite] });

    const baseMaps = { "Satellite View": satellite, "Street Map (OSM)": osm };
    let layerControl = L.control.layers(baseMaps, {}, { collapsed: false }).addTo(map);

    L.control.scale({ metric: true, imperial: false }).addTo(map);
    const miniMap = new L.Control.MiniMap(L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'), { toggleDisplay: true, position: 'bottomleft' }).addTo(map);

    let activeLayers = [];
    let aoiLayer = null;

    function setStatus(msg, type='info') {
        const el = document.getElementById('status');
        el.innerText = msg;
        el.style.color = type === 'error' ? '#e53e3e' : '#64748b';
    }

    function zoomToAOI() {
        const geoJSONStr = document.getElementById('geojson_input').value.trim();
        if(!geoJSONStr) { alert("Enter GeoJSON coordinates first."); return; }
        try {
            const coords = JSON.parse(geoJSONStr);
            if (aoiLayer) map.removeLayer(aoiLayer);
            aoiLayer = L.geoJSON({ type: "Polygon", coordinates: coords }, {
                style: { color: "#ffffff", weight: 3, fillOpacity: 0.05, dashArray: "8, 8" }
            }).addTo(map);
            map.fitBounds(aoiLayer.getBounds(), { padding: [50, 50], animate: true });
            setStatus("🎯 Map centered on AOI.");
        } catch(e) { alert("Invalid GeoJSON format."); }
    }

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
        document.querySelectorAll('.leg-tab').forEach(t => t.classList.toggle('active', t.innerText === idx));
    }

    async function startAnalysis() {
        const field_id = document.getElementById('field_id').value;
        const start = document.getElementById('start_date').value;
        const end = document.getElementById('end_date').value;
        const geoJSONStr = document.getElementById('geojson_input').value.trim();
        const indices = Array.from(document.querySelectorAll('input[name="idx"]:checked')).map(cb => cb.value);

        if(!field_id || !start || !end || !geoJSONStr) { alert("Please complete all parameters."); return; }
        setStatus("🛰️ Polling Sentinel-2 collection...");
        document.getElementById('btn-search').disabled = true;

        try {
            const currentQuery = { field_id, start_date: start, end_date: end, indices, geojson: { type: "Polygon", coordinates: JSON.parse(geoJSONStr) } };
            const res = await fetch(`${API_URL}/calculate/biomass`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(currentQuery) });
            const data = await res.json();
            const cont = document.getElementById('dates-container'); cont.innerHTML = "";
            if(data.timeseries.length === 0) {
                setStatus("❌ No clear imagery found for this period.", "error");
            } else {
                data.timeseries.forEach(t => {
                    cont.innerHTML += `<div class="date-row"><input type="checkbox" class="date-checkbox" value="${t.date}"><span>${t.date}</span></div>`;
                });
                document.getElementById('result-card').style.display = 'block';
                zoomToAOI();
                setStatus(`✅ Data retrieved. Found ${data.timeseries.length} dates.`);
            }
        } catch(e) { setStatus("❌ API Connection Failed.", "error"); }
        document.getElementById('btn-search').disabled = false;
    }

    async function loadSelectedLayers() {
        const dates = Array.from(document.querySelectorAll('.date-checkbox:checked')).map(cb => cb.value);
        const geoJSONStr = document.getElementById('geojson_input').value.trim();
        const indices = Array.from(document.querySelectorAll('input[name="idx"]:checked')).map(cb => cb.value);

        if(dates.length === 0) { alert("Select at least one date."); return; }
        setStatus("🎨 Requesting map tiles...");
        document.getElementById('btn-load').disabled = true;
        zoomToAOI();

        activeLayers.forEach(l => { map.removeLayer(l); layerControl.removeLayer(l); });
        activeLayers = [];
        document.getElementById('legend-tabs').innerHTML = "";

        for (const date of dates) {
            for (const idx of indices) {
                try {
                    const res = await fetch(`${API_URL}/visualize/map`, { 
                        method: 'POST', 
                        headers: {'Content-Type': 'application/json'}, 
                        body: JSON.stringify({ field_id: "tmp", start_date: date, end_date: date, indices: [idx], geojson: { type: "Polygon", coordinates: JSON.parse(geoJSONStr) }}) 
                    });
                    const data = await res.json();
                    const tileLayer = L.tileLayer(data.layer_url, { opacity: 1.0 });
                    layerControl.addOverlay(tileLayer, `<b>${date}</b>: ${idx}`);
                    activeLayers.push(tileLayer);

                    if (!Array.from(document.querySelectorAll('.leg-tab')).some(t => t.innerText === idx)) {
                        const btn = document.createElement('div');
                        btn.className = 'leg-tab'; btn.innerText = idx;
                        btn.onclick = () => updateLegend(idx);
                        document.getElementById('legend-tabs').appendChild(btn);
                    }
                    if (activeLayers.length === 1) { tileLayer.addTo(map); updateLegend(idx); }
                } catch(e) { console.error(e); }
            }
        }
        setStatus("✨ Ready.");
        document.getElementById('btn-load').disabled = false;
    }

    map.on('overlayadd', (e) => {
        const match = e.name.match(/: ([A-Z0-9]+)/);
        if (match) updateLegend(match[1]);
    });
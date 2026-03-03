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
const AUTO_ANALYSIS_INDICES = ['VHI', 'TCI', 'NDVI', 'NDMI', 'TVDI'];
const FIELD_SCORE_CORE_INDICES = ['VHI', 'TCI', 'NDVI', 'NDMI', 'TVDI'];

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
    "FIELD_CONDITION_MAP": { short: "Field Score", full: "Field Condition Score (Map)", formula: "Single score for the selected field (0–10)", desc: "Simple map view for non-technical users: the whole field is colored by the final condition score.", gradient: "linear-gradient(to right, #b91c1c, #ea580c, #eab308, #84cc16, #16a34a)", range: ["0 (Critical)", "10 (Healthy)"], chartColor: "#16a34a" },
    "STRESS_HOTSPOTS": { short: "Stress", full: "Field Stress Hotspots",            formula: "Weighted stress from VHI, TCI, NDVI, NDMI, TVDI", desc: "Hotspot layer uses the same 5 stress signals as the field score and adapts contrast for better visibility within each field.",                                  gradient: "linear-gradient(to right, #e6f7ff, #7dd3fc, #22d3ee, #fde047, #f59e0b, #ef4444, #b91c1c)",                        range: ["Low", "High"], chartColor: "#ef4444" },
    "RGB":   { short: "RGB",   full: "True Color Composite",                       formula: "Red / Green / Blue",                                desc: "Natural-color satellite scene for visual reference.",                        gradient: "linear-gradient(to right, #000, #444, #888, #ccc, #fff)",                                                           range: ["Dark", "Bright"], isRGB: true }
};

const INDEX_INFO_PL = {
    NDVI:  { full: "Znormalizowany różnicowy indeks wegetacji", desc: "Kondycja roślin: 0.1-0.3 wczesny wzrost, 0.4-0.6 środek sezonu, 0.6-0.9 pełny łan." },
    NDRE:  { full: "Znormalizowany indeks czerwonej krawędzi", desc: "Najlepszy w środku i końcu sezonu; <0.2 gleba, 0.2-0.6 rozwój, >0.6 zdrowa roślinność." },
    GNDVI: { full: "Zielony znormalizowany indeks wegetacji", desc: "Bardziej czuły na chlorofil i azot niż NDVI przy gęstym okryciu." },
    EVI:   { full: "Ulepszony indeks wegetacji", desc: "Zdrowe uprawy zwykle 0.2-0.8; lepiej koryguje wpływ atmosfery i gleby." },
    SAVI:  { full: "Glebowo skorygowany indeks wegetacji", desc: "Najlepszy przy pokryciu łanu <40%; ogranicza wpływ jasności gleby." },
    CIre:  { full: "Indeks chlorofilu - czerwona krawędź", desc: "Wskaźnik chlorofilu łanu; dla upraw zwykle 1-8." },
    MTCI:  { full: "Lądowy indeks chlorofilu MERIS", desc: "Prawie liniowo związany z chlorofilem; uprawy zwykle 1-5." },
    IRECI: { full: "Odwrócony chlorofilowy indeks czerwonej krawędzi", desc: "Czteropasmowy wskaźnik chlorofilu; zwykle 0.2-2.5, gęsty łan do ~3." },
    NDMI:  { full: "Znormalizowany różnicowy indeks wilgotności", desc: "Zawartość wody w liściach; <−0.2 sucho, 0-0.4 umiarkowanie, >0.4 dobrze uwilgotnione." },
    NMDI:  { full: "Znormalizowany wielopasmowy indeks suszy", desc: "Monitor suszy SWIR; wyższe wartości = więcej wilgoci w glebie i roślinach." },
    LST:   { full: "Temperatura powierzchni lądu", desc: "Temperatura IR; stres cieplny zwykle >35 C, optimum dla upraw ok. 15-30 C." },
    VSWI:  { full: "Wskaźnik zaopatrzenia roślin w wodę", desc: "Wskaźnik dostępności wody; wyżej = lepsze uwilgotnienie, niżej = stres suszowy." },
    TVDI:  { full: "Temperaturowo-wegetacyjny indeks suchości", desc: "Rozkład wilgotności: 0 = mokro, 1 = sucho / stres." },
    TCI:   { full: "Indeks warunków termicznych", desc: "Wg Kogana (1995); 0% = skrajny stres cieplny, 100% = chłodno i optymalnie." },
    VHI:   { full: "Indeks zdrowia roślinności", desc: "Wskaźnik łączony; <40 susza, 40-60 stan umiarkowany, >60 dobra kondycja." },
    FIELD_CONDITION_MAP: { full: "Ocena kondycji pola (mapa)", desc: "Prosta warstwa mapowa: cały obszar pola jest pokolorowany według końcowej oceny 0-10." },
    STRESS_HOTSPOTS: {
        short: "Stres",
        full: "Mapa stref stresu na polu",
        formula: "Ważony stres z VHI, TCI, NDVI, NDMI, TVDI",
        desc: "Warstwa hotspotów używa tych samych 5 sygnałów stresu co wynik pola i automatycznie dopasowuje kontrast dla lepszej widoczności."
    },
    RGB:   { full: "Kompozycja barw naturalnych", desc: "Naturalny obraz satelitarny do wizualnej interpretacji." }
};

function getIndexInfo(idx) {
    const base = INDEX_INFO[idx];
    if (!base) return null;
    if (currentLanguage !== 'pl') return base;
    const localized = INDEX_INFO_PL[idx];
    if (!localized) return base;
    return Object.assign({}, base, localized);
}

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

function localizeConditionLabel(label) {
    if (currentLanguage !== 'pl') return label;
    const map = {
        'Excellent': 'Bardzo dobre',
        'Good': 'Dobre',
        'Fair': 'Umiarkowane',
        'Poor': 'Słabe',
        'Critical': 'Krytyczne',
        'Optimal': 'Optymalne',
        'Warm': 'Podwyższone',
        'Wet': 'Wilgotne',
        'Normal': 'Normalne',
        'Dry': 'Suche',
        'Very Dry': 'Bardzo suche'
    };
    return map[label] || label;
}

function evaluateCondition(idx, value) {
    const t = INDEX_THRESHOLDS[idx];
    if (!t) return { label: '—', cls: 'cond-neutral' };
    for (const lv of t.levels) {
        if (t.dir === 'higher' && value >= lv.v) return { label: localizeConditionLabel(lv.l), cls: conditionClass(lv.l) };
        if (t.dir === 'lower'  && value <= lv.v) return { label: localizeConditionLabel(lv.l), cls: conditionClass(lv.l) };
    }
    return { label: '—', cls: 'cond-neutral' };
}

function formatStatValue(idx, val) {
    if (val == null) return 'N/A';
    if (idx === 'STRESS_HOTSPOTS') return (val * 100).toFixed(0) + ' %';
    if (idx === 'LST')  return val.toFixed(1) + ' °C';
    if (idx === 'TCI' || idx === 'VHI') return val.toFixed(1) + ' %';
    if (idx === 'VSWI') return val.toFixed(4);
    if (idx === 'CIre' || idx === 'MTCI' || idx === 'IRECI') return val.toFixed(2);
    return val.toFixed(3);
}

function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const locale = currentLanguage === 'pl' ? 'pl-PL' : 'en-GB';
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

// =========================================================================
//  I18N (EN / PL)
// =========================================================================
const I18N = {
    en: {
        app_title: 'Biomass Explorer',
        app_subtitle: 'Crop monitoring from space',
        welcome_title: 'Welcome to Biomass Explorer',
        welcome_subtitle: 'Choose your language to continue. You can change it later in the header.<br>Wybierz język, aby kontynuować. Później możesz go zmienić w nagłówku.',
        welcome_continue: 'Continue',
        about_title: 'About this tool',
        about_intro_html: '<b>Biomass Explorer</b> analyses satellite imagery to monitor crop health, vegetation condition, and drought stress over your fields.',
        about_satellites: 'Satellites used',
        about_s2_html: '<b>Sentinel-2</b> &mdash; captures vegetation &amp; growth indices at 10 m resolution. Revisit time: <b>~5 days</b>.',
        about_ls_html: '<b>Landsat 8/9</b> &mdash; captures surface temperature &amp; drought indices at 30 m resolution. Revisit time: <b>~8 days</b>.',
        about_note: 'Because they fly on different orbits, the available dates for each satellite will be different. Results are grouped accordingly.',
        about_cloud_filter: 'Cloud filtering',
        about_cloud_desc: 'Only images where <b>at least 80 %</b> of your field is cloud-free are used. Persistent cloud cover may result in fewer available dates. Extending the time period usually helps.',
        about_cond: 'Condition ratings',
        about_cond_desc_html: 'Period averages are evaluated against crop-science thresholds and labelled as <span class="cond-excellent" style="font-weight:700;">Excellent</span>, <span class="cond-good" style="font-weight:700;">Good</span>, <span class="cond-fair" style="font-weight:700;">Fair</span>, <span class="cond-poor" style="font-weight:700;">Poor</span>, or <span class="cond-critical" style="font-weight:700;">Critical</span>.',
        about_shortcuts: 'Keyboard shortcuts',
        about_shortcuts_desc_html: '<kbd>Esc</kbd> Close popups &amp; cancel tools &middot; <kbd>L</kbd> Toggle layers panel &middot; <kbd>F</kbd> Recenter on field &middot; <kbd>D</kbd> Toggle dark mode &middot; <kbd>G</kbd> Start guided tour &middot; <kbd>?</kbd> Show this panel',
        tour_next: 'Next ->',
        tour_prev: '<- Back',
        tour_done: 'Start exploring!',
        tour_welcome_title: 'Welcome to Biomass Explorer! 🌍',
        tour_welcome_desc_html: 'This tool uses Sentinel-2 and Landsat satellite imagery to monitor crop health, vegetation, and drought over your fields.<br><br>Let\'s take a quick tour of the key features. You can replay this guide anytime by pressing <kbd>G</kbd>.',
        tour_setup_title: 'Step 1 - Analysis Setup',
        tour_setup_desc_html: 'This panel has three sections:<br>• <b>Field &amp; Time</b> - name your field and pick a date range<br>• <b>Indices</b> - choose which vegetation or drought indices to compute<br>• <b>Area of Interest</b> - select your field boundary',
        tour_aoi_title: 'Choose Your Field',
        tour_aoi_desc_html: '<b>Parcel Search</b> - find by cadastral ID or region name<br><b>Map Click</b> - click directly on the map<br><b>GeoJSON</b> - paste custom coordinates<br><br>After loading, an <em>Edit Boundary</em> button lets you adjust the polygon.',
        tour_run_title: 'Run the Analysis',
        tour_run_desc_html: 'After setting your AOI, dates, and indices - click here to search for cloud-free satellite images. Results will appear below with period averages and available dates.',
        tour_map_title: 'Interactive Map',
        tour_map_desc_html: 'Your field boundary and satellite index overlays appear here. After running an analysis, select dates and click <b>Visualize on Map</b> to load layers.',
        tour_tools_title: 'Map Tools',
        tour_tools_desc_html: 'Four tools at your disposal:<br>• <b>Ruler</b> - measure distances<br>• <b>Polygon</b> - measure areas<br>• <b>Info</b> - click any pixel to see its index value<br>• <b>Target</b> - recenter on your field (appears after AOI is set)',
        tour_layers_title: 'Layer Control',
        tour_layers_desc_html: 'Switch between Satellite and Street base maps, toggle cadastral boundaries, and manage loaded index overlays. The opacity slider controls overlay transparency.',
        tour_shortcuts_title: 'Keyboard Shortcuts',
        tour_shortcuts_desc_html: '<kbd>D</kbd> Dark mode &middot; <kbd>L</kbd> Layers panel &middot; <kbd>F</kbd> Recenter on field &middot; <kbd>G</kbd> This guided tour &middot; <kbd>?</kbd> About panel &middot; <kbd>Esc</kbd> Cancel tools',
        analysis_setup: 'Analysis Setup',
        field_time: 'Field & Time',
        field_name: 'Field Name',
        time_period: 'Time Period',
        date_to: 'to',
        indices: 'Field Health Check',
        vegetation_growth: 'Vegetation & Growth',
        temp_drought: 'Temperature & Drought',
        auto_indices_note: 'We automatically choose the best indicators and calculate one clear Field Condition Score. No technical setup needed.',
        advanced_indices: 'Expert mode: choose indicators manually (optional)',
        auto_indices_short: 'Automatic',
        select_all: 'select all',
        deselect_all: 'deselect all',
        area_interest: 'Area of Interest',
        parcel_search: 'Parcel Search',
        map_click: 'Map Click',
        geojson: 'GeoJSON',
        parcel_hint: 'Enter a parcel ID (TERYT) or region name + parcel number',
        find_parcel: 'FIND PARCEL',
        searching: 'SEARCHING...',
        map_click_desc: 'Click the button below, then click on the map to identify the cadastral parcel at that location.',
        pick_from_map: 'PICK FROM MAP',
        click_on_map: 'CLICK ON MAP...',
        apply_geojson: 'APPLY GEOJSON',
        edit_boundary: 'EDIT BOUNDARY',
        save_boundary: 'SAVE BOUNDARY',
        save_boundary_hint: '(or double-click map)',
        check_field_condition: 'CHECK FIELD CONDITION',
        search_images: 'SEARCH FOR IMAGES',
        results_overview: 'Results Overview',
        field_condition_title: 'Field Condition Score',
        field_condition_confidence: 'Confidence',
        field_condition_damaged_area: 'Stress risk',
        field_condition_stress_level: 'Stress level',
        field_condition_drivers: 'Main focus areas',
        field_condition_no_drivers: 'No major stress drivers detected.',
        field_condition_conf_reason: 'Based on {obs} observations and {core} core indicators.',
        field_condition_trend: 'Trend',
        previous_period: 'previous period',
        field_condition_msg_healthy: 'The field looks healthy in this period. Continue current management and monitor regularly.',
        field_condition_msg_mostly: 'The field is mostly healthy, with minor stress signs in some indicators.',
        field_condition_msg_watch: 'The field needs attention. Consider checking moisture and heat-stress areas.',
        field_condition_msg_stressed: 'The field shows clear stress signals. A field visit is recommended soon.',
        field_condition_msg_critical: 'The field condition is critical in this period. Immediate inspection is recommended.',
        trend_improving: 'improving',
        trend_worsening: 'worsening',
        trend_stable: 'stable',
        stress_level_low: 'Low',
        stress_level_medium: 'Medium',
        stress_level_high: 'High',
        severity_high: 'high concern',
        severity_moderate: 'moderate concern',
        severity_watch: 'watch area',
        driver_ndvi: 'Plant vigor',
        driver_ndmi: 'Plant moisture',
        driver_vhi: 'Overall crop health',
        driver_tci: 'Heat stress',
        driver_tvdi: 'Dryness risk',
        driver_action_ndvi: 'Check uneven growth and stand density.',
        driver_action_ndmi: 'Check soil moisture and irrigation.',
        driver_action_vhi: 'Inspect overall crop stress in weaker zones.',
        driver_action_tci: 'Watch heat stress and consider watering timing.',
        driver_action_tvdi: 'Inspect dry patches and water availability.',
        driver_action_default: 'Inspect this area in the field.',
        show_stress_hotspots: 'SHOW STRESS HOTSPOTS ON MAP',
        show_field_condition_map: 'SHOW FIELD SCORE ON MAP',
        toast_no_hotspots: 'No recent data available to highlight stress hotspots.',
        status_loading_hotspots: 'Preparing stress hotspot layers...',
        status_hotspots_ready: 'Stress hotspot layers are ready on the map.',
        status_loading_condition_map: 'Preparing field score map layer...',
        status_condition_map_ready: 'Field score layer is ready on the map.',
        label_healthy: 'Healthy',
        label_mostly_healthy: 'Mostly healthy',
        label_watch: 'Watch',
        label_stressed: 'Stressed',
        label_critical: 'Critical',
        show_technical_indices: 'SHOW TECHNICAL INDICES',
        hide_technical_indices: 'HIDE TECHNICAL INDICES',
        period_averages: 'Period Averages',
        period_avg: 'period avg',
        show_chart: 'SHOW TIME SERIES CHART',
        hide_chart: 'HIDE TIME SERIES CHART',
        available_dates: 'Available Observation Dates',
        visualize_map: 'VISUALIZE ON MAP',
        loading: 'LOADING...',
        ready: 'Ready to start.',
        layers: 'Layers',
        base_map: 'Base Map',
        satellite: 'Satellite',
        street_map: 'Street Map (OSM)',
        reference: 'Reference',
        cadastral_parcels: 'Cadastral Parcels',
        cadastral_hint: 'Boundaries + numbers (GUGiK)',
        overlays: 'Overlays',
        clear_all: 'Clear all',
        opacity: 'Opacity',
        time_series: 'Time Series',
        search_location: 'Search location...',
        all: 'All',
        optical: 'Optical',
        thermal: 'Thermal',
        dates_suffix: 'dates',
        rgb_scene: 'True Image',
        stress_layer_name: 'Stress Layer',
        missing_data_title: 'Missing data for {missing} of {total} indices:',
        warning_s2_no_images: '<b>{names}</b> — no cloud-free <b>Sentinel-2</b> (optical) images found during this period.',
        warning_ls_no_images: '<b>{names}</b> — no cloud-free <b>Landsat 8/9</b> (thermal) images found. Thermal satellites revisit every 8–16 days.',
        warning_cannot_compute_cloud: '<b>{names}</b> — could not be computed (likely persistent cloud cover).',
        try_extend_period: 'Try extending the date range or selecting a different time period.',
        status_searching: 'Searching for cloud-free satellite images over your field...',
        status_no_images: 'No cloud-free images were found for this period. Try a wider date range.',
        status_complete: 'Analysis complete — {total} cloud-free observations found in {elapsed}s.',
        status_loading_overlays: 'Loading layers... {done} / {total} dates processed{elapsed}',
        status_layers_ready: 'Map ready — {loaded} layers loaded. Toggle visibility in the layer panel.',
        status_layers_partial: 'Map layers loaded ({loaded} OK, {failed} date(s) failed). Toggle layers in the panel.',
        status_layers_none: 'Could not load any map layers. The selected dates may not have matching index data.',
        toast_time_period: 'Please select a time period.',
        toast_select_aoi: 'Please select an area of interest using one of the methods (Parcel Search, Map Click, or GeoJSON).',
        toast_select_index: 'Please select at least one index to compute.',
        toast_select_date: 'Please select at least one date from the list above.',
        toast_no_aoi: 'No area of interest set.',
        toast_parcel_query: 'Please enter a parcel ID or region name + number.',
        toast_parcel_none: 'No parcel found. Check the ID or name.',
        toast_geojson_paste: 'Paste GeoJSON coordinates first.',
        toast_geojson_invalid: 'Invalid GeoJSON. Expected a coordinates array like [[[lon,lat], ...]].',
        validation_start_future: 'Start date is in the future — no satellite data available.',
        validation_end_future: 'End date is in the future — no satellite data available yet.',
        validation_end_before_start: 'End date must be after the start date.',
        validation_long_range: 'Range is {days} days — very long periods may be slow.',
        validation_geojson_ok: 'Valid coordinate array ({count} vertices).',
        validation_geojson_bad: 'Invalid JSON — expected [[[lon, lat], ...]].'
    },
    pl: {
        app_title: 'Biomass Explorer',
        app_subtitle: 'Monitoring upraw z kosmosu',
        welcome_title: 'Witamy w Biomass Explorer',
        welcome_subtitle: 'Wybierz język, aby kontynuować. Później możesz go zmienić w nagłówku.<br>Choose your language to continue. You can change it later in the header.',
        welcome_continue: 'Kontynuuj',
        about_title: 'O tym narzędziu',
        about_intro_html: '<b>Biomass Explorer</b> analizuje zdjęcia satelitarne, aby monitorować kondycję upraw, stan wegetacji oraz stres suszowy na Twoich polach.',
        about_satellites: 'Wykorzystywane satelity',
        about_s2_html: '<b>Sentinel-2</b> &mdash; dostarcza indeksy wegetacji i wzrostu w rozdzielczości 10 m. Częstotliwość przelotu: <b>~5 dni</b>.',
        about_ls_html: '<b>Landsat 8/9</b> &mdash; dostarcza indeksy temperatury i suszy w rozdzielczości 30 m. Częstotliwość przelotu: <b>~8 dni</b>.',
        about_note: 'Ponieważ satelity poruszają się po różnych orbitach, dostępne daty dla każdego z nich będą różne. Wyniki są grupowane osobno.',
        about_cloud_filter: 'Filtrowanie chmur',
        about_cloud_desc: 'Wykorzystywane są tylko obrazy, gdzie <b>co najmniej 80 %</b> pola jest bezchmurne. Długotrwałe zachmurzenie może zmniejszyć liczbę dostępnych dat. Zwykle pomaga wydłużenie okresu.',
        about_cond: 'Ocena kondycji',
        about_cond_desc_html: 'Średnie wartości z okresu są oceniane wg progów agronomicznych i oznaczane jako <span class="cond-excellent" style="font-weight:700;">Bardzo dobre</span>, <span class="cond-good" style="font-weight:700;">Dobre</span>, <span class="cond-fair" style="font-weight:700;">Umiarkowane</span>, <span class="cond-poor" style="font-weight:700;">Słabe</span> lub <span class="cond-critical" style="font-weight:700;">Krytyczne</span>.',
        about_shortcuts: 'Skróty klawiszowe',
        about_shortcuts_desc_html: '<kbd>Esc</kbd> Zamknij okna i anuluj narzędzia &middot; <kbd>L</kbd> Panel warstw &middot; <kbd>F</kbd> Wyśrodkuj na polu &middot; <kbd>D</kbd> Tryb ciemny &middot; <kbd>G</kbd> Przewodnik &middot; <kbd>?</kbd> Ten panel',
        tour_next: 'Dalej ->',
        tour_prev: '<- Wstecz',
        tour_done: 'Rozpocznij pracę!',
        tour_welcome_title: 'Witamy w Biomass Explorer! 🌍',
        tour_welcome_desc_html: 'To narzędzie wykorzystuje obrazy Sentinel-2 i Landsat do monitorowania kondycji upraw, wegetacji i stresu suszowego na Twoich polach.<br><br>Zróbmy szybki przegląd najważniejszych funkcji. Przewodnik uruchomisz ponownie klawiszem <kbd>G</kbd>.',
        tour_setup_title: 'Krok 1 - Ustawienia analizy',
        tour_setup_desc_html: 'Ten panel ma trzy sekcje:<br>• <b>Pole i czas</b> - nazwij pole i wybierz zakres dat<br>• <b>Indeksy</b> - wybierz indeksy wegetacji/suszy do obliczeń<br>• <b>Obszar analizy</b> - wskaż granicę pola',
        tour_aoi_title: 'Wybierz swoje pole',
        tour_aoi_desc_html: '<b>Wyszukaj działkę</b> - znajdź po identyfikatorze lub nazwie + numerze<br><b>Klik na mapie</b> - wskaż bezpośrednio na mapie<br><b>GeoJSON</b> - wklej własne współrzędne<br><br>Po wczytaniu możesz doprecyzować granicę przyciskiem <em>Edytuj granicę</em>.',
        tour_run_title: 'Uruchom analizę',
        tour_run_desc_html: 'Po ustawieniu AOI, dat i indeksów kliknij tutaj, aby wyszukać bezchmurne obrazy satelitarne. Wyniki pojawią się poniżej wraz ze średnimi i dostępnymi datami.',
        tour_map_title: 'Interaktywna mapa',
        tour_map_desc_html: 'Tutaj zobaczysz granicę pola i warstwy indeksów. Po analizie wybierz daty i kliknij <b>Wizualizuj na mapie</b>, aby załadować warstwy.',
        tour_tools_title: 'Narzędzia mapy',
        tour_tools_desc_html: 'Masz do dyspozycji cztery narzędzia:<br>• <b>Linijka</b> - pomiar odległości<br>• <b>Wielokąt</b> - pomiar powierzchni<br>• <b>Info</b> - kliknij piksel, aby sprawdzić wartość indeksu<br>• <b>Cel</b> - wyśrodkuj na polu (po ustawieniu AOI)',
        tour_layers_title: 'Panel warstw',
        tour_layers_desc_html: 'Przełączaj mapę bazową, granice działek i zarządzaj załadowanymi warstwami indeksów. Suwak przezroczystości reguluje widoczność nakładek.',
        tour_shortcuts_title: 'Skróty klawiszowe',
        tour_shortcuts_desc_html: '<kbd>D</kbd> Tryb ciemny &middot; <kbd>L</kbd> Panel warstw &middot; <kbd>F</kbd> Wyśrodkuj na polu &middot; <kbd>G</kbd> Ten przewodnik &middot; <kbd>?</kbd> Panel informacji &middot; <kbd>Esc</kbd> Anuluj narzędzia',
        analysis_setup: 'Ustawienia analizy',
        field_time: 'Pole i czas',
        field_name: 'Nazwa pola',
        time_period: 'Zakres czasu',
        date_to: 'do',
        indices: 'Ocena kondycji',
        vegetation_growth: 'Wegetacja i wzrost',
        temp_drought: 'Temperatura i susza',
        auto_indices_note: 'Automatycznie dobieramy najlepsze wskaźniki i wyliczamy jedną, prostą ocenę kondycji pola. Nie musisz nic ustawiać.',
        advanced_indices: 'Tryb ekspercki: ręczny wybór wskaźników (opcjonalnie)',
        auto_indices_short: 'Automatyczna',
        select_all: 'zaznacz wszystko',
        deselect_all: 'odznacz wszystko',
        area_interest: 'Obszar analizy',
        parcel_search: 'Wyszukaj działkę',
        map_click: 'Klik na mapie',
        geojson: 'GeoJSON',
        parcel_hint: 'Wpisz identyfikator działki (TERYT) lub nazwę miejscowości + numer',
        find_parcel: 'ZNAJDŹ DZIAŁKĘ',
        searching: 'SZUKANIE...',
        map_click_desc: 'Kliknij przycisk poniżej, a następnie kliknij na mapie, aby wskazać działkę ewidencyjną.',
        pick_from_map: 'WSKAŻ NA MAPIE',
        click_on_map: 'KLIKNIJ NA MAPIE...',
        apply_geojson: 'ZASTOSUJ GEOJSON',
        edit_boundary: 'EDYTUJ GRANICĘ',
        save_boundary: 'ZAPISZ GRANICĘ',
        save_boundary_hint: '(lub dwuklik na mapie)',
        check_field_condition: 'SPRAWDŹ KONDYCJĘ POLA',
        search_images: 'SZUKAJ ZDJĘĆ',
        results_overview: 'Podsumowanie wyników',
        field_condition_title: 'Ocena kondycji pola',
        field_condition_confidence: 'Pewność oceny',
        field_condition_damaged_area: 'Ryzyko stresu',
        field_condition_stress_level: 'Poziom stresu',
        field_condition_drivers: 'Najważniejsze obszary uwagi',
        field_condition_no_drivers: 'Nie wykryto istotnych czynników stresu.',
        field_condition_conf_reason: 'Na podstawie {obs} obserwacji i {core} kluczowych wskaźników.',
        field_condition_trend: 'Trend',
        previous_period: 'poprzedni okres',
        field_condition_msg_healthy: 'Pole wygląda zdrowo w tym okresie. Utrzymaj obecne działania i monitoruj regularnie.',
        field_condition_msg_mostly: 'Pole jest w większości w dobrej kondycji, ale widać drobne oznaki stresu.',
        field_condition_msg_watch: 'Pole wymaga uwagi. Warto sprawdzić miejsca z ryzykiem niedoboru wody i stresu cieplnego.',
        field_condition_msg_stressed: 'Na polu widać wyraźne sygnały stresu. Zalecana jest szybka kontrola w terenie.',
        field_condition_msg_critical: 'Kondycja pola w tym okresie jest krytyczna. Zalecana jest pilna kontrola w terenie.',
        trend_improving: 'poprawa',
        trend_worsening: 'pogorszenie',
        trend_stable: 'stabilnie',
        stress_level_low: 'Niski',
        stress_level_medium: 'Umiarkowany',
        stress_level_high: 'Wysoki',
        severity_high: 'wysoki priorytet',
        severity_moderate: 'umiarkowany priorytet',
        severity_watch: 'obszar do obserwacji',
        driver_ndvi: 'Wigor roślin',
        driver_ndmi: 'Uwodnienie roślin',
        driver_vhi: 'Ogólna kondycja upraw',
        driver_tci: 'Stres cieplny',
        driver_tvdi: 'Ryzyko przesuszenia',
        driver_action_ndvi: 'Sprawdź nierówny wzrost i zagęszczenie łanu.',
        driver_action_ndmi: 'Sprawdź wilgotność gleby i nawadnianie.',
        driver_action_vhi: 'Skontroluj ogólny stres upraw w słabszych strefach.',
        driver_action_tci: 'Obserwuj stres cieplny i rozważ korektę terminu nawadniania.',
        driver_action_tvdi: 'Sprawdź przesuszone miejsca i dostępność wody.',
        driver_action_default: 'Sprawdź ten obszar bezpośrednio w polu.',
        show_stress_hotspots: 'POKAŻ STREFY STRESU NA MAPIE',
        show_field_condition_map: 'POKAŻ OCENĘ POLA NA MAPIE',
        toast_no_hotspots: 'Brak świeżych danych do wskazania stref stresu.',
        status_loading_hotspots: 'Przygotowywanie warstw stref stresu...',
        status_hotspots_ready: 'Warstwy stref stresu są gotowe na mapie.',
        status_loading_condition_map: 'Przygotowywanie warstwy oceny pola...',
        status_condition_map_ready: 'Warstwa oceny pola jest gotowa na mapie.',
        label_healthy: 'Zdrowe',
        label_mostly_healthy: 'Raczej zdrowe',
        label_watch: 'Do obserwacji',
        label_stressed: 'W stresie',
        label_critical: 'Krytyczne',
        show_technical_indices: 'POKAŻ INDEKSY TECHNICZNE',
        hide_technical_indices: 'UKRYJ INDEKSY TECHNICZNE',
        period_averages: 'Średnie z okresu',
        period_avg: 'śr. z okresu',
        show_chart: 'POKAŻ WYKRES CZASOWY',
        hide_chart: 'UKRYJ WYKRES CZASOWY',
        available_dates: 'Dostępne daty obserwacji',
        visualize_map: 'WIZUALIZUJ NA MAPIE',
        loading: 'WCZYTYWANIE...',
        ready: 'Gotowe do uruchomienia.',
        layers: 'Warstwy',
        base_map: 'Mapa bazowa',
        satellite: 'Satelitarna',
        street_map: 'Mapa ulic (OSM)',
        reference: 'Referencyjne',
        cadastral_parcels: 'Działki ewidencyjne',
        cadastral_hint: 'Granice + numery (GUGiK)',
        overlays: 'Warstwy wyników',
        clear_all: 'Wyczyść wszystko',
        opacity: 'Przezroczystość',
        time_series: 'Szereg czasowy',
        search_location: 'Szukaj lokalizacji...',
        all: 'Wszystkie',
        optical: 'Optyczne',
        thermal: 'Termalne',
        dates_suffix: 'dat',
        rgb_scene: 'Obraz rzeczywisty',
        stress_layer_name: 'Warstwa stresu',
        missing_data_title: 'Brak danych dla {missing} z {total} indeksów:',
        warning_s2_no_images: '<b>{names}</b> — nie znaleziono bezchmurnych obrazów <b>Sentinel-2</b> (optycznych) w tym okresie.',
        warning_ls_no_images: '<b>{names}</b> — nie znaleziono bezchmurnych obrazów <b>Landsat 8/9</b> (termalnych). Satelity termalne wracają co 8–16 dni.',
        warning_cannot_compute_cloud: '<b>{names}</b> — nie udało się obliczyć (prawdopodobnie przez utrzymujące się zachmurzenie).',
        try_extend_period: 'Spróbuj wydłużyć zakres dat lub wybrać inny okres.',
        status_searching: 'Wyszukiwanie bezchmurnych obrazów satelitarnych dla Twojego pola...',
        status_no_images: 'Nie znaleziono bezchmurnych obrazów dla tego okresu. Spróbuj szerszego zakresu dat.',
        status_complete: 'Analiza zakończona — znaleziono {total} bezchmurnych obserwacji w {elapsed}s.',
        status_loading_overlays: 'Ładowanie warstw... {done} / {total} dat przetworzono{elapsed}',
        status_layers_ready: 'Mapa gotowa — załadowano {loaded} warstw. Przełączaj widoczność w panelu warstw.',
        status_layers_partial: 'Załadowano warstwy ({loaded} OK, {failed} dat(y) nieudane). Przełączaj widoczność w panelu warstw.',
        status_layers_none: 'Nie udało się załadować żadnych warstw mapy. Wybrane daty mogą nie mieć pasujących danych.',
        toast_time_period: 'Wybierz zakres czasu.',
        toast_select_aoi: 'Wybierz obszar analizy jedną z metod (Wyszukaj działkę, Klik na mapie lub GeoJSON).',
        toast_select_index: 'Wybierz co najmniej jeden indeks do obliczenia.',
        toast_select_date: 'Wybierz co najmniej jedną datę z listy powyżej.',
        toast_no_aoi: 'Nie ustawiono obszaru analizy.',
        toast_parcel_query: 'Wpisz identyfikator działki lub nazwę regionu + numer.',
        toast_parcel_none: 'Nie znaleziono działki. Sprawdź identyfikator lub nazwę.',
        toast_geojson_paste: 'Najpierw wklej współrzędne GeoJSON.',
        toast_geojson_invalid: 'Nieprawidłowy GeoJSON. Oczekiwano tablicy współrzędnych [[[lon,lat], ...]].',
        validation_start_future: 'Data początkowa jest w przyszłości — brak dostępnych danych satelitarnych.',
        validation_end_future: 'Data końcowa jest w przyszłości — brak jeszcze danych satelitarnych.',
        validation_end_before_start: 'Data końcowa musi być późniejsza niż początkowa.',
        validation_long_range: 'Zakres to {days} dni — bardzo długie okresy mogą działać wolniej.',
        validation_geojson_ok: 'Poprawna tablica współrzędnych ({count} wierzchołków).',
        validation_geojson_bad: 'Nieprawidłowy JSON — oczekiwano [[[lon, lat], ...]].'
    }
};

let currentLanguage = localStorage.getItem('biomass_lang') || 'en';
if (!I18N[currentLanguage]) currentLanguage = 'en';

function t(key, vars) {
    const table = I18N[currentLanguage] || I18N.en;
    let text = table[key] || I18N.en[key] || key;
    if (!vars) return text;
    Object.keys(vars).forEach(function(k) {
        text = text.replaceAll('{' + k + '}', String(vars[k]));
    });
    return text;
}

function _setText(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
}

function _setHtml(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.innerHTML = value;
}

function _setTextAfterIcon(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    Array.from(el.childNodes).forEach(function(n) {
        if (n.nodeType === Node.TEXT_NODE) n.nodeValue = '';
    });
    const icon = el.querySelector('svg');
    if (icon && icon.parentNode === el) {
        icon.insertAdjacentText('afterend', ' ' + value);
    } else {
        el.insertAdjacentText('beforeend', value);
    }
}

function _setCardHeaderText(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    Array.from(el.childNodes).forEach(function(n) {
        if (n.nodeType === Node.TEXT_NODE) n.nodeValue = '';
    });
    const anchor = el.querySelector('.setup-chevron') || el.querySelector('.section-num');
    if (anchor && anchor.parentNode === el) {
        if (anchor.classList.contains('setup-chevron')) {
            anchor.insertAdjacentText('beforebegin', ' ' + value + ' ');
        } else {
            anchor.insertAdjacentText('afterend', ' ' + value + ' ');
        }
    } else {
        el.insertAdjacentText('beforeend', value);
    }
}

function applyStaticTranslations() {
    document.documentElement.lang = currentLanguage;
    const langEl = document.getElementById('lang-switch');
    if (langEl) langEl.value = currentLanguage;

    _setText('#app-title', t('app_title'));
    _setText('#app-subtitle', t('app_subtitle'));
    _setText('#welcome-title', t('welcome_title'));
    _setHtml('#welcome-subtitle', t('welcome_subtitle'));
    _setText('#welcome-continue', t('welcome_continue'));
    _setText('#btn-search-text', t('search_images'));
    _setText('#btn-chart-text', t('show_chart'));
    _setText('#btn-load-text', t('visualize_map'));
    _setText('#status-text', t('ready'));

    _setCardHeaderText('#setup-card h3', t('analysis_setup'));
    _setCardHeaderText('#result-card h3', t('results_overview'));

    _setTextAfterIcon('.section-field-time .setup-section-title', t('field_time'));
    _setText('label[for="field_id"]', t('field_name'));
    _setText('label[for="start_date"]', t('time_period'));
    _setText('.date-sep', t('date_to'));
    _setTextAfterIcon('.section-field-health .setup-section-title', t('indices'));
    _setText('#auto-indices-note', t('auto_indices_note'));
    _setText('#advanced-indices-summary', t('advanced_indices'));
    _setTextAfterIcon('.section-aoi .setup-section-title', t('area_interest'));

    const idxHeaders = document.querySelectorAll('.idx-group-header label');
    if (idxHeaders[0] && idxHeaders[0].childNodes[0]) idxHeaders[0].childNodes[0].nodeValue = t('vegetation_growth') + ' ';
    if (idxHeaders[1] && idxHeaders[1].childNodes[0]) idxHeaders[1].childNodes[0].nodeValue = t('temp_drought') + ' ';

    document.querySelectorAll('.idx-group-header .select-all-link').forEach(function(el) { el.textContent = t('select_all'); });
    const aoiMethodSpans = document.querySelectorAll('.aoi-method span');
    if (aoiMethodSpans[0]) aoiMethodSpans[0].textContent = t('parcel_search');
    if (aoiMethodSpans[1]) aoiMethodSpans[1].textContent = t('map_click');
    if (aoiMethodSpans[2]) aoiMethodSpans[2].textContent = t('geojson');

    const parcelInput = document.getElementById('parcel_query');
    if (parcelInput) parcelInput.placeholder = currentLanguage === 'pl' ? 'np. 141201_1.0001.6509 lub Krzewina 134' : 'e.g. 141201_1.0001.6509 or Krzewina 134';
    _setText('.parcel-hint', t('parcel_hint'));
    _setText('#btn-parcel-text', t('find_parcel'));
    _setText('.mapclick-desc', t('map_click_desc'));
    _setText('#btn-pick-text', t('pick_from_map'));
    const geoBtn = document.querySelector('#aoi-panel-geojson .btn-apply-geojson');
    if (geoBtn) geoBtn.textContent = t('apply_geojson');
    const geoInput = document.getElementById('geojson_input');
    if (geoInput) geoInput.placeholder = currentLanguage === 'pl' ? 'Wklej współrzędne: [[[lon, lat], ...]]' : 'Paste coordinates: [[[lon, lat], ...]]';

    const editBtn = document.getElementById('btn-edit-aoi');
    if (editBtn && !editBtn.classList.contains('editing')) {
        editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> ' + t('edit_boundary');
    }

    const datesLabel = document.querySelector('#result-card label[style]');
    if (datesLabel) datesLabel.textContent = t('available_dates');
    _setText('.lp-title', t('layers'));
    _setText('.lp-section:nth-of-type(1) .lp-section-label', t('base_map'));
    _setText('.lp-radio:nth-of-type(1) span:last-child', t('satellite'));
    _setText('.lp-radio:nth-of-type(2) span:last-child', t('street_map'));
    _setText('.lp-section:nth-of-type(2) .lp-section-label', t('reference'));
    _setText('.lp-toggle-name', t('cadastral_parcels'));
    _setText('.lp-toggle-hint', t('cadastral_hint'));
    _setText('#lp-overlays-section .lp-section-label', t('overlays'));
    _setText('.lp-clear-btn', t('clear_all'));
    _setText('#lp-opacity-section .lp-section-label', t('opacity'));
    _setText('.chart-popup-title', t('time_series'));
    _setText('.about-overlay-title', t('about_title'));
    const aboutIntro = document.querySelector('.about-content > p:first-child');
    if (aboutIntro) aboutIntro.innerHTML = t('about_intro_html');
    const aboutTitles = document.querySelectorAll('.about-section-title');
    if (aboutTitles[0]) aboutTitles[0].textContent = t('about_satellites');
    if (aboutTitles[1]) aboutTitles[1].textContent = t('about_cloud_filter');
    if (aboutTitles[2]) aboutTitles[2].textContent = t('about_cond');
    if (aboutTitles[3]) aboutTitles[3].textContent = t('about_shortcuts');
    const satLines = document.querySelectorAll('.about-sat span:last-child');
    if (satLines[0]) satLines[0].innerHTML = t('about_s2_html');
    if (satLines[1]) satLines[1].innerHTML = t('about_ls_html');
    const note = document.querySelector('.about-note');
    if (note) note.textContent = t('about_note');
    const aboutSections = document.querySelectorAll('.about-content .about-section');
    if (aboutSections[1]) {
        const p = aboutSections[1].querySelector('p');
        if (p) p.innerHTML = t('about_cloud_desc');
    }
    if (aboutSections[2]) {
        const p = aboutSections[2].querySelector('p');
        if (p) p.innerHTML = t('about_cond_desc_html');
    }
    if (aboutSections[3]) {
        const p = aboutSections[3].querySelector('p');
        if (p) p.innerHTML = t('about_shortcuts_desc_html');
    }

    const darkBtn = document.getElementById('btn-dark-mode');
    if (darkBtn) {
        darkBtn.title = currentLanguage === 'pl' ? 'Przełącz tryb jasny/ciemny' : 'Toggle dark/light mode';
        darkBtn.setAttribute('aria-label', darkBtn.title);
    }
    const aboutBtn = document.getElementById('btn-about');
    if (aboutBtn) {
        aboutBtn.title = currentLanguage === 'pl' ? 'O tym narzędziu' : 'About this tool';
        aboutBtn.setAttribute('aria-label', aboutBtn.title);
    }
    const sidebarBtn = document.getElementById('sidebar-toggle');
    if (sidebarBtn) {
        sidebarBtn.title = currentLanguage === 'pl' ? 'Pokaż/ukryj panel' : 'Toggle sidebar';
        sidebarBtn.setAttribute('aria-label', sidebarBtn.title);
    }
    const mapToolMeta = [
        ['#btn-measure-dist', currentLanguage === 'pl' ? 'Zmierz odległość' : 'Measure distance'],
        ['#btn-measure-area', currentLanguage === 'pl' ? 'Zmierz powierzchnię' : 'Measure area'],
        ['#btn-pixel-inspect', currentLanguage === 'pl' ? 'Sprawdź wartości piksela' : 'Inspect pixel values'],
        ['#btn-recenter', currentLanguage === 'pl' ? 'Wyśrodkuj na polu' : 'Recenter on field'],
        ['#mobile-menu-btn', currentLanguage === 'pl' ? 'Otwórz menu' : 'Open menu']
    ];
    mapToolMeta.forEach(function(pair) {
        const el = document.querySelector(pair[0]);
        if (!el) return;
        el.title = pair[1];
        el.setAttribute('aria-label', pair[1]);
    });
    const geocoderInput = document.querySelector('.leaflet-control-geocoder-form input');
    if (geocoderInput) geocoderInput.setAttribute('placeholder', t('search_location'));

    // Refresh dynamic UI built after analysis (dates, warnings, summary).
    if (typeof refreshResultsTranslations === 'function') refreshResultsTranslations();
    // Refresh setup summary text if setup card is collapsed.
    if (typeof refreshSetupSummaryTranslations === 'function') refreshSetupSummaryTranslations();
    // Refresh dynamic overlay rows labels (incl. RGB row name).
    if (typeof refreshOverlayTranslations === 'function') refreshOverlayTranslations();
    // Refresh AOI/parcel dynamic panels.
    if (typeof refreshAoiTranslations === 'function') refreshAoiTranslations();
    if (typeof updatePrimaryActionButtonLabel === 'function') updatePrimaryActionButtonLabel();
    // Refresh visible legend content after language change.
    if (typeof updateLegend === 'function') {
        const activeLegendTab = document.querySelector('.leg-tab.active');
        if (activeLegendTab && activeLegendTab.dataset && activeLegendTab.dataset.idx) {
            updateLegend(activeLegendTab.dataset.idx);
        } else if (typeof getCurrentLegendIndex === 'function' && getCurrentLegendIndex()) {
            updateLegend(getCurrentLegendIndex());
        }
    }
}

function setLanguage(lang) {
    if (!I18N[lang]) return;
    currentLanguage = lang;
    localStorage.setItem('biomass_lang', lang);
    applyStaticTranslations();
    if (typeof renderSavedFields === 'function') renderSavedFields();
}

window.I18N = I18N;
window.getIndexInfo = getIndexInfo;
window.t = t;
window.setLanguage = setLanguage;
window.currentLang = function() { return currentLanguage; };
window.applyStaticTranslations = applyStaticTranslations;

document.addEventListener('DOMContentLoaded', applyStaticTranslations);

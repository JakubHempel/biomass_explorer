/**
 * i18n.js – Biomass Explorer bilingual support (PL / EN)
 *
 * Usage:
 *   t('key')           – get translated string in current language
 *   applyLang('en')    – switch language, update DOM + fire 'langchange' event
 *   initLang()         – apply saved language on page load
 *
 * Markup:
 *   data-i18n="key"    – sets element.textContent
 *   data-i18n-ph="key" – sets element.placeholder
 *   data-i18n-title="key" – sets element.title
 */

const I18N = {
  pl: {
    // ── Common ─────────────────────────────────────────────────────────────
    logout:            'Wyloguj',
    loading:           'Ładowanie…',
    cancel:            'Anuluj',
    save:              'Zapisz',
    saving:            'Zapisywanie…',
    edit:              'Edytuj',
    open:              'Otwórz',
    back:              'Admin',
    google_maps:       'Google Maps',
    lang_pl_title:     'Zmień na polski',
    lang_en_title:     'Switch to English',

    // ── Login ──────────────────────────────────────────────────────────────
    login_page_title:  'Logowanie – Biomass Explorer',
    login_subtitle:    'Panel administratora',
    login_h2:          'Zaloguj się',
    login_username:    'Nazwa użytkownika',
    login_password:    'Hasło',
    login_btn:         'Zaloguj się',
    login_btn_loading: 'Logowanie…',
    login_error_default: 'Nieprawidłowe dane logowania',

    // ── Admin – layout ─────────────────────────────────────────────────────
    admin_page_title:  'Admin Panel – Biomass Explorer',
    admin_title:       'Biomass Explorer',
    admin_subtitle:    'Admin Panel',
    admin_h1:          'Panel administracyjny',
    admin_desc:        'Zarządzaj użytkownikami i polami uprawni',
    tab_users:         'Użytkownicy',
    tab_fields:        'Pola uprawne',

    // ── Admin – users table ────────────────────────────────────────────────
    users_card_title:  'Użytkownicy systemu',
    add_user:          'Dodaj użytkownika',
    th_id:             '#',
    th_username:       'Użytkownik',
    th_email:          'E-mail',
    th_fullname:       'Imię i nazwisko',
    th_role:           'Rola',
    th_status:         'Status',
    th_created:        'Utworzony',
    th_actions:        'Akcje',
    role_admin:        'Admin',
    role_user:         'Użytkownik',
    status_active:     'Aktywny',
    status_inactive:   'Nieaktywny',
    deactivate:        'Dezaktywuj',
    empty_users:       'Brak użytkowników',
    n_users:           (n) => `${n} użytkownik(ów)`,

    // ── Admin – fields table ───────────────────────────────────────────────
    fields_card_title: 'Pola uprawne',
    view_on_map:       'Przeglądaj na mapie',
    draw_field:        'Narysuj nowe pole',
    th_field_id:       'ID',
    th_field_name:     'Nazwa pola',
    th_latlng:         'Lat / Lng',
    th_area:           'Pow. (ha)',
    th_field_created:  'Utworzone',
    n_fields:          (n) => `${n} pol(e)`,
    empty_fields:      'Brak zapisanych pól. Kliknij "Narysuj nowe pole", aby dodać pierwsze.',

    // ── Admin – user modal ─────────────────────────────────────────────────
    modal_new_user:     'Nowy użytkownik',
    modal_edit_user:    'Edytuj użytkownika',
    lbl_username:       'Nazwa użytkownika *',
    lbl_role:           'Rola',
    lbl_fullname:       'Imię i nazwisko',
    lbl_email:          'E-mail',
    lbl_password_new:   'Hasło *',
    lbl_password_edit:  'Nowe hasło (zostaw puste, aby nie zmieniać)',
    opt_user:           'Użytkownik',
    opt_admin:          'Administrator',
    ph_username:        'jan.kowalski',
    ph_fullname:        'Jan Kowalski',
    ph_email:           'jan@firma.pl',
    ph_password:        'Minimum 6 znaków',
    val_username_req:   'Nazwa użytkownika jest wymagana',
    val_password_req:   'Hasło jest wymagane dla nowego użytkownika',
    err_save:           'Błąd zapisu',
    toast_updated:      'Użytkownik zaktualizowany',
    toast_created:      'Użytkownik dodany',
    confirm_deactivate: (u) => `Dezaktywować użytkownika "${u}"?`,
    toast_deactivated:  'Użytkownik dezaktywowany',
    err_deactivate:     'Błąd dezaktywacji',
    no_admin_access:    'Brak dostępu – wymagana rola admin',

    // ── Fields browser ─────────────────────────────────────────────────────
    fields_page_title:  'Pola uprawne – Biomass Explorer',
    fields_tb_title:    'Pola uprawne',
    stat_fields:        'Pola',
    stat_area:          'Łącznie ha',
    stat_owners:        'Właściciele',
    all_owners:         '— Wszyscy właściciele —',
    all_crops:          '— Wszystkie uprawy —',
    ph_search_field:    'Szukaj pola…',
    list_back:          'Lista',
    loading_fields:     'Ładowanie pól…',
    no_results:         'Brak pól spełniających kryteria',
    section_owner:      'Właściciel',
    section_crop:       'Uprawa',
    section_field_data: 'Dane pola',
    lbl_sowing:         'Data siewu',
    lbl_harvest:        'Zbiory',
    lbl_area:           'Powierzchnia',
    lbl_added:          'Dodano',
    lbl_latitude:       'Szerokość',
    lbl_longitude:      'Długość',
    legend_title:       'Właściciele',
    no_owner:           (n) => `Brak właściciela (${n})`,
    n_fields_count:     (n) => `${n} pól`,
    err_loading:        'Błąd ładowania: ',

    // ── Field editor ───────────────────────────────────────────────────────
    editor_page_title:  'Edytor pól – Biomass Explorer',
    editor_tb_new:      'Nowe pole uprawne',
    editor_tb_edit:     (name) => `Edytujesz: ${name}`,
    mode_new:           'Nowe',
    mode_edit:          'Edycja',
    section_fields_db:  'Pola w bazie',
    loading_db:         'ładowanie…',
    ph_search_fields:   'Szukaj pola…',
    new_field_btn:      'Nowe pole',
    no_fields_db:       'Brak pól w bazie. Dodaj pierwsze pole.',
    n_fields_db:        (n) => `${n} pól`,
    draw_hint_title:    'Narysuj obrys pola na mapie',
    draw_hint_text:     'Kliknij ikonę wielokąta ↑ (lewy-górny róg mapy), zaznacz wierzchołki, podwójne kliknięcie = zamknij.',
    outline_ready:      'Obrys gotowy',
    lbl_pow:            'Pow.',
    lbl_perimeter:      'Obwód',
    lbl_points:         'Punkty',
    clear_polygon:      'Usuń obrys',
    edit_mode_title:    'Tryb edycji',
    edit_mode_text:     'Istniejący obrys widoczny na mapie. Narysuj nowy wielokąt tylko jeśli chcesz go zmienić.',
    section_data:       'Dane pola',
    lbl_field_name:     'Nazwa pola *',
    lbl_notes:          'Uwagi / opis',
    ph_field_name:      'np. Łąka Wschodnia, Pole 3A…',
    ph_notes:           'Dodatkowe informacje…',
    section_owner_ed:   'Właściciel',
    lbl_owner_since:    'Właściciel od *',
    owner_since_sub:    '(data przejęcia pola)',
    section_crop_ed:    'Uprawa',
    lbl_crop_type:      'Rodzaj uprawy *',
    crop_select_default:'— wybierz —',
    new_crop_btn:       '+ Nowa',
    ph_new_crop:        'Nazwa nowej uprawy…',
    add_btn:            'Dodaj',
    lbl_sowing_ed:      'Data siewu *',
    lbl_harvest_ed:     'Data zbioru',
    save_new_btn:       'Zapisz nowe pole',
    save_edit_btn:      'Zapisz zmiany',
    saving_new:         'Zapisywanie…',
    saving_edit:        'Zapisywanie zmian…',
    status_saving_new:  'Zapisywanie nowego pola…',
    status_saving_edit: 'Aktualizowanie pola…',
    status_loading:     'Ładowanie pola…',
    val_name:           'Podaj nazwę pola.',
    val_crop:           'Wybierz rodzaj uprawy.',
    val_sowing:         'Podaj datę siewu.',
    val_polygon:        'Narysuj obrys pola na mapie.',
    val_owner_date:     'Podaj datę "właściciel od".',
    success_new:        (id, crop, area) => `✓ Pole zapisane! ID: ${id} · ${crop} · ${area} ha`,
    success_edit:       (id) => `✓ Zmiany zapisane! Pole #${id}`,
    err_save_field:     'Błąd zapisu',
    field_not_found:    'Nie znaleziono pola',
    map_tip:            'Klikaj wierzchołki pola — podwójne kliknięcie zamknie obrys',
  },

  en: {
    // ── Common ─────────────────────────────────────────────────────────────
    logout:            'Log out',
    loading:           'Loading…',
    cancel:            'Cancel',
    save:              'Save',
    saving:            'Saving…',
    edit:              'Edit',
    open:              'Open',
    back:              'Admin',
    google_maps:       'Google Maps',
    lang_pl_title:     'Zmień na polski',
    lang_en_title:     'Switch to English',

    // ── Login ──────────────────────────────────────────────────────────────
    login_page_title:  'Sign In – Biomass Explorer',
    login_subtitle:    'Admin panel',
    login_h2:          'Sign in',
    login_username:    'Username',
    login_password:    'Password',
    login_btn:         'Sign in',
    login_btn_loading: 'Signing in…',
    login_error_default: 'Invalid credentials',

    // ── Admin – layout ─────────────────────────────────────────────────────
    admin_page_title:  'Admin Panel – Biomass Explorer',
    admin_title:       'Biomass Explorer',
    admin_subtitle:    'Admin Panel',
    admin_h1:          'Admin panel',
    admin_desc:        'Manage users and cropland fields',
    tab_users:         'Users',
    tab_fields:        'Fields',

    // ── Admin – users table ────────────────────────────────────────────────
    users_card_title:  'System Users',
    add_user:          'Add User',
    th_id:             '#',
    th_username:       'Username',
    th_email:          'E-mail',
    th_fullname:       'Full Name',
    th_role:           'Role',
    th_status:         'Status',
    th_created:        'Created',
    th_actions:        'Actions',
    role_admin:        'Admin',
    role_user:         'User',
    status_active:     'Active',
    status_inactive:   'Inactive',
    deactivate:        'Deactivate',
    empty_users:       'No users found',
    n_users:           (n) => `${n} user(s)`,

    // ── Admin – fields table ───────────────────────────────────────────────
    fields_card_title: 'Cropland Fields',
    view_on_map:       'View on Map',
    draw_field:        'Draw New Field',
    th_field_id:       'ID',
    th_field_name:     'Field Name',
    th_latlng:         'Lat / Lng',
    th_area:           'Area (ha)',
    th_field_created:  'Created',
    n_fields:          (n) => `${n} field(s)`,
    empty_fields:      'No fields saved yet. Click "Draw New Field" to add the first one.',

    // ── Admin – user modal ─────────────────────────────────────────────────
    modal_new_user:     'New User',
    modal_edit_user:    'Edit User',
    lbl_username:       'Username *',
    lbl_role:           'Role',
    lbl_fullname:       'Full Name',
    lbl_email:          'E-mail',
    lbl_password_new:   'Password *',
    lbl_password_edit:  'New password (leave blank to keep unchanged)',
    opt_user:           'User',
    opt_admin:          'Administrator',
    ph_username:        'john.doe',
    ph_fullname:        'John Doe',
    ph_email:           'john@company.com',
    ph_password:        'Minimum 6 characters',
    val_username_req:   'Username is required',
    val_password_req:   'Password is required for new users',
    err_save:           'Save error',
    toast_updated:      'User updated',
    toast_created:      'User created',
    confirm_deactivate: (u) => `Deactivate user "${u}"?`,
    toast_deactivated:  'User deactivated',
    err_deactivate:     'Deactivation error',
    no_admin_access:    'Access denied – admin role required',

    // ── Fields browser ─────────────────────────────────────────────────────
    fields_page_title:  'Cropland Fields – Biomass Explorer',
    fields_tb_title:    'Cropland Fields',
    stat_fields:        'Fields',
    stat_area:          'Total ha',
    stat_owners:        'Owners',
    all_owners:         '— All owners —',
    all_crops:          '— All crops —',
    ph_search_field:    'Search field…',
    list_back:          'List',
    loading_fields:     'Loading fields…',
    no_results:         'No fields matching the criteria',
    section_owner:      'Owner',
    section_crop:       'Crop',
    section_field_data: 'Field Data',
    lbl_sowing:         'Sowing Date',
    lbl_harvest:        'Harvest',
    lbl_area:           'Area',
    lbl_added:          'Added',
    lbl_latitude:       'Latitude',
    lbl_longitude:      'Longitude',
    legend_title:       'Owners',
    no_owner:           (n) => `No owner (${n})`,
    n_fields_count:     (n) => `${n} fields`,
    err_loading:        'Load error: ',

    // ── Field editor ───────────────────────────────────────────────────────
    editor_page_title:  'Field Editor – Biomass Explorer',
    editor_tb_new:      'New Cropland',
    editor_tb_edit:     (name) => `Editing: ${name}`,
    mode_new:           'New',
    mode_edit:          'Edit',
    section_fields_db:  'Fields in DB',
    loading_db:         'loading…',
    ph_search_fields:   'Search field…',
    new_field_btn:      'New field',
    no_fields_db:       'No fields in DB. Add the first one.',
    n_fields_db:        (n) => `${n} fields`,
    draw_hint_title:    'Draw field outline on map',
    draw_hint_text:     'Click the polygon icon ↑ (top-left of map), mark vertices, double-click = close.',
    outline_ready:      'Outline ready',
    lbl_pow:            'Area',
    lbl_perimeter:      'Perimeter',
    lbl_points:         'Points',
    clear_polygon:      'Clear outline',
    edit_mode_title:    'Edit mode',
    edit_mode_text:     'Existing outline visible on map. Draw a new polygon only if you want to replace it.',
    section_data:       'Field Data',
    lbl_field_name:     'Field Name *',
    lbl_notes:          'Notes / Description',
    ph_field_name:      'e.g. East Meadow, Field 3A…',
    ph_notes:           'Additional information…',
    section_owner_ed:   'Owner',
    lbl_owner_since:    'Owner since *',
    owner_since_sub:    '(field takeover date)',
    section_crop_ed:    'Crop',
    lbl_crop_type:      'Crop Type *',
    crop_select_default:'— select —',
    new_crop_btn:       '+ New',
    ph_new_crop:        'New crop name…',
    add_btn:            'Add',
    lbl_sowing_ed:      'Sowing Date *',
    lbl_harvest_ed:     'Harvest Date',
    save_new_btn:       'Save New Field',
    save_edit_btn:      'Save Changes',
    saving_new:         'Saving…',
    saving_edit:        'Saving changes…',
    status_saving_new:  'Saving new field…',
    status_saving_edit: 'Updating field…',
    status_loading:     'Loading field…',
    val_name:           'Please enter a field name.',
    val_crop:           'Please select a crop type.',
    val_sowing:         'Please enter the sowing date.',
    val_polygon:        'Please draw the field outline on the map.',
    val_owner_date:     'Please enter the "owner since" date.',
    success_new:        (id, crop, area) => `✓ Field saved! ID: ${id} · ${crop} · ${area} ha`,
    success_edit:       (id) => `✓ Changes saved! Field #${id}`,
    err_save_field:     'Save error',
    field_not_found:    'Field not found',
    map_tip:            'Click field vertices — double-click to close the outline',
  },
};

// ── Core API ─────────────────────────────────────────────────────────────────

function getCurrentLang() {
  return localStorage.getItem('bm_lang') || 'pl';
}

/**
 * Get translated string. If the value is a function, call it with provided args.
 * Falls back to Polish, then to the key itself.
 */
function t(key, ...args) {
  const lang = getCurrentLang();
  const val = I18N[lang]?.[key] ?? I18N['pl']?.[key] ?? key;
  return typeof val === 'function' ? val(...args) : val;
}

/**
 * Apply language to the DOM and fire a 'langchange' event.
 */
function applyLang(lang) {
  if (!I18N[lang]) return;
  localStorage.setItem('bm_lang', lang);

  // Update static elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = I18N[lang][key];
    if (val !== undefined && typeof val !== 'function') el.textContent = val;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.dataset['i18n-ph'] || el.getAttribute('data-i18n-ph');
    const val = I18N[lang][key];
    if (val !== undefined && typeof val !== 'function') el.placeholder = val;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const val = I18N[lang][key];
    if (val !== undefined && typeof val !== 'function') el.title = val;
  });

  // Update page <title>
  const titleKey = document.documentElement.dataset.i18nTitle;
  if (titleKey && I18N[lang][titleKey]) document.title = I18N[lang][titleKey];

  // Update flag button states
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  // Notify page-specific JS to re-render dynamic content
  window.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

function initLang() {
  applyLang(getCurrentLang());
}

// ── Language switcher HTML helper ─────────────────────────────────────────────

function langSwitcherHTML() {
  const cur = getCurrentLang();
  return `
    <div class="lang-switch">
      <button class="lang-btn${cur==='pl'?' active':''}" data-lang="pl"
        onclick="applyLang('pl')" data-i18n-title="lang_pl_title" title="Zmień na polski">🇵🇱</button>
      <button class="lang-btn${cur==='en'?' active':''}" data-lang="en"
        onclick="applyLang('en')" data-i18n-title="lang_en_title" title="Switch to English">🇬🇧</button>
    </div>`;
}

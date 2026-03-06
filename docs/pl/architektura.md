# Architektura

## 1) Przegląd wysokopoziomowy

Biomass Explorer to aplikacja webowa FastAPI + JavaScript do monitoringu pól uprawnych na podstawie danych Google Earth Engine (GEE).

Główne możliwości:

- wybór AOI (granicy pola) z wyszukiwarki katastralnej, narzędzi mapowych lub zapisanej geometrii pola,
- analiza 15 indeksów (wegetacyjnych i termicznych),
- interaktywne nakładki mapowe oraz podgląd wartości piksela,
- zarządzanie polami (tworzenie/edycja geometrii i metadanych),
- opcjonalna persystencja wyników i historii w PostgreSQL.

## 2) Komponenty systemu

### Backend

- `main.py` - aplikacja FastAPI, routing endpointów, reguły autoryzacji i dostępu, serwowanie widoków.
- `services.py` - logika analizy, obliczanie indeksów, generowanie URL-i warstw mapowych, zapisy/odczyty historii.
- `admin_service.py` - operacje administracyjne i dane pól/użytkowników w PostgreSQL.
- `auth.py` - JWT, hasła, ładowanie kont z `users.accounts`.
- `database.py` - konfiguracja i połączenie PostgreSQL, flaga włączająca DB.
- `schemas.py` - modele żądań i odpowiedzi (Pydantic).
- `uldk.py` - integracja z usługą katastralną ULDK.

### Frontend

- `static/index.html`, `static/app.js`, `static/map.js`, `static/tools.js` - główny moduł analizy.
- `static/fields.html` - widok listy/mapy pól i szczegóły pola.
- `static/field_editor.html` - tworzenie i edycja geometrii pola.
- `static/admin.html` - panel administracyjny i zarządzanie użytkownikami.

## 3) Przepływ analizy

1. Frontend wysyła `POST /calculate/biomass` z AOI, zakresem dat i listą indeksów.
2. Backend uruchamia obliczenia indeksów przez GEE i buduje timeseries + podsumowanie.
3. Zachowanie zapisu:
   - gość: zwrot wyniku bez zapisu do DB,
   - użytkownik zalogowany (właściciel/admin): upsert do `obs.vegetation_indices`.
4. Frontend pobiera warstwy:
   - `POST /visualize/map` (pojedyncza),
   - `POST /visualize/batch` (wiele warstw naraz).

## 4) Model dostępu

- **Gość**:
  - może uruchamiać analizy,
  - nie zapisuje historii do DB.
- **Użytkownik zalogowany**:
  - zarządza własnymi polami,
  - zapisuje i odczytuje historię dla własnych pól.
- **Administrator**:
  - pełny dostęp do pól i funkcji administracyjnych.

Walidacja własności pola jest wykonywana po stronie backendu.

## 5) Model persystencji

Tabela runtime:

- `obs.vegetation_indices`

Klucz logiczny upsert:

- `(field_id, captured_at, sensor)`

Zależność:

- `field_id` powinno odnosić się do `core.fields.id`.

## 6) Notatki o UI

- widok pól (`/fields`) pokazuje metadane historii:
  - `calc_count`,
  - `last_calculated_at`,
- szczegóły pola mają rozwijalną tabelę historii (wszystkie 15 indeksów),
- `field_id` jest obsługiwane w tle na podstawie wybranego pola z DB (bez potrzeby ręcznego wpisywania ID przez użytkownika).

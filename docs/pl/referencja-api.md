# Referencja API

Przykładowy adres lokalny:

- `http://127.0.0.1:8000`

## Uwierzytelnianie

- `POST /auth/login` - logowanie JSON, zwraca token JWT.
- `POST /auth/token` - endpoint OAuth2 dla Swagger UI.
- `GET /auth/me` - dane aktualnego użytkownika.

Endpointy admin:

- `GET /admin/users`
- `POST /admin/users`
- `PUT /admin/users/{user_id}`
- `DELETE /admin/users/{user_id}`

## Analiza

### `POST /calculate/biomass`

Uruchamia analizę AOI dla wybranego zakresu dat i indeksów.

Zachowanie:

- gość: wynik analizy bez zapisu do DB,
- użytkownik zalogowany (właściciel/admin): zapis do `obs.vegetation_indices`.

### `GET /history/{field_id}`

Historia zapisanych wyników dla pola.

Zachowanie:

- gość: zwracana jest pusta lista,
- użytkownik: tylko dla własnych pól,
- admin: bez ograniczeń własności.

## Wizualizacja

- `POST /visualize/map` - pojedyncza warstwa.
- `POST /visualize/batch` - wiele warstw jednocześnie.
- `POST /api/pixel-value` - wartości indeksów dla punktu.

## ULDK (kataster)

- `GET /api/uldk/search?q=...` - wyszukiwanie działki.
- `GET /api/uldk/locate?lat=...&lng=...` - działka po współrzędnych.

## Pola (wymagane logowanie)

- `GET /api/fields/browse` - rozszerzona lista pól (właściciel/uprawa/powierzchnia/geojson/historia).
- `GET /api/fields` - lista pól (wersja kompaktowa).
- `GET /api/fields/{field_id}` - szczegóły pola.
- `POST /api/fields` - tworzenie pola.
- `PUT /api/fields/{field_id}` - edycja pola.
- `GET /api/crops` - lista upraw.
- `GET /api/owners` - lista właścicieli.

## Strony i zasoby statyczne

- `GET /` -> `static/login.html`
- `GET /app` -> główna aplikacja
- `GET /admin` -> panel administracyjny
- `GET /fields` -> mapa/lista pól
- `GET /field-editor` -> edytor pola

## Kontrakty danych

Modele wejścia/wyjścia znajdują się w `schemas.py` (Pydantic), m.in.:

- `AnalysisRequest`, `BiomassResponse`,
- `BatchLayerRequest`, `BatchLayerResponse`,
- `PixelQueryRequest`, `PixelQueryResponse`.

# Przewodnik użytkownika i administratora

## 1) Role

### Gość

- może uruchamiać analizę i przeglądać mapę,
- nie zapisuje historii analizy do DB.

### Użytkownik zalogowany

- może tworzyć i edytować własne pola,
- może zapisywać historię analiz dla własnych pól,
- może przeglądać historię zapisanych analiz.

### Administrator

- pełne możliwości użytkownika,
- zarządzanie kontami i dostęp do wszystkich pól.

## 2) Typowy przepływ użytkownika

1. Otwórz `/app`.
2. Wybierz AOI:
   - wyszukiwanie działki,
   - wskazanie na mapie,
   - własny poligon.
3. Ustaw zakres dat i indeksy.
4. Uruchom analizę.
5. Załaduj warstwy i sprawdź wartości pikseli.

Jeśli użytkownik jest zalogowany i ma dostęp do pola, wynik zostanie zapisany do PostgreSQL.

## 3) Widok pól i historia

W `/fields`:

- lista pól pokazuje m.in. `History: <count>`,
- szczegóły pola pokazują:
  - liczbę analiz,
  - datę ostatniej analizy,
  - przycisk pokazania pełnej historii.

Tabela historii pola zawiera wszystkie 15 indeksów.

## 4) Edytor pól

W `/field-editor`:

- wybierasz pole z listy,
- rysujesz/edytujesz geometrię,
- ustawiasz uprawę i daty,
- zapisujesz zmiany.

Panel boczny został poszerzony, aby poprawić czytelność listy pól.

## 5) Wskazówki diagnostyczne

Jeśli historia nie jest widoczna:

- sprawdź, czy użytkownik jest zalogowany,
- sprawdź własność pola,
- sprawdź, czy `ENABLE_DB='1'`,
- sprawdź rekordy w `obs.vegetation_indices`.

Jeśli widać licznik historii, ale tabela jest pusta:

- sprawdź odpowiedź `/history/{field_id}` dla zalogowanego użytkownika,
- potwierdź ważność tokenu i reguły dostępu.

# User and Admin Guide

## 1) User Types

### Guest

- can open the app and run map/index analysis,
- can interact with AOI tools and visualization,
- cannot persist analysis history to DB.

### Authenticated User

- can create/edit own fields and geometry,
- can persist analysis history for owned fields,
- can view per-field history in field views.

### Admin

- all user capabilities,
- user/account management,
- full visibility across fields.

## 2) Typical End-User Workflow

1. Open `/app`.
2. Select AOI:
   - parcel search,
   - map click,
   - custom polygon.
3. Choose period and indices.
4. Run analysis.
5. (Optional) Load map overlays and inspect pixels.

If logged in and field ownership is valid, analysis is persisted to DB.

## 3) Field List and History

In `/fields`:

- list rows show:
  - field metadata,
  - `History: <count>` indicator.
- field detail shows:
  - analysis count,
  - last analysis timestamp,
  - **Show calculation history** action.

History panel loads saved records for selected field and displays all 15 indices.

## 4) Field Editor

In `/field-editor`:

- select existing field from DB list,
- draw/edit polygon geometry,
- edit crop and dates,
- save updates.

The side panel is widened to support better field list readability.

## 5) Notes for Support Teams

- If user sees no history:
  - verify login state,
  - verify field ownership mapping,
  - verify `ENABLE_DB='1'`,
  - verify DB row presence in `obs.vegetation_indices`.
- If history count is visible but table empty:
  - check `/history/{field_id}` response as authenticated user,
  - confirm request token and ownership rules.

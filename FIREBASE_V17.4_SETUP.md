# v17.4 Firebase Setup

The app stores the new module under the existing database root:

- `pccSeating/v1/venues/{venueId}/dailyOperations/{YYYY-MM-DD}`
- `pccSeating/v1/venues/{venueId}/operationsSettings`
- Existing daily assignments remain under `pccSeating/v1/venues/{venueId}/staffing/{YYYY-MM-DD}`

## New limited account roles

Create Firebase Authentication users normally, then create their profile under:

`pccSeating/v1/users/{AUTH_UID}`

Use one of these roles:

- `operations_server` — read-only seating, assignments, pax form
- `line` — read-only seating, assignments, pax form, cloth form
- `gelato` — read-only seating, assignments, gelato/ice-cream form
- `dessert` — read-only seating, assignments, gelato/ice-cream form
- `inventory` — read-only seating, assignments, cloth and lei forms

Example profile:

```json
{
  "active": true,
  "displayName": "Gateway Gelato",
  "email": "gateway.gelato@pccseating.dev",
  "employeeId": "SHARED-GATEWAY-GELATO",
  "mustChangePassword": true,
  "positionLabel": "Gateway Gelato",
  "role": "gelato",
  "venueIds": {
    "gateway": true
  }
}
```

## Realtime Database rules concept

Merge this logic into your existing rules rather than replacing the complete rules file without review.

- Developers/directors/managers/leads may read and write operations settings and all daily records for authorized venues.
- Limited operational roles may read their authorized venue and write only daily operations.
- Only management roles may write staffing assignments.
- Limited operational roles must not write tables, areas, groups, servers, canvas, or venue metadata.

Recommended role groups:

```text
management: developer, admin, director, manager, assistant_manager, lead, front_lead, back_lead
operations: operations_server, line, gelato, dessert, inventory
```

Test each new account in Firebase Rules Playground before live use.

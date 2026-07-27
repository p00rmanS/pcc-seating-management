# v18.1 Firebase Setup — Employee Operations View

This release does not add new top-level Firebase paths. It changes the **shape**
of existing paths and — critically — needs new/updated **Realtime Database
rules**. Nothing below has been deployed. Merge it into your existing rules
after review, and test every role in the Firebase Rules Playground before
using it live, exactly as recommended in `FIREBASE_V17.4_SETUP.md`.

## New role

Add `employee` to the roster of roles you assign under `pccSeating/v1/users/{uid}`.
It behaves like the existing `operations_server` role (read-only seating, own
assignment, Operations access per section) but has no gelato/cloth/lei/pax
section access of its own — it exists purely for staff who only need to see
their table assignment.

Updated role groups (extends the table in `FIREBASE_V17.4_SETUP.md`):

```text
management: developer, admin, director, manager, assistant_manager, lead, front_lead, back_lead
operations: operations_server, line, gelato, dessert, inventory, employee
```

## Data shape changes

### `pccSeating/v1/venues/{venueId}/staffing/{date}/assignments/{assignmentId}`

Existing free-text fields (`assignment`, `displayName`, `active`) are still
written for backward compatibility. New fields added by the Assignment Manager:

```json
{
  "employeeUid": "fB3k...authUid...",
  "displayName": "Malia K.",
  "position": "Line",
  "assignedAreaIds": ["area-lanai", "area-lounge"],
  "assignedTableIds": ["t-14", "t-15", "t-22"],
  "notes": "Covering both stations until 6pm.",
  "active": true,
  "assignment": "Line",
  "areaName": "Line"
}
```

`employeeUid` is the **stable identifier** the employee's own client matches
against `auth.currentUser.uid` to find "my assignment" — this is what makes
the My Tables highlighting work, and why it must be a real Firebase Auth UID,
not a typed name.

### `pccSeating/v1/venues/{venueId}/dailyOperations/{date}`

Added `frozenWorkflow`:

```json
{
  "frozenWorkflow": {
    "status": "not_started",
    "submittedAt": "2026-07-26T02:10:00.000Z",
    "submittedByUid": "uid...",
    "submittedByName": "Malia K.",
    "reopenedAt": "2026-07-26T03:00:00.000Z",
    "reopenedByUid": "uid...",
    "reopenedByName": "Manager Name"
  }
}
```

`status` is one of `not_started | in_progress | submitted | reopened`.

### `pccSeating/v1/venues/{venueId}/operationsSettings/frozenItems`

Was a flat array of flavor name strings. Now an array of objects (the client
transparently upgrades old string arrays on read, so no migration is required):

```json
[
  { "id": "flavor-1", "name": "Tahitian Vanilla", "unit": "tubs", "active": true, "order": 0 },
  { "id": "flavor-2", "name": "Chocolate", "unit": "tubs", "active": true, "order": 1 }
]
```

### `pccSeating/v1/users` (read only — new list-level access)

No shape change. What's new is that **management roles now need list-read
access to the whole `users` collection**, not just their own uid, so the
Assignment Manager can present a picker of real employee accounts instead of
free-text names.

## Proposed rules

Below is the rule logic to merge into your existing tree — **not a complete,
drop-in rules file.** Adapt the helper expressions to match your current
rules' exact structure (e.g. if you already have a `management`/`operations`
role-group helper, reuse it instead of duplicating the inline checks below).

```jsonc
{
  "rules": {
    "pccSeating": {
      "v1": {

        // ---- NEW: management-only list read of all employee profiles ----
        "users": {
          ".read": "auth != null && root.child('pccSeating/v1/users').child(auth.uid).child('role').val() != null && (['developer','admin','director','manager','assistant_manager','lead','front_lead','back_lead']).indexOf(root.child('pccSeating/v1/users').child(auth.uid).child('role').val()) >= 0",
          "$uid": {
            // Existing behavior: an employee may always read/write their own profile.
            ".read": "auth != null && auth.uid === $uid",
            ".write": "auth != null && auth.uid === $uid"
          }
        },

        "venues": {
          "$venueId": {

            // ---- Seating layout: unchanged intent, employee cohort added explicitly ----
            "tables": {
              ".read": "auth != null && root.child('pccSeating/v1/users').child(auth.uid).child('venueIds').child($venueId).val() === true",
              ".write": "auth != null && (['developer','admin','director','manager','assistant_manager','lead','front_lead','back_lead']).indexOf(root.child('pccSeating/v1/users').child(auth.uid).child('role').val()) >= 0",
              "$tableId": {
                // Limited, field-specific write for non-employee floor roles
                // (server/trainer) toggling status or guest name — the
                // employee cohort (operations_server/line/gelato/dessert/
                // inventory/employee) gets NO write here at all.
                ".write": "auth != null && root.child('pccSeating/v1/users').child(auth.uid).child('venueIds').child($venueId).val() === true && (['developer','admin','director','manager','assistant_manager','lead','front_lead','back_lead','server','trainer']).indexOf(root.child('pccSeating/v1/users').child(auth.uid).child('role').val()) >= 0"
              }
            },
            "areas": { "$sameReadWriteAs": "tables" },
            "servers": { "$sameReadWriteAs": "tables" },
            "groups": { "$sameReadWriteAs": "tables" },
            "canvas": { "$sameReadWriteAs": "tables" },
            "metadata": { "$sameReadWriteAs": "tables" },

            // ---- Staffing/assignments ----
            "staffing": {
              "$date": {
                // Read: management + any active, authorized employee (needed
                // so an employee's client can find its own assignment by uid
                // and render My Tables highlighting).
                ".read": "auth != null && root.child('pccSeating/v1/users').child(auth.uid).child('active').val() === true && root.child('pccSeating/v1/users').child(auth.uid).child('venueIds').child($venueId).val() === true",
                // Write: management only, unchanged from v17.4.
                ".write": "auth != null && (['developer','admin','director','manager','assistant_manager','lead','front_lead','back_lead']).indexOf(root.child('pccSeating/v1/users').child(auth.uid).child('role').val()) >= 0"
              }
            },

            // ---- Daily operations (cloths/leis/frozen/pax) ----
            "dailyOperations": {
              "$date": {
                ".read": "auth != null && root.child('pccSeating/v1/users').child(auth.uid).child('venueIds').child($venueId).val() === true",
                // Management can always write. Gelato-cohort roles may write
                // only while the frozen breakout is not submitted — this is
                // the server-side half of the "locked after submit" rule; the
                // client already disables the UI, this is the backstop.
                //
                // KNOWN LIMITATION: because the client currently saves the
                // whole day's record with one set() (cloths+leis+frozen+pax
                // together), this rule can only gate at the whole-record
                // level, not per-section. A "line" role can technically write
                // frozen data in the same payload as a cloth count today. If
                // you need hard per-section isolation, the client would need
                // to move to per-section update() calls first — flagged here
                // rather than silently assumed away.
                ".write": "auth != null && root.child('pccSeating/v1/users').child(auth.uid).child('active').val() === true && root.child('pccSeating/v1/users').child(auth.uid).child('venueIds').child($venueId).val() === true && (((['developer','admin','director','manager','assistant_manager','lead','front_lead','back_lead']).indexOf(root.child('pccSeating/v1/users').child(auth.uid).child('role').val()) >= 0) || ((['operations_server','line','gelato','dessert','inventory','employee']).indexOf(root.child('pccSeating/v1/users').child(auth.uid).child('role').val()) >= 0 && (!data.child('frozenWorkflow').exists() || data.child('frozenWorkflow/status').val() !== 'submitted')))"
              }
            },

            // ---- Operations settings (cloth/lei items + gelato flavor config) ----
            "operationsSettings": {
              ".read": "auth != null && root.child('pccSeating/v1/users').child(auth.uid).child('venueIds').child($venueId).val() === true",
              // Flavor/cloth/lei configuration stays management-only, per spec.
              ".write": "auth != null && (['developer','admin','director','manager','assistant_manager','lead','front_lead','back_lead']).indexOf(root.child('pccSeating/v1/users').child(auth.uid).child('role').val()) >= 0"
            }
          }
        }
      }
    }
  }
}
```

Notes on the pseudo-syntax above: `"$sameReadWriteAs": "tables"` is shorthand
used only in this document — Realtime Database rules don't support that key,
so copy the actual `.read`/`.write` expressions from `tables` into `areas`,
`servers`, `groups`, `canvas`, and `metadata` when you merge this in.

## Manual setup steps

1. Create the `employee` role option wherever you provision accounts (it's
   now accepted by the app — see `SUPPORTED_ROLES` in `src/services/auth/authService.js`).
2. For each new employee account: create the Firebase Auth user, then create
   `pccSeating/v1/users/{uid}` with `role: "employee"` (or the existing
   `operations_server`/`gelato`/`dessert`/`line`/`inventory` roles) and the
   correct `venueIds`.
3. Merge the rule changes above into your live rules, adjusting expressions to
   match your existing helpers. Test in Rules Playground as:
   - An `employee` reading their own `staffing/{today}` record (should pass).
   - An `employee` attempting to write `tables/{id}` (should fail).
   - A `gelato` role writing `dailyOperations/{today}` before submission
     (should pass) and after `frozenWorkflow.status == "submitted"` (should fail).
   - A `manager` role writing `dailyOperations/{today}` after submission
     (should still pass — management can always reopen/edit).
   - A `manager` role reading the full `users` list (should pass); an
     `employee` attempting the same (should fail, falls back to their own
     `$uid` node only).
4. In the Assignment Manager (Staffing tool tab), link each assignment row to
   a real employee account via the "Employee account" picker so `employeeUid`
   is populated — free-text-only rows (no linked account) will never show a
   My Tables highlight for that person, since there's no UID to match against.

## Example records

**Employee profile** (`pccSeating/v1/users/{uid}`):

```json
{
  "active": true,
  "displayName": "Malia K.",
  "email": "malia.k@pccseating.dev",
  "employeeId": "EMP-1044",
  "mustChangePassword": true,
  "positionLabel": "Line Server",
  "role": "employee",
  "venueIds": { "ohana": true }
}
```

**Gelato daily record** (`pccSeating/v1/venues/gateway/dailyOperations/2026-07-26`,
`frozen` section only, abridged):

```json
{
  "frozen": {
    "Ube": { "opening": 4, "added": 2, "used": 3.5, "damaged": 0, "actualClosing": 2.5, "status": "1/2 Full", "notes": "" }
  },
  "frozenWorkflow": {
    "status": "submitted",
    "submittedAt": "2026-07-26T02:10:00.000Z",
    "submittedByUid": "uidGelato123",
    "submittedByName": "Malia K."
  }
}
```

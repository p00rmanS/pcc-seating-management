# Architecture & Handoff Notes

This document exists so whoever inherits this app next doesn't have to reverse-engineer
it from scratch. It covers the data model, the sync architecture (the trickiest part),
roles/permissions, deployment, and known gotchas.

## Stack

- **React 19 + Vite** — single-page app, no router (the app is one big view tree gated by state)
- **Firebase Realtime Database** (not Firestore) + **Firebase Auth** — see `src/services/firebase/firebase.js` for the project config
- **Tailwind CSS** for new components, a large hand-written `src/styles/workspace.css` for the original seating UI
- **Netlify** — deployed at `pcc-seating-management.netlify.app`, connected to this GitHub repo (`p00rmanS/pcc-seating-management`). Pushing to `main` triggers an auto-deploy.
- No router, no state management library — almost everything lives as `useState`/`useEffect` inside `src/App.jsx` (~4,900 lines). This is the single biggest source of risk in the codebase: it's one component doing an enormous amount, which makes bugs like the venue-switch one (see Known Gotchas) easy to introduce and hard to spot in review.

## Data model

Data is organized **per venue** (called a "restaurant" in the code, `restaurant.id` / `activeRid`). Each venue has:

- **tables** — position, capacity, status (available/occupied), assigned server, group membership, parent/child links for split/merged tables
- **areas** — named zones on the floor plan (e.g. "Crown", "Gardenia") with position/size/rotation, used both visually and for bulk table generation
- **servers** — the staff assignable to tables for a given venue/day
- **groups** — color-coded table groupings (e.g. for large parties spanning several tables)
- **blueprint** — an uploaded background image (floor plan trace) with opacity/visibility, used as a drawing reference when laying out tables
- **canvas settings** — width/height of the floor plan canvas
- **operations** — expected/scanned guest counts and venue capacity, used by the occupancy widgets

All of the above live in Firebase Realtime Database and sync live across every open session for a venue. Staffing assignments (`viewSettingsByRestaurant`, daily staffing) are separate, keyed by date.

## Roles & permissions

Roles (see `normalizeSnapshot` in `src/utils/localPersistence.js` for the canonical list): `server`, `lead`, `admin`, `developer`, `director`, `manager`, `assistant_manager`, `front_lead`, `back_lead`, `trainer`, plus operations-only roles: `dessert`, `gelato`, `line`, `inventory`, `operations_server`, `employee`.

Two key groupings computed in `App.jsx` (~line 2220):
- `isLeadOrAdmin` — `lead`/`admin`/`developer`/`director`/`manager`/`assistant_manager`/`front_lead`/`back_lead` — can edit the layout, move/split/merge/delete tables, manage zones/servers/groups
- `isOperationsOnly` — `dessert`/`gelato`/`line`/`inventory`/`operations_server`/`employee` — restricted to the Daily Operations workspace and "My Tables" highlighting, no layout editing

Permissions are computed once per render into a `permissions` object (`canEditLayout`, `canMoveTables`, `canManageStaffing`, etc.) and threaded down as props — there's no central permissions file, so if you add a new capability, add it to that object in `App.jsx` rather than checking `currentRole` ad hoc elsewhere.

## Sync architecture (read this before touching persistence)

This is the part most likely to bite you, so it's worth understanding fully.

1. **On load**, `loadLocalSnapshot()` (`src/utils/localPersistence.js`) reads a per-user cache from `localStorage` (key: `pcc-seating-management-user-v2:<uid>`) and renders instantly from it — this is what makes the app feel fast on reload instead of showing a blank screen while Firebase connects.
2. **Firebase then takes over.** `subscribeToAuthorizedVenues` (`src/services/firebase/realtimeSync.js`) opens a live subscription; when data arrives, it overwrites `tablesByR`/`areasByR`/etc. with the cloud version. `cloudState` moves from `"connecting"` → `"live"`.
3. **If the cloud subscription errors** (permissions, network, etc.), `cloudState` becomes `"error"` and — critically — **the app keeps showing whatever was already in state**, i.e. the local cache from step 1. As of this pass, a red banner now appears at the top of the screen whenever this happens (`.sync-error-banner` in `App.jsx`), with a Retry button. Before this fix, this failure was only a small line of text in the header — easy to miss, and it's also what likely explained a manager once describing the app as having "reverted to old data": stale local cache, silently never corrected.
4. **A 5-second local-edit grace window** (`localTableEditUntilRef`) prevents a just-made edit from being clobbered by a slightly-stale cloud echo of the previous state. If you ever see an edit "revert itself" a few seconds after making it, this is the first place to look.
5. **Legacy migration**: accounts with `lead`/`admin`/`developer`/`director`/`manager`/`assistant_manager` get a one-time migration from an old pre-multi-user storage key (`pcc-seating-management-local-v1`) if they have no per-user data yet. This exists to avoid regular server accounts silently inheriting another employee's browser data — don't remove the role restriction without understanding why it's there.

## View settings vs. session state — the venue-switch bug

Per-venue UI preferences (sidebar collapsed, inspector collapsed, "Full floor" mode, header collapsed, occupancy widget visibility) are stored in `viewSettingsByRestaurant`, persisted to the local snapshot, and correctly restored whenever you switch venues (`useEffect` on `[activeRid]` in `App.jsx`).

**Session-only UI modes** (`mobileFocusMode`, the mobile inspector/add-table popovers, "Full floor" tool/inspector drawers, Gateway greeter view) are intentionally *not* persisted — they reset to `false` on a fresh page load. Until this pass, though, they were never reset when the *venue* changed mid-session, so a mode entered on one venue (e.g. via the Gateway greeter's "locate area" action, which turns on `mobileFocusMode`) could leak into whatever venue you switched to next — hiding the header, tools sidebar, and dashboard with no obvious cause. This is fixed by resetting those modes in the same `[activeRid]` effect. If you add a new session-only UI mode in the future, add its reset there too.

## Resilience additions (this pass)

- **`src/components/ErrorBoundary.jsx`**, wrapping `<App/>` in `main.jsx`: catches render errors and shows a "Reload App" screen instead of a blank white page. This app has hit two separate crash-to-white-screen bugs in production (v18.9's area-shortcut ordering bug, and the venue-switch issue above) — this won't prevent the next bug, but it stops the next one from being a hard outage.
- **Cloud sync error banner** — see step 3 above.
- **Code-splitting**: `VenueDesignerPanel`, `DailyStaffingPanel`, `HelpPanel`, `DailyOperationsHub`, and `TestingPanel` are now `React.lazy()`-loaded instead of bundled eagerly, since most staff sessions never open them. Shaved the initial JS bundle from ~740KB to ~644KB. The remaining bundle is still large — `App.jsx` itself, plus Firebase and Lucide icons, account for most of it. A deeper fix would mean splitting `App.jsx` into smaller components, which is a much bigger, riskier project.
- **Tests**: `npm test` runs Vitest against `src/utils/localPersistence.js` (the persistence layer described above) — the one piece of logic with the clearest input/output contract and the most direct link to real bugs seen so far. The rest of the app's logic lives inside the `App.jsx` monolith and isn't unit-testable without extracting it into smaller, pure functions first.

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build       # production build to dist/
npm test            # run the Vitest suite once
npm run test:watch  # Vitest in watch mode
npm run lint         # ESLint
```

Logging in requires a real Firebase account provisioned by an admin — there's no local/mock auth mode.

## If something breaks in production

1. Check the `cloudState` indicator in the header (or the new red banner) — if it says sync failed, that's almost always the root cause of "the data looks wrong" reports.
2. Check whether the issue is data (wrong tables/areas) or view state (missing header/sidebar/dashboard) — they have completely different causes (see above). A quick "Exit" click on the floating mobile/full-floor toolbar, or a hard refresh, resolves most view-state issues instantly.
3. The browser console will now show a caught error (with component stack) if the Error Boundary fired, instead of just a blank page — check there first for any new white-screen report.

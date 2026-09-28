# Loading Dock Runner

Mobile-first web app for **TimeSnap** (HR truck driver, BevChain, Brisbane SEQ). It combines
[Loading Zone Routes](https://timesnapx.github.io/loading-zone-routes/) (151 Liquorland SEQ stores, dock notes, your GPS pins)
with [Run Tracker](https://timesnapx.github.io/run-tracker/) (live GPS tracking), adapted for driving.

Live: https://timesnapx.github.io/loading-dock-runner/

## Tabs

- **Stores**: all Loading Zone Routes features. Liquorland only / region chips / search / Nearest, map + list,
  store detail with dock notes, best park-up, **Get there** (Google Maps), personal notes, custom stores,
  and the GPS pins (Set dock / park-up location by paste, photo EXIF or my location, with a draggable pin).
- **Home depot**: **Depot - Eagle Farm** (51 Clyde Gessel Pl, Eagle Farm QLD 4009, BevChain / Linfox), id `depot-eagle-farm`,
  store pin -27.422364, 153.091497 (OSM "BEVCHAIN" warehouse, way 1361911170). It has a 🏭 Depot badge, an orange 🏭 marker on
  the Stores and Track maps, and is **always first** in the Stores list whatever the filters, search or Nearest sort. It can be picked
  with Arrive on Track, and Get there / Set dock / Set park-up work the same as for stores.
- **Track**: Start trip, live route on the same map with the stores, time / km / avg km/h / current km/h
  (pace in min/km is optional). **Arrive at <nearest store>** logs the time; you can also pick another nearby store and undo.
  Pause / Resume / End trip (Save trip, Keep going, Discard trip).
- **History**: trips saved on the phone, with their stops. Trip detail has a map with numbered stops, GPX download
  (stops included as waypoints), rename and delete. There is also a trips backup download and import (file or paste; Run Tracker backups work too).
- **My pins**: Copy my pins, Download pins JSON, Import pasted pins, Import from file, the list of saved pins,
  and **Import from my other apps**.

## Background / screen-off behaviour (a web app can only do so much)

Browsers get no GPS while the phone is locked or the app is in the background. To work around that:
- **Keep screen on** (default on): a screen Wake Lock is held while tracking and taken again whenever the page becomes visible.
- **Pocket mode**: a black full-screen overlay, so the screen stays on with no glare. Tap and hold for 1.5 s to exit.
- The in-progress trip is saved to storage on **every accepted GPS point**, plus every 5 s and when the page is hidden.
- **Auto-resume**: if the app is closed or killed mid-trip and reopened within 12 h, the trip continues automatically.
  After 12 h it is offered as Resume / Save / Discard instead.
- **GPS gaps**: if no fix arrives for more than 20 s, the next good fix is joined by a **dashed straight line**. That distance
  is added to the trip but marked as estimated ("incl. X est." on Track, with a note on the trip detail).
- A banner is shown while tracking: "Keep this screen on. Locking the phone pauses GPS."

## Storage (all `ldr-` keys, localStorage)

`ldr-pin-overrides`, `ldr-custom-zones`, `ldr-zone-notes`, `ldr-zone-edits`, `ldr-trips-v1`, `ldr-live-trip-v1`,
`ldr-settings-v1`, `ldr-imported-from-apps`.

All apps on `timesnapx.github.io` share one localStorage. **Import from my other apps** reads `lzr-pin-overrides`,
`lzr-custom-zones`, `lzr-zone-notes` and `lzr-zone-edits` (Loading Zone Routes), plus `rt.runs.v1` (Run Tracker), and copies them into
the `ldr-` keys. Pins merge so that the newer one wins, and duplicate runs are skipped. The originals are never changed or deleted.

## PWA

Manifest "Loading Dock Runner". The service worker is `/loading-dock-runner/sw.js` with scope `/loading-dock-runner/` only,
so it never controls the other apps on the origin.

## Dev

```bash
npm install
npm run dev
npm test        # vitest unit tests (recorder, gaps, storage, import)
npm run build   # -> dist/ (published to gh-pages)
```

The e2e test (Playwright, mocked geolocation) is at `/workspace/tools/ldr-e2e.mjs` on the build box.

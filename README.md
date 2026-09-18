# stud

Chrome extension. You name the work. In study mode, Jev scores each open tab. Code keeps an allow list and covers the rest.

## How a session goes

![Four steps: save a key, set context, watch the allow list, then a gate on off-list tabs](docs/readme/session-flow.png)

## In use

![stud overlay on minecraft.net during a linear algebra session](docs/readme/overlay.png)

![stud popup in study mode with open tabs marked review, blocked, and allowed](docs/readme/popup.png)

## Load

1. `npm install && npm run build`
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → `.output/chrome-mv3`
3. Paste a TypeSafe API key, set context, switch to **study**

`npm run dev` for live reload on the same unpacked path.

## Decisions

One TypeSafe request per batch. Three nouls per tab: relevant to the work, distraction, general work tool. `lib/compose.ts` maps those to allow, block, or hold.

Noul near 0.5 is hold. A work tool can allow a whole host. A YouTube lecture is cached as that URL.

Pin hosts in the popup. Thresholds live in `lib/defaults.ts`. The API key stays in `chrome.storage.local` on this device.

## Stack

Manifest V3, WXT, React, TypeScript. `POST https://api.typesafe.ai/v1/systemone` with `jev-latest`.

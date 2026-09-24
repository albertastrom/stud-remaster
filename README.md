# stud

Chrome extension. You name the work. In study mode, Jev scores each open tab. Code keeps an allow list and covers the rest.

## Load

1. `npm install && npm run build`
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → `.output/chrome-mv3`
3. Paste a TypeSafe API key, set context, switch to **study**

`npm run dev` for live reload on the same unpacked path.

## Decisions

One TypeSafe request per batch. Three nouls per tab: relevant to the work, distraction, general work tool. `lib/compose.ts` maps those to allow, block, or hold.

Noul near 0.5 is hold. A work tool allows its whole host. Everything else caches per URL, so a lecture on YouTube can pass while the feed stays blocked.

On a gated page, **back to work** closes it and jumps to your last allowed tab. Pin hosts from the overlay or the popup. Thresholds live in `lib/defaults.ts`. The API key stays in `chrome.storage.local` on this device.

## Stack

Manifest V3, WXT, React, TypeScript. `POST https://api.typesafe.ai/v1/systemone` with `jev-latest`.

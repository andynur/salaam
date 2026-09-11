---
name: browser-qa
description: Run a real-browser smoke test of SALAAM screens with headless Chrome over the DevTools protocol against a disposable QA database. Use to verify new or changed UI flows, responsive layout at 1440, 820, and 390 px, and keyboard or drag interactions before closing a phase.
---

# Browser QA smoke run

Playwright and Puppeteer are not installed; don't add them. Drive Google Chrome over the
DevTools protocol from a throwaway Bun script kept outside the repository, in a scratch or
temp directory. If Chrome or local PostgreSQL is unavailable, say so and don't claim
browser checks.

## Setup

1. Run `bun run build`.
2. Create a QA database with `createdb salaam_qa_<suffix>` and migrate it:
   `DATABASE_URL=postgres://localhost:5432/<db> APP_BASE_URL=http://localhost:3100 STORAGE_ROOT=<tmp>/storage bun run db:migrate`.
3. Seed from the script by importing repository functions by absolute path: `bootstrapAdmin`
   and `createUser` from `src/modules/users/service.ts`, `createAcademic` from
   `src/modules/academic/service.ts`. Create learning content through the running API as the
   teacher. Every non-GET request needs `Origin: http://localhost:3100`.
4. Start `bun <repo>/dist/server.js` with `NODE_ENV=test`, `PORT=3100`,
   `APP_BASE_URL=http://localhost:3100`, `DATABASE_URL`, `STORAGE_ROOT`, **and `USER` and
   `HOME`**. Without `USER`, Bun.SQL cannot authenticate to local PostgreSQL and
   `/health/ready` returns 503. Use a working directory without `.env`, because Bun loads it
   automatically. Wait until `/health/ready` returns 200.
5. Launch
   `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=<port> --user-data-dir=<tmp>/profile`,
   open a page target, and connect to its `webSocketDebuggerUrl`.

## Driving pages

- Sign in by POSTing `/api/auth/login` with `Origin`, then call `Network.setCookie` with the
  session cookie before `Page.navigate`.
- Poll with `Runtime.evaluate` and wrap every expression in `!!(...)`. Returning a DOM node
  with `returnByValue` fails with "Object reference chain is too long".
- Read text with `document.body.textContent`, not `innerText`; CSS `text-transform` changes
  `innerText`.
- File inputs: `DOM.getDocument`, `DOM.querySelector`, then `DOM.setFileInputFiles` with a
  real file path.
- React-controlled selects: call the native `value` setter, then dispatch a bubbling
  `change` event.
- Set `window.confirm = () => true` again after every navigation.
- Drag and drop: dispatch `dragstart`, `dragover`, and `drop` `DragEvent`s that share one
  `new DataTransfer()`, pausing about 80 ms after `dragstart`.
- Keyboard paths: use the button alternative and check where focus lands, as `DESIGN.md`
  describes.

## Checks to record

- Each flow step as a named pass or fail check, for every role involved.
- For each page at 1440, 820, and 390 px (`Emulation.setDeviceMetricsOverride`):
  `document.documentElement.scrollWidth > document.documentElement.clientWidth` must be
  false, and no unexpected `[role=alert]` may appear.
- `Page.captureScreenshot` of new screens at desktop and phone widths; inspect the images.
- Write results to a JSON file and read it back, because long stdout gets truncated.
  Report "N of N checks passed" in the phase record.

## Cleanup

Stop the server and Chrome, `dropdb` the QA database, and delete the Chrome profile, the
storage directory, generated credentials, and the script.

# Sharp UI screenshots (Web Console and other browser UIs)

How to capture screenshots of a browser UI that stay sharp on a retina
screen, for blog posts and docs alike. The driver script `cdp-shot.mjs` sits
next to this file.

## Why screenshots come out blurry

Two things make a screenshot blurry, and either one is enough:

1. **It was captured at 1x.** A browser-automation screenshot (the Claude in
   Chrome `screenshot` action, or a window on a non-retina monitor) is 1x, and
   the extension also downscales and saves it as JPEG. Text then gets
   upscaled on every retina screen. Converting that JPEG to WebP adds a
   second lossy step.
2. **It shows too wide a window.** A 1500 CSS px console shown in a column
   880 px wide is shrunk to 58%, so its text ends up at about 7 px.

Rule of thumb: the image must be at least **twice the width it is displayed
at** (the blog column is 880 CSS px and docs screenshots usually render with
`width={800}`, so 1600 to 1760 px or more), captured as PNG, and kept lossless
until the final WebP.

## What does not work

- **The Claude in Chrome screenshot action.** It saves downscaled 1x JPEGs.
  While the extension controls a tab, Chrome also shows a "started debugging
  this browser" bar and an overlay on that window, so an OS screenshot of the
  user's window includes them.
- **macOS `screencapture` from the shell.** It needs Screen Recording
  permission for the terminal. Don't change that setting; use headless
  Chrome instead.
- **Asking the user to move windows or take the shots.** Headless Chrome needs
  nothing from them.

## The workflow: headless Chrome at 2x over CDP

1. **Start a headless Chrome with a throwaway profile** (command at the top of
   `cdp-shot.mjs`). Device metrics are overridden to `deviceScaleFactor: 2`,
   so a 1512 CSS px viewport captures at 3024 px, independent of any monitor.

2. **Open the page** with `node cdp-shot.mjs nav <url>`.

3. **Bring over browser-local state.** Web Console notebooks live in the
   browser's IndexedDB (database `web-console`, store `buffers`), per origin.
   A fresh profile has none. Export the records from the browser that has
   them, by reading `buffers` with `getAll()` in a tab on the same origin
   (records with a `notebookViewState` are notebooks). Then, at the same
   origin in headless Chrome, run `node cdp-shot.mjs inject export.json` and
   navigate again so the console picks them up. Exported notebooks are worth
   keeping anyway: they are the reproducible record of what an agent built.

4. **Open the notebook and run it.** Query results are not part of the
   record, so table cells show their SQL until they run. The notebook's
   refresh button only re-runs charts. Run every cell:

   ```bash
   node cdp-shot.mjs eval "(async () => {
     const bs = [...document.querySelectorAll('button[aria-label=\"Run cell\"]')];
     for (const b of bs) { b.click(); await new Promise(r => setTimeout(r, 4000)) }
     return bs.length })()"
   ```

5. **Clean the frame.** Dismiss what isn't the subject: the
   `vm.max_map_count` warning banner, the "Work with your coding agent via
   MCP" promo card, and the schema side panel. Use real clicks
   (`cdp-shot.mjs click x y`); a DOM `.click()` on a console tab doesn't
   switch tabs. Dismissing a banner moves everything below it, so take a
   fresh shot before computing the next click position.

6. **Frame by element, not by guesswork.** Measure panels with
   `getBoundingClientRect()`, scroll the panel into view with
   `scrollIntoView({ block: 'start' })`, then nudge the scrolling container
   back a little for margin. Raise `VH` until the panels you want fit, and
   crop with the `shot` clip (`shot out.png 0 0 1512 940`). Keep the same `VW`
   and `VH` for the measuring step and the shot, because each command
   re-applies the viewport.

7. **Showing "MCP connected" in the status bar.** Start an MCP session for
   that console origin and call `get_pairing_credentials` with
   `auto_open_browser: false`; otherwise the server opens the deep link in the
   user's default browser. Open the deep link in headless Chrome, click
   **Connect** with the permission the story needs, and stop the session after
   the shot.

8. **Encode and check.** Encode UI screenshots as lossless WebP, which for flat
   UI is both the best quality and the smallest file (q92 lossy came out
   about twice the size):

   ```bash
   cwebp -lossless -z 9 -mt shot.png -o image.webp
   sips -g pixelWidth -g pixelHeight image.webp   # expect >= 2x display width
   ```

   Then read the image back and check that the text is crisp, the panels
   have finished loading, and nothing is half-rendered.

Keep the source PNGs out of the repo; commit only the WebP.

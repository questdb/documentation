// Drive a headless Chrome over CDP to capture sharp 2x UI screenshots.
// No npm dependencies: Node 22+ (global WebSocket and fetch).
//
// Start Chrome first, with a throwaway profile:
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     --headless=new --remote-debugging-port=9333 \
//     --user-data-dir="$TMPDIR/shot-profile" --hide-scrollbars \
//     --no-first-run --no-default-browser-check about:blank
//
// Commands (VW/VH env vars set the viewport in CSS px, default 1512x860):
//   node cdp-shot.mjs nav <url>                 navigate, wait WAIT ms (5000)
//   node cdp-shot.mjs eval <js-expression>      print the JSON result
//   node cdp-shot.mjs evalfile <file.js>
//   node cdp-shot.mjs click <x> <y> [<x> <y>..] real mouse clicks, CSS px
//   node cdp-shot.mjs inject <export.json>      load Web Console notebooks
//   node cdp-shot.mjs shot <out.png> [x y w h]  PNG at 2x, optional CSS clip
//
// Every command reconnects and re-applies the 2x device metrics, so keep VW
// and VH the same between a layout step and the shot that follows it.
import fs from "node:fs"

const PORT = process.env.CDP_PORT || 9333
const [cmd, ...args] = process.argv.slice(2)
const base = `http://127.0.0.1:${PORT}`
const targets = await (await fetch(`${base}/json/list`)).json()
let page = targets.find((t) => t.type === "page")
if (!page) page = await (await fetch(`${base}/json/new?about:blank`, { method: "PUT" })).json()

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener("open", r, { once: true }))
let seq = 0
const pending = new Map()
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)))
    ws.send(JSON.stringify({ id, method, params }))
  })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}

await send("Emulation.setDeviceMetricsOverride", {
  width: Number(process.env.VW || 1512),
  height: Number(process.env.VH || 860),
  deviceScaleFactor: 2,
  mobile: false,
})

if (cmd === "nav") {
  await send("Page.enable")
  await send("Page.navigate", { url: args[0] })
  await sleep(Number(process.env.WAIT || 5000))
  console.log(await evaluate("document.title + ' ' + location.href"))
} else if (cmd === "eval") {
  console.log(JSON.stringify(await evaluate(args.join(" ")), null, 1))
} else if (cmd === "evalfile") {
  console.log(JSON.stringify(await evaluate(fs.readFileSync(args[0], "utf8")), null, 1))
} else if (cmd === "click") {
  for (let i = 0; i < args.length; i += 2) {
    for (const type of ["mousePressed", "mouseReleased"])
      await send("Input.dispatchMouseEvent", { type, x: +args[i], y: +args[i + 1], button: "left", clickCount: 1 })
    await sleep(Number(process.env.WAIT || 800))
  }
  console.log("clicked")
} else if (cmd === "inject") {
  // Accepts an array of `buffers` records, or { notebooks: [...] }.
  const data = JSON.parse(fs.readFileSync(args[0], "utf8"))
  const recs = Array.isArray(data) ? data : data.notebooks
  console.log(
    JSON.stringify(
      await evaluate(`(async () => {
        const recs = ${JSON.stringify(recs)};
        const db = await new Promise((res, rej) => {
          const r = indexedDB.open('web-console');
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        const tx = db.transaction('buffers', 'readwrite');
        for (const rec of recs) tx.objectStore('buffers').put(rec);
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
        db.close();
        return recs.map((r) => r.label);
      })()`),
    ),
  )
} else if (cmd === "shot") {
  const [out, x, y, w, h] = args
  const params = { format: "png" }
  if (w) params.clip = { x: +x, y: +y, width: +w, height: +h, scale: 1 }
  const r = await send("Page.captureScreenshot", params)
  fs.writeFileSync(out, Buffer.from(r.data, "base64"))
  console.log("saved", out)
} else {
  console.error("unknown command:", cmd)
  process.exitCode = 1
}
ws.close()

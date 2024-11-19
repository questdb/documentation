/*
 * This plugin adds additional styling to allow clicking through webpack debug iframe.
 *
 * That iframe appears in development mode (`yarn start`) after a change in code causes a hot reload.
 * Iframe is shown above the whole website, making it impossible to click on anything.
 * To workaround, developers while working often add the following code to `../../src/css/_global.css`:
 *
 * ```
 * iframe { pointer-events: none; }
 * ```
 *
 * This sometimes can be accidentally committed and published to production.
 * This plugin makes this automatic, preventing possible mistake.
 */

const path = require("path")

module.exports = () => {
  return {
    name: "click-through-debug-iframe",
    getClientModules() {
      return [path.resolve(__dirname, "style.css")]
    },
  }
}

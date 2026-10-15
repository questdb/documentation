const assert = require("node:assert/strict")
const { EventEmitter } = require("node:events")
const fs = require("node:fs")
const { createRequire } = require("node:module")
const path = require("node:path")
const test = require("node:test")
const vm = require("node:vm")

// Exercise the real converter without fetching release data over the network.
function loadConverter() {
  const filename = path.join(__dirname, "convert-components.js")
  const localRequire = createRequire(filename)
  const https = {
    get(_url, _options, callback) {
      const request = new EventEmitter()
      queueMicrotask(() => {
        const response = new EventEmitter()
        callback(response)
        response.emit("data", JSON.stringify({ tag_name: "v1.3.10" }))
        response.emit("end")
      })
      return request
    },
  }
  const module = { exports: {} }
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module,
      exports: module.exports,
      require: (id) => (id === "https" ? https : localRequire(id)),
      console,
    },
    { filename },
  )
  return module.exports
}

test("OIDC raw Markdown preserves usable legacy provider-step links", async () => {
  const { convertAllComponents, removeImports, normalizeNewLines } =
    loadConverter()
  const docsRoot = path.resolve(__dirname, "../../documentation")
  const filename = path.join(docsRoot, "security/oidc/index.mdx")
  const converted = normalizeNewLines(
    removeImports(
      await convertAllComponents(
        fs.readFileSync(filename, "utf8"),
        path.dirname(filename),
        docsRoot,
      ),
    ),
  )
  const anchors = new Map()
  for (const [, attributes, label] of converted.matchAll(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/g,
  )) {
    const id = attributes.match(/\bid="([^"]+)"/)?.[1]
    const href = attributes.match(/\bhref="([^"]+)"/)?.[1]
    if (id) {
      assert.ok(label.trim(), `link label for ${id}`)
      assert.ok(!anchors.has(id), `unique legacy anchor ${id}`)
      anchors.set(id, href)
    }
  }

  const providerSteps = {
    "entra-id": [
      "set-up-the-client-application-in-entra-id",
      "questdb-configuration",
      "map-groups-and-grant-permissions",
      "confirm-group-mappings-and-login",
    ],
    pingfederate: [
      "set-up-pingfederate-client",
      "access-token-manager-settings",
      "authorization-server-settings",
      "set-up-a-microsoft-entra-id-data-source",
      "set-up-a-password-credential-validator",
      "set-up-an-identity-provider",
      "add-groups-to-oidc-policy-management",
      "enable-resource-owner-password-credentials-ropc-flow",
      "confirm-questdb-mappings-and-login",
    ],
  }
  for (const [provider, steps] of Object.entries(providerSteps)) {
    for (const id of steps) {
      assert.equal(
        anchors.get(id),
        `/docs/security/oidc/${provider}/#${id}`,
        `legacy anchor ${id} links to the provider setup step`,
      )
    }
  }
  assert.doesNotMatch(converted, /<\/?Link\b/)
})

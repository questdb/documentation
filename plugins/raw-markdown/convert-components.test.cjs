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

test("nested dependency tabs preserve the surrounding heading hierarchy", async () => {
  const { convertAllComponents, normalizeNewLines } = loadConverter()
  const source = `### Request a token

#### With the Java client

<Tabs values={[{ label: "Maven", value: "maven" }, { label: "Gradle", value: "gradle" }]}>
  <TabItem value="maven">

\`\`\`xml
<dependency>questdb-client-azure</dependency>
\`\`\`

  </TabItem>
  <TabItem value="gradle">

\`\`\`text
implementation 'org.questdb:questdb-client-azure:1.3.10'
\`\`\`

  </TabItem>
</Tabs>

Java ingestion instructions.

#### With the Python client

Python ingestion instructions.
`
  const docsRoot = path.resolve(__dirname, "../../documentation")
  const converted = normalizeNewLines(
    await convertAllComponents(source, docsRoot, docsRoot),
  )
  assert.deepEqual(converted.match(/^#{1,6} .+$/gm), [
    "### Request a token",
    "#### With the Java client",
    "#### With the Python client",
  ])
  assert.match(
    converted,
    /\*\*Maven\*\*\s+```xml\n<dependency>questdb-client-azure<\/dependency>\n```/,
  )
  assert.match(
    converted,
    /\*\*Gradle\*\*\s+```text\nimplementation 'org.questdb:questdb-client-azure:1\.3\.10'\n```/,
  )
  assert.match(converted, /Java ingestion instructions\./)
  assert.match(converted, /Python ingestion instructions\./)
  assert.doesNotMatch(converted, /<\/?(?:Tabs|TabItem)\b/)
})

for (const page of ["security/oidc/entra-id.mdx", "connect/clients/java.md"]) {
  test(`${page} keeps dependency labels out of its Markdown outline`, async () => {
    const { convertAllComponents } = loadConverter()
    const docsRoot = path.resolve(__dirname, "../../documentation")
    const filename = path.join(docsRoot, page)
    const source = fs.readFileSync(filename, "utf8")
    const converted = await convertAllComponents(
      source,
      path.dirname(filename),
      docsRoot,
    )
    assert.deepEqual(
      converted.match(/^#{1,6} .+$/gm),
      source.match(/^#{1,6} .+$/gm),
    )
    assert.match(converted, /\*\*Maven\*\*/)
    assert.match(converted, /\*\*Gradle\*\*/)
    assert.match(converted, /<artifactId>questdb-client-azure<\/artifactId>/)
    assert.match(converted, /<version>1\.3\.10<\/version>/)
    assert.doesNotMatch(converted, /\$\{release\.name\}|<\/?(?:Tabs|TabItem)\b/)
  })
}

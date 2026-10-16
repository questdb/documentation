const assert = require("node:assert/strict")
const { EventEmitter } = require("node:events")
const fs = require("node:fs")
const { createRequire } = require("node:module")
const path = require("node:path")
const test = require("node:test")
const vm = require("node:vm")
const ts = require("typescript")
const { resolveJavaClientVersion } = require("../../shared/java-client-version")

const root = path.resolve(__dirname, "../..")
const minimum = "1.3.10"

// Load the actual plugin/converter with isolated HTTP mocks, without network I/O.
function loadModule(relativePath, mocks = {}, globals = {}) {
  const filename = path.join(root, relativePath)
  const localRequire = createRequire(filename)
  const source = fs.readFileSync(filename, "utf8")
  const code = filename.endsWith(".ts")
    ? ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      }).outputText
    : source
  const module = { exports: {} }
  vm.runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      __dirname: path.dirname(filename),
      require: (id) =>
        Object.hasOwn(mocks, id) ? mocks[id] : localRequire(id),
      console: { error() {}, warn() {} },
      ...globals,
    },
    { filename },
  )
  return module.exports
}

test("release tags resolve to stable versions at or above the minimum", () => {
  const cases = [
    [undefined, minimum],
    [null, minimum],
    [42, minimum],
    ["", minimum],
    ["latest", minimum],
    ["invalid", minimum],
    ["v1.0.1", minimum],
    ["1.3.8", minimum],
    ["1.3.9", minimum],
    ["1.3.10", minimum],
    ["v1.3.10", minimum],
    ["v1.3.11", "1.3.11"],
    ["1.4.0", "1.4.0"],
    ["v1.10.0", "1.10.0"],
    ["2.0.0", "2.0.0"],
    ["v1.3.10-rc.1", minimum],
    ["v2.0.0-SNAPSHOT", minimum],
  ]
  for (const [tag, expected] of cases) {
    assert.equal(resolveJavaClientVersion(tag), expected, `tag: ${tag}`)
  }
})

const response = (body) => ({ ok: true, json: async () => body })
const scenarios = [
  ["older release", async () => response({ tag_name: "v1.3.8" }), minimum],
  ["minimum release", async () => response({ tag_name: "v1.3.10" }), minimum],
  ["newer release", async () => response({ tag_name: "v1.3.11" }), "1.3.11"],
  ["missing tag", async () => response({}), minimum],
  ["invalid tag", async () => response({ tag_name: 42 }), minimum],
  [
    "prerelease tag",
    async () => response({ tag_name: "v2.0.0-rc.1" }),
    minimum,
  ],
  ["HTTP failure", async () => ({ ok: false, status: 503 }), minimum],
  [
    "network failure",
    async () => {
      throw new Error("offline")
    },
    minimum,
  ],
  [
    "malformed JSON",
    async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("invalid JSON")
      },
    }),
    minimum,
  ],
]

for (const nativeFetch of [true, false]) {
  for (const [label, fetchStub, expected] of scenarios) {
    test(`HTML plugin (${nativeFetch ? "native fetch" : "node-fetch"}): ${label}`, async () => {
      const { default: plugin } = loadModule(
        "plugins/fetch-java-client-release/index.ts",
        { "node-fetch": fetchStub },
        { fetch: nativeFetch ? fetchStub : undefined },
      )
      const instance = plugin()
      const content = await instance.loadContent()
      assert.equal(content.name, expected)
      let published
      await instance.contentLoaded({
        content,
        actions: {
          setGlobalData: (data) => {
            published = data
          },
        },
      })
      assert.equal(published.release.name, expected)
    })
  }
}

for (const [label, tag, expected] of [
  ["older release", "v1.3.8", minimum],
  ["minimum release", "v1.3.10", minimum],
  ["newer release", "v1.3.11", "1.3.11"],
  ["missing tag", undefined, minimum],
  ["network failure", null, minimum],
]) {
  test(`raw Markdown keeps core and Azure dependencies aligned: ${label}`, async () => {
    const https = {
      get(_url, _options, callback) {
        const request = new EventEmitter()
        queueMicrotask(() => {
          if (tag === null) {
            request.emit("error", new Error("offline"))
          } else {
            const res = new EventEmitter()
            callback(res)
            res.emit("data", JSON.stringify({ tag_name: tag }))
            res.emit("end")
          }
        })
        return request
      },
    }
    const { convertAllComponents } = loadModule(
      "plugins/raw-markdown/convert-components.js",
      { https },
    )
    const filename = path.join(root, "documentation/connect/clients/java.md")
    const converted = await convertAllComponents(
      fs.readFileSync(filename, "utf8"),
      path.dirname(filename),
      path.join(root, "documentation"),
    )
    const versions = [
      ...converted.matchAll(/<version>([^<]+)<\/version>/g),
    ].map((match) => match[1])
    assert.deepEqual(versions, [expected, expected])
    for (const artifact of ["questdb-client", "questdb-client-azure"]) {
      assert.ok(converted.includes(`org.questdb:${artifact}:${expected}`))
    }
    assert.ok(!converted.includes("${release.name}"))
  })
}

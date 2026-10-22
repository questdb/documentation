// Run with: node --test scripts/test-release-fallback.cjs
const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { resolve } = require("node:path")
const { test } = require("node:test")
const { runInNewContext } = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

// Load the TypeScript modules with Docusaurus hooks replaced for server rendering.
function loadModule(path, mocks = {}, globals = {}) {
  const { outputText } = ts.transpileModule(
    readFileSync(resolve(__dirname, "..", path), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    },
  )
  const module = { exports: {} }
  runInNewContext(outputText, {
    module,
    exports: module.exports,
    require: (name) =>
      Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    console: { error() {} },
    ...globals,
  })
  return module.exports
}

const { getAssets } = loadModule("src/utils/get-assets.ts")
const platforms = [
  { label: "Linux", value: "linux" },
  { label: "Windows", value: "windows" },
  { label: "Any (no JVM)", value: "noJre" },
]

function renderPlatforms(release) {
  const { TabsPlatforms } = loadModule("src/modules/TabsPlatforms.tsx", {
    "../utils/get-assets": { getAssets },
    "@docusaurus/useGlobalData": { usePluginData: () => ({ release }) },
    "@theme/Tabs": ({ defaultValue, children }) => {
      assert.ok(React.Children.count(children) > 0)
      return React.createElement(
        "div",
        { "data-default-value": defaultValue },
        children,
      )
    },
    "@theme/TabItem": ({ children }) => children,
  })
  return renderToStaticMarkup(
    React.createElement(TabsPlatforms, {
      platforms,
      render: ({ href, platform }) =>
        React.createElement("a", { href }, platform),
    }),
  )
}

for (const transport of ["native", "node-fetch"]) {
  for (const failure of ["network", "http", "json"]) {
    test(`renders a release link after ${transport} ${failure} failure`, async () => {
      const fetch = async () => {
        if (failure === "network") throw new Error("Network unavailable")
        return {
          ok: failure !== "http",
          status: failure === "http" ? 503 : 200,
          json: async () => {
            throw new SyntaxError("Unexpected end of JSON input")
          },
        }
      }
      const { fetchLatestRelease } = loadModule(
        "plugins/fetch-latest-release/index.ts",
        { "node-fetch": fetch },
        { fetch: transport === "native" ? fetch : undefined },
      )
      const release = await fetchLatestRelease()
      assert.equal(release.name, "latest")
      const html = renderPlatforms(release)
      assert.ok(
        html.includes(
          'href="https://github.com/questdb/questdb/releases/latest"',
        ),
      )
      assert.ok(html.includes("QuestDB release page"))
      assert.ok(!html.includes("data-default-value"))
    })
  }
}

test("renders an empty asset list as a release link", () => {
  const html = renderPlatforms({ name: "latest", assets: [] })
  assert.ok(html.includes("QuestDB release page"))
})

test("keeps downloads working and selects an available platform", () => {
  const html = renderPlatforms({
    name: "10.0.2",
    assets: [
      {
        name: "questdb-10.0.2-linux.tar.gz",
        browser_download_url: "https://example.com/questdb-linux.tar.gz",
        size: 1_000_000,
      },
    ],
  })
  assert.ok(html.includes('data-default-value="linux"'))
  assert.ok(html.includes('href="https://example.com/questdb-linux.tar.gz"'))
})

const assert = require("node:assert/strict")
const test = require("node:test")
const { processForLlmsTxt } = require("./generate-llms-files")
const { docs } = require("../documentation/sidebars")

const overviewId = "security/oidc/index"
const overviewUrl = "https://questdb.com/docs/security/oidc.md"

// A reference has the same metadata and canonical URL as a normal doc entry.
test("doc references preserve labels, descriptions, and custom slugs", () => {
  const entry = { id: overviewId, label: "Overview" }
  const output = processForLlmsTxt([{ ...entry, type: "ref" }])

  assert.equal(output, processForLlmsTxt([{ ...entry, type: "doc" }]))
  assert.ok(output.startsWith(`- [Overview](${overviewUrl}): `))
  assert.ok(output.includes("Configure OIDC in QuestDB Enterprise:"))
})

test("unlabelled references use the document title", () => {
  const output = processForLlmsTxt([{ type: "ref", id: overviewId }])

  assert.ok(
    output.startsWith(
      `- [OpenID Connect (OIDC) Integration](${overviewUrl}): `,
    ),
  )
})

test("the real sidebar includes the canonical OIDC overview exactly once", () => {
  const output = processForLlmsTxt(docs, 0, true)

  assert.equal(output.split(overviewUrl).length - 1, 1)
  assert.ok(output.includes(`  - [Overview](${overviewUrl}): Configure OIDC`))
  for (const guide of ["device-flow", "entra-id", "pingfederate"]) {
    const url = `https://questdb.com/docs/security/oidc/${guide}.md`
    assert.equal(output.split(url).length - 1, 1, guide)
  }
})

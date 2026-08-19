const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const docs = require("../documentation/sidebars.js").docs

function category(items, label) {
  return items.find(
    (item) =>
      item &&
      typeof item === "object" &&
      item.type === "category" &&
      item.label === label,
  )
}

function docIds(items) {
  return items.flatMap((item) => {
    if (typeof item === "string") {
      return [item]
    }
    if (!item || typeof item !== "object") {
      return []
    }
    if (item.type === "doc") {
      return [item.id]
    }
    if (item.type === "category") {
      return docIds(item.items || [])
    }
    return []
  })
}

test("nests Kubernetes Operator under Deployment instead of presenting it as a top-level section", () => {
  assert.equal(category(docs, "Kubernetes Operator"), undefined)

  const deployment = category(docs, "Deployment")
  assert.ok(deployment, "Deployment category is missing")
  assert.ok(
    category(deployment.items, "Kubernetes Operator"),
    "Deployment must contain Kubernetes Operator",
  )
})

test("uses a Getting Started dropdown for the cloud guides instead of a landing page", () => {
  const deployment = category(docs, "Deployment")
  assert.ok(deployment, "Deployment category is missing")

  const operator = category(deployment.items, "Kubernetes Operator")
  assert.ok(operator, "Kubernetes Operator category is missing from Deployment")

  const gettingStarted = category(operator.items, "Getting Started")
  assert.ok(
    gettingStarted,
    "Kubernetes Operator must contain a Getting Started dropdown",
  )
  assert.deepEqual(docIds(gettingStarted.items), [
    "operator/getting-started/aws",
    "operator/getting-started/azure",
  ])
  assert.equal(docIds(docs).includes("operator/getting-started/index"), false)
  assert.equal(
    fs.existsSync(
      path.join(
        __dirname,
        "../documentation/operator/getting-started/index.md",
      ),
    ),
    false,
    "the redundant Getting Started landing page must not remain routable",
  )
})

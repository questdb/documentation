const nodeFetch = require("node-fetch")
const yaml = require("js-yaml")

// This plugin loads examples from remote repositories.
// To insert an example, use the `<RemoteRepoExample ... />`
// react component.
//
// The `sources` below list repos that must contain a `examples.manifest.yaml`
// file at their root from which to load examples.

// "<org>/<repo>/<branch>"
const sources = [
  "questdb/c-questdb-client/main",
  "questdb/py-questdb-client/main",
  "questdb/go-questdb-client/main",
  "questdb/nodejs-questdb-client/main",
  "questdb/net-questdb-client/main",
  "questdb/java-questdb-client/master",
]

module.exports = () => ({
  name: "remote-repo-example",
  async loadContent() {
    // const examples = {
    //     "ilp/c": {
    //         "name": "ilp",
    //         "lang": "c",
    //         "code": "<code>",  // raw, not escaped for HTML.
    //         "header": "markdown",  // optional, maybe `null`.
    //         "auth": {  // optional, may be `null`.
    //             // Auth fields may be search-replaced with
    //             // specific values within the code.
    //             // The `x` and `y` fields may be missing.
    //             "kid": "...",
    //             "d": "...",
    //             "x": "...",
    //             "y": "..."
    //         }
    //     }
    // };
    const examples = {}
    for (const source of sources) {
      const [org, repo, branch] = source.split("/")
      const rawRoot = `https://raw.githubusercontent.com/${org}/${repo}/${branch}`
      const manifestUrl = `${rawRoot}/examples.manifest.yaml`
      const manifestResponse = await nodeFetch(manifestUrl)
      if (manifestResponse.status != 200)
        throw new Error(
          `Could not load manifest from ${manifestUrl}: Error ${manifestResponse.status}`,
        )
      const manifestText = await manifestResponse.text()
      const manifest = yaml.load(manifestText)
      for (const entry of manifest) {
        const { name, lang, path, header, auth, addr } = entry
        if (!path) {
          throw new Error(
            `Missing "path" in ${manifestUrl} for the ${name}/${lang} example.`,
          )
        }
        const codeUrl = `${rawRoot}/${path}`
        const codeRequest = await nodeFetch(codeUrl)
        if (codeRequest.status != 200) {
          console.warn(
            `[remote-repo-example] Skipping ${codeUrl}: Error ${codeRequest.status}`,
          )
          continue
        }
        const code = await codeRequest.text()
        const id = `${name}/${lang}`
        examples[id] = {
          name,
          lang,
          code,
          header,
          auth,
          addr,
        }
      }
    }
    return examples
  },
  async contentLoaded({ content, actions }) {
    const { setGlobalData } = actions
    setGlobalData({ repoExample: content })
  },
})

const nodeFetch = require("node-fetch")

module.exports = () => ({
  name: "fetch-repo",
  async loadContent() {
    const response = await nodeFetch(
      `https://github-api.questdb.io/github/repo`,
    )

    const data = await response.json()

    return data
  },
  async contentLoaded({ content, actions }) {
    const { setGlobalData } = actions
    setGlobalData({ repo: content })
  },
})

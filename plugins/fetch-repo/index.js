const nodeFetch = require("node-fetch")

module.exports = () => ({
  name: "fetch-repo",
  async loadContent() {
    // Fetch repo data from the custom API
    const repoResponse = await nodeFetch(
      `https://github-api.questdb.io/github/repo`,
    )
    const repoData = await repoResponse.json()

    // Also fetch star count directly from GitHub API
    const starResponse = await nodeFetch(
      "https://api.github.com/repos/questdb/questdb",
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
        },
      },
    )

    let starData = null
    if (starResponse.ok) {
      starData = await starResponse.json()
    }

    // Combine the data
    return {
      ...repoData,
      stargazers_count: starData?.stargazers_count || null,
    }
  },
  async contentLoaded({ content, actions }) {
    const { setGlobalData } = actions
    setGlobalData({ repo: content })
  },
})

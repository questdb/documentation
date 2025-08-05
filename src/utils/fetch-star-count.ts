export type StarCount = {
  count: number
  formatted: string
}

export async function fetchStarCount(): Promise<StarCount | null> {
  try {
    const response = await fetch(
      "https://api.github.com/repos/questdb/questdb",
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
        },
      },
    )

    if (!response.ok) {
      console.error(`GitHub API error: ${response.status}`)
      return null
    }

    const data = await response.json()
    const count = data.stargazers_count
    const formatted =
      count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count.toLocaleString()

    return { count, formatted }
  } catch (error) {
    console.error("Failed to fetch star count:", error)
    return null
  }
}

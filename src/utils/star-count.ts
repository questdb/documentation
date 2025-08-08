import { fetchStarCount, StarCount } from "./fetch-star-count"

let cachedStarCount: StarCount | null = null

export async function getStarCount(): Promise<StarCount | null> {
  if (cachedStarCount) {
    return cachedStarCount
  }

  cachedStarCount = await fetchStarCount()
  return cachedStarCount
}

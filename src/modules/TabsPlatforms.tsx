import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"
import { usePluginData } from "@docusaurus/useGlobalData"
import { getAssets } from "../utils/get-assets"
import type { Release, Asset } from "../utils/get-assets"

type Platform = "linux" | "windows" | "noJre"

// naive OS detection for initial tab selection
const detectOS = (): Platform => {
  if (typeof window !== "undefined") {
    const ua = (window.navigator.userAgent ?? "").toLowerCase()

    if (ua.includes("win")) {
      return "windows"
    }

    if (ua.includes("linux")) {
      return "linux"
    }
  }

  return "noJre"
}

type Props = {
  platforms: Array<{
    label: string
    value: Platform
  }>
  render: (asset: Asset & { platform: Platform }) => JSX.Element
}

export const TabsPlatforms = ({ render, platforms }: Props) => {
  const { release } = usePluginData<{ release: Release }>(
    "fetch-latest-release",
  )
  const assets = getAssets(release)

  const tabs = platforms
    .map((platform) => {
      const href = assets[platform.value].href
      if (typeof href !== "string") {
        return null
      }

      return { ...platform, href }
    })
    .filter(Boolean) as Props["platforms"]

  const defaultValue = detectOS()

  return (
    <Tabs defaultValue={defaultValue} values={tabs} groupId="platforms">
      {tabs.map((tab) => (
        <TabItem key={tab.value} value={tab.value}>
          {render({ ...assets[tab.value], platform: tab.value })}
        </TabItem>
      ))}
    </Tabs>
  )
}

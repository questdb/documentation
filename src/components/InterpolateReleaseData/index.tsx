import { usePluginData } from "@docusaurus/useGlobalData"
import { Release } from "../../utils"

const InterpolateReleaseVersion = ({ renderText }) => {
  const { release } = usePluginData<{ release: Release }>(
    "fetch-latest-release",
  )

  return renderText(release)
}

export default InterpolateReleaseVersion

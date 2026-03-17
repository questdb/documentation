import { usePluginData } from "@docusaurus/useGlobalData"

type Release = {
  name: string
}

const InterpolateJavaClientVersion = ({
  renderText,
}: {
  renderText: (release: Release) => JSX.Element
}) => {
  const { release } = usePluginData<{ release: Release }>(
    "fetch-java-client-release",
  )

  return renderText(release)
}

export default InterpolateJavaClientVersion

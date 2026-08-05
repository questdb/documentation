import OriginalMDXComponents from "@theme-original/MDXComponents"
import CodeBlock from "@theme/CodeBlock"
import LazyVideo from "@theme/LazyVideo"
import Screenshot from "@theme/Screenshot"
import InterpolateReleaseData from "../../src/components/InterpolateReleaseData"
import InterpolateJavaClientVersion from "../../src/components/InterpolateJavaClientVersion"
import LocalLink from "../../src/components/LocalLink"

const MDXComponents = {
  ...OriginalMDXComponents,
  a: LocalLink,
  Screenshot,
  LazyVideo,
  CodeBlock,
  InterpolateReleaseData,
  InterpolateJavaClientVersion,
}

export default MDXComponents

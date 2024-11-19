import OriginalMDXComponents from "@theme-original/MDXComponents"
import LocalLink from "../../src/components/LocalLink"

const MDXComponents = {
  ...OriginalMDXComponents,
  a: LocalLink,
}

export default MDXComponents

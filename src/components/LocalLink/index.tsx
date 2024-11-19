// Preserves "external"" localhost links with no 404 penalty
//
const LocalLink = ({ href, children, ...props }) => {
  const internalDemo = href === "https://demo.questdb.io/"
  const isExternal = /^(https?:\/\/)/.test(href) && !internalDemo
  const rel = isExternal ? "noopener noreferrer nofollow" : ""

  return (
    <a href={href} rel={rel} {...props}>
      {children}
    </a>
  )
}

export default LocalLink

// Preserves "external"" localhost links with no 404 penalty
//
const LocalLink = ({ href, children, ...props }) => {
  // Only add noopener/noreferrer for truly external links
  const isExternal = /^(https?:\/\/)/.test(href) && 
    !href.includes('questdb.com') && 
    !href.includes('questdb.io')
    
  const rel = isExternal ? "noopener noreferrer nofollow" : ""

  return (
    <a href={href} rel={rel} {...props}>
      {children}
    </a>
  )
}

export default LocalLink

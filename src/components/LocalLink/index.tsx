import Link from '@docusaurus/Link'

const LocalLink = ({ href, children, ...props }) => {
  // True external links (http/https)
  const isHttpExternal = /^(https?:\/\/)/.test(href)
  
  // Main site links (glossary, blog, etc)
  const isMainSiteLink = href.startsWith('/glossary/') || 
    href.startsWith('/blog/') ||
    href.startsWith('/enterprise/') ||
    href.startsWith('/download/')
  
  // Only add rel attributes for true external links
  const rel = isHttpExternal && 
    !href.includes('questdb.com') && 
    !href.includes('questdb.io')
      ? "noopener noreferrer nofollow" 
      : ""

  // Handle main site links
  if (isMainSiteLink) {
    return (
      <a href={`https://questdb.com${href}`} {...props}>
        {children}
      </a>
    )
  }

  // Use Docusaurus Link for internal links (including /docs/)
  return isHttpExternal ? (
    <a href={href} rel={rel} {...props}>
      {children}
    </a>
  ) : (
    <Link to={href} rel={rel} {...props}>
      {children}
    </Link>
  )
}

export default LocalLink
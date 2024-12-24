import Link from '@docusaurus/Link'

const LocalLink = ({ href, children, ...props }) => {
  // Only add noopener/noreferrer for truly external links
  const isExternal = /^(https?:\/\/)/.test(href) && 
    !href.includes('questdb.com') && 
    !href.includes('questdb.io')
    
  const rel = isExternal ? "noopener noreferrer nofollow" : ""

  // Use regular <a> for external links, Docusaurus Link for internal
  return isExternal ? (
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

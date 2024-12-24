// Preserves "external"" localhost links with no 404 penalty
//
const LocalLink = ({ href, children, ...props }) => {
  console.log('Link processing:', { href })
  const internalDemo = href === "https://demo.questdb.io/"
  const isQuestDBDomain = href.includes('questdb.com') || href.includes('questdb.io')
  const isExternal = /^(https?:\/\/)/.test(href) && !internalDemo && !isQuestDBDomain
  const rel = isExternal ? "noopener noreferrer nofollow" : ""
  
  // Special case for glossary links
  if (!isExternal && href.includes('/glossary/')) {
    return <a href={href} rel={rel} {...props}>{children}</a>
  }
  
  // Preserve /docs/ prefix for internal links
  const finalHref = (!isExternal && href.startsWith('/docs/')) 
    ? href 
    : href.replace(/^\//, '/docs/')

  return (
    <a href={finalHref} rel={rel} {...props}>
      {children}
    </a>
  )
}

export default LocalLink

// Preserves "external"" localhost links with no 404 penalty
//
const LocalLink = ({ href, children, ...props }) => {
  console.log('Link processing:', { 
    href,
    hasDocsPrefix: href.startsWith('/docs/'),
    isMarkdownLink: props?.className?.includes('markdown'),
    props 
  })
  
  const internalDemo = href === "https://demo.questdb.io/"
  const isQuestDBDomain = href.includes('questdb.com') || href.includes('questdb.io')
  const isExternal = /^(https?:\/\/)/.test(href) && !internalDemo && !isQuestDBDomain
  const rel = isExternal ? "noopener noreferrer nofollow" : ""

  // Don't modify links that Docusaurus has already processed
  const finalHref = (!isExternal && !props?.className?.includes('markdown')) 
    ? href.startsWith('/docs/') ? href : `/docs${href}`
    : href

  console.log('Link output:', { finalHref })
  return (
    <a href={finalHref} rel={rel} {...props}>
      {children}
    </a>
  )
}

export default LocalLink

module.exports = ({ customFields, favicon, organizationName, url }) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0" />
    <meta httpEquiv="x-ua-compatible" content="ie=edge" />
    <meta property="og:type" content="website" />
    <meta name="author" content="${organizationName}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@questdb" />
    <meta name="generator" content="Docusaurus v<%= it.version %>" />
    <link rel="icon" href="/docs/favicon.ico" />
    <link rel="icon" href="/docs/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/docs/images/icons/apple-180x180.webp" sizes="180x180" />
    <meta name="msapplication-config" content="/docs/browserconfig.xml" />
    <link rel="sitemap" type="application/xml" href="/docs/sitemap.xml" />
    <%~ it.headTags %>
    <% it.metaAttributes.forEach((metaAttribute) => { %>
      <%~ metaAttribute %>
    <% }); %>
    <% it.stylesheets.forEach((stylesheet) => { %>
      <link rel="stylesheet" type="text/css" href="<%= it.baseUrl %><%= stylesheet %>" />
    <% }); %>
  </head>
  <body <%~ it.bodyAttributes %> itemscope itemtype="http://schema.org/Organization">
    <meta itemprop="logo" content="${url}${favicon}" />
    <meta itemprop="name" content="${customFields.oneLiner}" />
    <meta itemprop="description" content="${customFields.description}" />
    <meta itemprop="url" content="${url}" />
    <meta itemprop="sameAs" content="${customFields.twitterUrl}" />
    <meta itemprop="sameAs" content="${customFields.linkedInUrl}" />
    <meta itemprop="sameAs" content="${customFields.crunchbaseUrl}" />
    <meta itemprop="sameAs" content="${customFields.githubOrgUrl}" />
    <%~ it.preBodyTags %>
    <div id="__docusaurus">
      <%~ it.appHtml %>
    </div>
    <% it.scripts.forEach((script) => { %>
      <script type="text/javascript" src="<%= it.baseUrl %><%= script %>" defer></script>
    <% }); %>
    <%~ it.postBodyTags %>
  </body>
</html>
`

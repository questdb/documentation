/*
 * Consent stack, mirrored from questdb.io (src/lib/consent.ts). Order is
 * load-bearing: Consent Mode defaults, then the Cookiebot CMP, then the
 * bridge event, then the Google Ads tag. /docs is served same-origin under
 * questdb.com via a proxy rewrite, so the consent cookie is shared with the
 * main site and one banner covers both.
 * There is deliberately no gtag('consent','update') here: Cookiebot sends
 * that to Google itself on every consent submission.
 */
const CONSENT_HEAD = `
    <script data-cookieconsent="ignore">
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('consent', 'default', {
        'ad_storage': 'denied',
        'ad_user_data': 'denied',
        'ad_personalization': 'denied',
        'analytics_storage': 'denied',
        'functionality_storage': 'denied',
        'personalization_storage': 'denied',
        'security_storage': 'granted',
        'wait_for_update': 500
      });
      gtag('set', 'ads_data_redaction', true);
      gtag('set', 'url_passthrough', false);
    </script>
    <script id="Cookiebot" src="https://consent.cookiebot.com/uc.js" data-cbid="947be9a7-2d22-4dbf-8964-1b1a954da422" data-blockingmode="manual"></script>
    <script>
      (function () {
        function broadcast(c) {
          window.dispatchEvent(new CustomEvent('questdb:consent', { detail: c }));
        }
        function sync() {
          broadcast((window.Cookiebot && window.Cookiebot.consent) || {});
        }
        window.addEventListener('CookiebotOnConsentReady', sync);
        window.addEventListener('CookiebotOnAccept', sync);
        window.addEventListener('CookiebotOnDecline', sync);
      })();
    </script>
    <script>
      !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId setPersonProperties".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
      posthog.init('phc_GnFGGyhLRvRDKO6iN6eJRAypiKymw9LGf7GlAtZnaKx', {
        api_host: 'https://us.i.posthog.com',
        cookieless_mode: 'on_reject'
      });
      (function () {
        function apply(c) {
          if (c && c.statistics) {
            posthog.opt_in_capturing();
          } else {
            posthog.opt_out_capturing();
            posthog.reset();
          }
        }
        apply((window.Cookiebot && window.Cookiebot.consent) || null);
        window.addEventListener('questdb:consent', function (e) {
          apply(e.detail || {});
        });
      })();
    </script>
    <script async data-cookieconsent="ignore" src="https://www.googletagmanager.com/gtag/js?id=AW-11258045331"></script>
    <script data-cookieconsent="ignore">
      gtag('js', new Date());
      gtag('config', 'AW-11258045331');
    </script>
`

module.exports = ({ customFields, favicon, organizationName, url }) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
${CONSENT_HEAD}
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
    <script>
      (function()  {
        if (localStorage.getItem('theme') !== 'dark') {
          window.localStorage.removeItem('theme');
          document.documentElement.setAttribute('data-theme', 'dark');
        }
      })()
    </script>
    <%~ it.postBodyTags %>
  </body>
</html>
`

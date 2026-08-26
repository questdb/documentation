/**
 * Consent configuration shared by every documentation page.
 *
 * Cookiebot owns regional behavior and consent. Google Ads uses Basic Consent
 * Mode and is activated only after marketing consent. Wherever Cookiebot asks
 * for statistics consent, PostHog uses normal analytics only after acceptance
 * and otherwise runs in its native cookieless mode. Outside the banner
 * distribution it uses normal analytics.
 */

/** Public identifiers; all of these values ship in the page source. */
const POSTHOG_TOKEN = "phc_GnFGGyhLRvRDKO6iN6eJRAypiKymw9LGf7GlAtZnaKx" // gitleaks:allow — public client key
const COOKIEBOT_CBID = "947be9a7-2d22-4dbf-8964-1b1a954da422"

const GOOGLE_ADS_ID = "AW-11258045331"
const GOOGLE_ADS_LOADER = `
if (navigator.globalPrivacyControl !== true) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', '${GOOGLE_ADS_ID}');

  if (!document.querySelector('script[data-qdb-google-ads]')) {
    var googleAdsScript = document.createElement('script');
    googleAdsScript.async = true;
    googleAdsScript.src = 'https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}';
    googleAdsScript.setAttribute('data-qdb-google-ads', '');
    document.head.appendChild(googleAdsScript);
  }
}
`

module.exports = {
  POSTHOG_TOKEN,
  COOKIEBOT_CBID,
  GOOGLE_ADS_LOADER,
}

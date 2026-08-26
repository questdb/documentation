/**
 * Consent configuration shared by every documentation page.
 *
 * The generated tags must stay ordered: denied Consent Mode defaults, the
 * narrow GPC advertising guard, Cookiebot, then Google Ads. Cookiebot owns
 * regional behavior and normal consent updates.
 */

/** Public identifiers; all of these values ship in the page source. */
const POSTHOG_TOKEN = "phc_GnFGGyhLRvRDKO6iN6eJRAypiKymw9LGf7GlAtZnaKx" // gitleaks:allow — public client key
const COOKIEBOT_CBID = "947be9a7-2d22-4dbf-8964-1b1a954da422"
const COOKIEBOT_CALIFORNIA_CBID = "202f9bab-f372-498e-ad9c-338a60d68efd"
const COOKIEBOT_GEOREGIONS = `{'region':'US-06','cbid':'${COOKIEBOT_CALIFORNIA_CBID}'}`

const CONSENT_DEFAULTS = `
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
  'wait_for_update': 2000
});
gtag('set', 'ads_data_redaction', true);
gtag('set', 'url_passthrough', false);
`

const GPC_ADVERTISING_OVERRIDE = `
(function () {
  function gpcActive() {
    return typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true;
  }
  function denyAdvertising() {
    if (!gpcActive() || typeof window.gtag !== 'function') return;
    window.gtag('consent', 'update', {
      'ad_storage': 'denied',
      'ad_user_data': 'denied',
      'ad_personalization': 'denied'
    });
    window.gtag('set', 'ads_data_redaction', true);
  }

  window.addEventListener('CookiebotOnConsentReady', denyAdvertising);
  window.addEventListener('CookiebotOnAccept', denyAdvertising);
  window.addEventListener('CookiebotOnDecline', denyAdvertising);
  denyAdvertising();
})();
`

const GOOGLE_ADS_ID = "AW-11258045331"
const GOOGLE_ADS_CONFIG = `
gtag('js', new Date());
gtag('config', '${GOOGLE_ADS_ID}');
`

module.exports = {
  POSTHOG_TOKEN,
  COOKIEBOT_CBID,
  COOKIEBOT_GEOREGIONS,
  CONSENT_DEFAULTS,
  GPC_ADVERTISING_OVERRIDE,
  GOOGLE_ADS_ID,
  GOOGLE_ADS_CONFIG,
}

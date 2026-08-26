const path = require("path")
const {
  COOKIEBOT_CBID,
  COOKIEBOT_GEOREGIONS,
  CONSENT_DEFAULTS,
  GPC_ADVERTISING_OVERRIDE,
  GOOGLE_ADS_ID,
  GOOGLE_ADS_CONFIG,
} = require("./config")

module.exports = () => ({
  name: "questdb-consent",

  getClientModules() {
    return [path.resolve(__dirname, "client.ts")]
  },

  injectHtmlTags() {
    return {
      headTags: [
        {
          tagName: "script",
          attributes: { "data-cookieconsent": "ignore" },
          innerHTML: CONSENT_DEFAULTS,
        },
        {
          tagName: "script",
          attributes: {},
          innerHTML: GPC_ADVERTISING_OVERRIDE,
        },
        {
          tagName: "script",
          attributes: {
            id: "Cookiebot",
            async: true,
            src: "https://consent.cookiebot.com/uc.js",
            "data-cbid": COOKIEBOT_CBID,
            "data-georegions": COOKIEBOT_GEOREGIONS,
            "data-blockingmode": "manual",
          },
        },
        {
          tagName: "script",
          attributes: {
            async: true,
            "data-cookieconsent": "ignore",
            src: `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`,
          },
        },
        {
          tagName: "script",
          attributes: { "data-cookieconsent": "ignore" },
          innerHTML: GOOGLE_ADS_CONFIG,
        },
      ],
    }
  },
})

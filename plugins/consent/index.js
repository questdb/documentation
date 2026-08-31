const path = require("path")
const { COOKIEBOT_CBID } = require("./config")

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
          attributes: {
            id: "Cookiebot",
            async: true,
            src: "https://consent.cookiebot.com/uc.js",
            "data-cbid": COOKIEBOT_CBID,
            "data-blockingmode": "manual",
          },
        },
      ],
    }
  },
})

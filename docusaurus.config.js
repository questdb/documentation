import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import dotenv from "dotenv"

const ssrTemplate = require("./src/internals/ssr.template")
const customFields = require("./src/config/customFields")
const path = require("path")
const isPreviews = process.env.NETLIFY && process.env.CONTEXT === 'deploy-preview'

dotenv.config()

const config = {
  title: "QuestDB",
  tagline: "QuestDB is the fastest open source time series database",
  url: `https://${customFields.domain}`,
  baseUrl: isPreviews ? '/' : '/docs/',
  baseUrlIssueBanner: false,
  favicon: "/images/favicon.webp",
  organizationName: "QuestDB",
  staticDirectories: ['assets', 'images', 'static'],
  projectName: "questdb",
  customFields,
  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",
  trailingSlash: true,
  stylesheets: [
    {
      href: "https://cdn.jsdelivr.net/npm/katex@0.13.24/dist/katex.min.css",
      type: "text/css",
      integrity:
        "sha384-odtC+0UGzzFL/6PNoE8rX/SPcQDXBJ+uRepguP4QkPCm2LBxH3FA3y+fKSiJ+AmM",
      crossorigin: "anonymous",
    },
  ],
  markdown: {
    mermaid: true,
  },
  themes: ["@docusaurus/theme-mermaid"],

  plugins: [
    () => ({
      name: "resolve-react",
      configureWebpack() {
        return {
          resolve: {
            alias: {
              react: path.resolve("/node_modules/react"),
            },
          },
        }
      },
    }),
    require.resolve("./plugins/fetch-latest-release/index"),
    require.resolve("./plugins/fetch-repo/index"),
    require.resolve("./plugins/remote-repo-example/index"),
    require.resolve("./plugins/optimize/index"),
    require.resolve("./plugins/manifest/index"),
    require.resolve("./plugins/tailwind/index"),
    [
      "@docusaurus/plugin-pwa",
      {
        pwaHead: [
          {
            tagName: "link",
            rel: "manifest",
            href: "/manifest.webmanifest",
          },
          {
            tagName: "meta",
            name: "theme-color",
            content: "#21222c",
          },
          {
            tagName: "meta",
            name: "apple-mobile-web-app-capable",
            content: "yes",
          },
          {
            tagName: "meta",
            name: "apple-mobile-web-app-status-bar-style",
            content: "#21222c",
          },
        ],
      },
    ],
    function (context, options) {
      return {
        name: 'development-redirects',
        configureWebpack(config, isServer, utils) {
          if (process.env.NODE_ENV === 'development') {
            return {
              devServer: {
                onBeforeSetupMiddleware: function (devServer) {
                  devServer.app.get('*', function (req, res, next) {
                    // If path doesn't start with /docs, redirect to Next.js
                    if (!req.path.startsWith('/docs/')) {
                      return res.redirect(`http://localhost:3000${req.path}`)
                    }
                    next()
                  })
                }
              }
            }
          }
        }
      }
    }
  ].filter(Boolean),

  themeConfig: {
    announcementBar: {
      id: "release_week",
      backgroundColor: "#fafbfc",
      textColor: "#091E42",
      isCloseable: false,
      content: "cheese",
    },
    colorMode: {
      defaultMode: "dark",
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    image: "/images/og.gif",
    prism: {
      defaultLanguage: "questdb-sql",
      additionalLanguages: [
        "bash",
        "rust",
        "csharp",
        "julia",
        "cpp",
        "java",
        "json",
        "ebnf",
        "ini",
        "toml",
        "ruby",
        "php",
        "fsharp", // for fluxQL
        "markup-templating",
      ],
      theme: require("./src/internals/prism-github"),
      darkTheme: require("./src/internals/prism-dracula"),
    },

    ...(typeof process.env.ALGOLIA_API_KEY === "string" &&
    typeof process.env.ALGOLIA_APP_ID === "string"
      ? {
          algolia: {
            appId: process.env.ALGOLIA_APP_ID,
            apiKey: process.env.ALGOLIA_API_KEY,
            indexName: "questdb",
            // Disable /search page
            searchPagePath: false,
            contextualSearch: false,
            replaceSearchResultPathname: {
              from: '^/docs/',
              to: '/',
            },
          },
        }
      : {}),
  },
  presets: [
    [
      "@docusaurus/preset-classic",
      {

        blog: false,
        docs: {
          include: ["**/*!(.partial).{md,mdx}"],
          exclude: ["/glossary/"],
          path: "documentation",
          routeBasePath: "/",
          editUrl: ({ docPath }) => {
            return `https://github.com/questdb/documentation/documentation/edit/main/${docPath}`
          },
          sidebarPath: require.resolve("./documentation/sidebars.js"),
          showLastUpdateAuthor: false,
          showLastUpdateTime: false,
          admonitions: {
            keywords: ["note", "tip", "info", "warning", "danger"],
          },
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
        },

        sitemap: {
          changefreq: "daily",
          priority: 0.7,
        },
        theme: {
          customCss: [require.resolve("./src/css/_global.css")],
        },
      },
    ],
  ],
}

module.exports = {
  ...config,
  ssrTemplate: ssrTemplate(config),
}

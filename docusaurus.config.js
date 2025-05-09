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
  baseUrl: isPreviews ? '/docs/' : '/docs/',
  baseUrlIssueBanner: false,
  favicon: "/images/favicon.webp",
  organizationName: "QuestDB",
  staticDirectories: ['static'],
  projectName: "questdb",
  customFields,
  onBrokenLinks: isPreviews ? "warn" : "throw",
  onBrokenMarkdownLinks: isPreviews ? "warn" : "throw",
  onBrokenAnchors: isPreviews ? "warn" : "throw",
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
      respectPrefersColorScheme: false, // the user preference is also overriden, see ssr.template.js
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
    algolia: {
      appId: process.env.ALGOLIA_APP_ID || 'placeholder-app-id',
      apiKey: process.env.ALGOLIA_API_KEY || 'placeholder-api-key',
      indexName: "questdb",
      searchPagePath: false,
      contextualSearch: false,
    },
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
            return `https://github.com/questdb/documentation/edit/main/documentation/${docPath}`
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

console.log("isPreviews", isPreviews);
console.log("baseUrl", config.baseUrl);

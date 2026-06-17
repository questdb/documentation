import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import dotenv from "dotenv"

const ssrTemplate = require("./src/internals/ssr.template")
const customFields = require("./src/config/customFields")
const path = require("path")

dotenv.config()

const isPreviews =
  process.env.NETLIFY && process.env.CONTEXT === "deploy-preview"

const config = {
  title: "QuestDB",
  tagline: "QuestDB is the fastest open source time series database",
  url: `https://${customFields.domain}`,
  baseUrl: "/docs/",
  baseUrlIssueBanner: false,
  favicon: "/images/favicon.webp",
  organizationName: "QuestDB",
  staticDirectories: ["static"],
  projectName: "questdb",
  customFields,
  onBrokenLinks: isPreviews ? "warn" : "throw",
  onBrokenMarkdownLinks: isPreviews ? "warn" : "throw",
  onBrokenAnchors: isPreviews ? "warn" : "throw",
  trailingSlash: true,
  future: {
    experimental_faster: {
      rspackBundler: true,
      rspackPersistentCache: true,
    },
  },
  stylesheets: [
    {
      href: "https://cdn.jsdelivr.net/npm/katex@0.13.24/dist/katex.min.css",
      type: "text/css",
      integrity:
        "sha384-odtC+0UGzzFL/6PNoE8rX/SPcQDXBJ+uRepguP4QkPCm2LBxH3FA3y+fKSiJ+AmM",
      crossorigin: "anonymous",
    },
  ],
  scripts: [
    {
      src: "https://widget.kapa.ai/kapa-widget.bundle.js",
      async: true,
      defer: true,
      "data-color-scheme": "dark",
      "data-view-mode": "sidebar",
      "data-website-id": "752e7a80-c213-4acd-b6c3-c3747fbe4ba6",
      "data-project-name": "QuestDB",
      "data-project-logo": "/docs/images/favicon.webp",
      "data-bot-protection-mechanism": "hcaptcha",
      "data-modal-z-index": "9999",
      "data-modal-size": "533px",

      "data-button-border": "1px solid #c94f74",
      "data-launcher-button-hover-background-color": "#282a36",
      "data-button-bg-color": "#21222c",
      "data-button-border-radius": "8px",
      "data-button-text-color": "#ffffff",
      "data-submit-button-color": "#ffffff",
      "data-submit-button-background-color": "#c93261",
      "data-submit-button-hover-background-color": "#c94f74",
      "data-hyperlink-color-dark": "#c94f74",

      "data-modal-example-questions":
        "How do I create a table?,What is designated timestamp?",
      "data-modal-disclaimer":
        "This AI assistant has access to QuestDB documentation and can help with time series database questions.",
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
              react: path.resolve(__dirname, "node_modules/react"),
              "@questdb/sql-parser/grammar": path.resolve(__dirname, "node_modules/@questdb/sql-parser/dist/grammar/index.js"),
            },
          },
        }
      },
    }),
    require.resolve("./plugins/fetch-latest-release/index"),
    require.resolve("./plugins/fetch-java-client-release/index"),
    require.resolve("./plugins/fetch-repo/index"),
    require.resolve("./plugins/remote-repo-example/index"),
    require.resolve("./plugins/raw-markdown/index"),

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
    navbar: {
      title: "",
      logo: {
        alt: "QuestDB Logo",
        src: "/images/questdb-logo-navbar.svg",
        href: "https://questdb.com/",
      },
      items: [
        {
          to: "https://questdb.com/",
          label: "Return to QuestDB.com",
          position: "left",
          className: "mobile-only",
        },
        {
          type: "docSidebar",
          sidebarId: "docs",
          position: "left",
          label: "Documentation",
          className: "mobile-only",
        },
        {
          to: "https://questdb.com/blog/?tag=tutorial",
          label: "Tutorials",
          position: "left",
          className: "mobile-only",
        },
        {
          to: "https://questdb.com/blog/",
          label: "Blog",
          position: "left",
          className: "mobile-only",
        },
        {
          to: "https://questdb.com/enterprise/",
          label: "QuestDB Enterprise",
          position: "left",
          className: "mobile-only",
        },
        {
          to: "https://slack.questdb.com/",
          label: "Public Slack",
          position: "left",
          className: "mobile-only",
        },
        {
          to: "https://community.questdb.com/",
          label: "Discourse Community",
          position: "left",
          className: "mobile-only",
        },
        {
          to: "https://github.com/questdb/questdb/",
          label: "View QuestDB Repo",
          position: "left",
          className: "mobile-only",
        },
        {
          type: "custom-navbar-items",
          position: "right",
        },
        {
          type: "search",
          position: "right",
        },
      ],
      hideOnScroll: false,
    },
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
    image: "/images/og.png",
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
      appId: process.env.ALGOLIA_APP_ID || "placeholder-app-id",
      apiKey: process.env.ALGOLIA_API_KEY || "placeholder-api-key",
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
          include: ["**/*.{md,mdx}"],
          exclude: ["**/*.partial.mdx"],
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

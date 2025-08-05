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
      "data-website-id": "752e7a80-c213-4acd-b6c3-c3747fbe4ba6",
      "data-project-name": "QuestDB",
      "data-project-color": "#21222c",
      "data-project-logo": "/docs/images/favicon.webp",
      "data-bot-protection-mechanism": "hcaptcha",

      // Modal styling
      "data-modal-header-bg-color": "#21222c",
      "data-modal-body-bg-color": "#262833",
      "data-modal-border-radius": "8px",
      "data-modal-overlay-bg-color": "rgba(33, 34, 44, 0.8)",
      "data-modal-header-border-bottom": "1px solid #404153",

      // Conversation
      "data-question-text-color": "#ffffff",
      "data-answer-text-color": "#ffffff",

      // Source Links
      "data-source-link-primary-heading-text-color": "#ffffff",
      "data-source-link-secondary-heading-text-color": "#9ca3af",
      "data-source-link-bg-color": "#262833",
      "data-source-link-hover-bg-color": "#404153",
      "data-source-link-border": "1px solid #404153",

      // Button styling
      "data-button-border": "1px solid #c94f74",
      "data-button-border-radius": "8px",
      "data-button-text-color": "#ffffff",

      // Input field styling
      "data-query-input-text-color": "#000000",
      "data-query-input-placeholder-text-color": "#666666",
      "data-query-input-border-color": "#404153",
      "data-query-input-focus-border-color": "#c94f74",
      "data-submit-query-button-bg-color": "#c94f74",

      // Modal title and text
      "data-modal-title-color": "#ffffff",
      "data-modal-disclaimer-bg-color": "#1e1f2b",
      "data-modal-disclaimer-text-color": "#9ca3af",

      // Hyperlinks
      "data-hyperlink-color": "#c94f74",

      // Feedback buttons
      "data-answer-feedback-button-bg-color": "transparent",
      "data-answer-feedback-button-border": "1px solid #404153",
      "data-answer-feedback-button-text-color": "#9ca3af",
      "data-answer-feedback-button-hover-bg-color": "#404153",
      "data-answer-feedback-button-active-bg-color": "#404153",
      "data-answer-feedback-button-active-text-color": "#ffffff",
      "data-answer-feedback-button-border-radius": "4px",

      // Copy button
      "data-answer-copy-button-bg-color": "transparent",
      "data-answer-copy-button-border": "1px solid #404153",
      "data-answer-copy-button-text-color": "#9ca3af",
      "data-answer-copy-button-hover-bg-color": "#404153",
      "data-answer-copy-button-border-radius": "4px",

      // Clear thread button
      "data-thread-clear-button-bg-color": "transparent",
      "data-thread-clear-button-border": "1px solid #404153",
      "data-thread-clear-button-text-color": "#9ca3af",
      "data-thread-clear-button-hover-bg-color": "#404153",
      "data-thread-clear-button-border-radius": "4px",

      // Example question buttons
      "data-example-question-button-bg-color": "#1e1f2b",
      "data-example-question-button-border": "1px solid #404153",
      "data-example-question-button-text-color": "#ffffff",
      "data-example-question-button-hover-bg-color": "#404153",
      "data-example-question-button-border-radius": "6px",
      "data-example-question-button-box-shadow": "0 1px 3px rgba(0, 0, 0, 0.3)",

      // Search mode styling
      "data-search-result-hover-bg-color": "#404153",
      "data-search-result-primary-text-color": "#ffffff",
      "data-search-result-secondary-text-color": "#9ca3af",
      "data-search-ask-ai-cta-text-color": "#c94f74",
      "data-search-ask-ai-cta-hover-bg-color": "#404153",

      // Additional customization
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
              react: path.resolve("/node_modules/react"),
            },
          },
        }
      },
    }),
    require.resolve("./plugins/fetch-latest-release/index"),
    require.resolve("./plugins/fetch-repo/index"),
    require.resolve("./plugins/remote-repo-example/index"),

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
      title: "QuestDB",
      logo: {
        alt: "QuestDB Logo",
        src: "/images/favicon.webp",
        href: "https://questdb.com/",
      },
      items: [
        {
          to: "/enterprise/",
          label: "⚡️ QuestDB Enterprise",
          position: "right",
        },
        {
          type: "html",
          position: "right",
          value:
            '<div class="navbar__item dropdown dropdown--hoverable dropdown--left"><a href="https://github.com/questdb/questdb/releases/latest" aria-label="GitHub repository" class="navbar__item navbar__link header-github-link font-semibold font-sans font-normal" id="release-version">latest</a><ul class="dropdown__menu"><li><a href="/release-notes/" class="dropdown__link font-semibold">Release Notes</a></li><li><a href="https://github.com/orgs/questdb/projects/1/views/5" class="dropdown__link font-semibold" rel="noreferrer" target="_blank">Roadmap</a></li></ul></div><script>fetch("https://github-api.questdb.io/github/latest").then(r=>r.json()).then(data=>{document.getElementById("release-version").textContent=data.name;document.getElementById("release-version").href=`https://github.com/questdb/questdb/releases/tag/${data.name}`;}).catch(()=>{});</script>',
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

import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "AgentOps",
  tagline: "AI-native observability for AI agent applications",
  favicon: "img/favicon.ico",

  future: {
    v4: true,
  },

  url: "https://docs.agentops.dev",
  baseUrl: "/",

  organizationName: "josedab",
  projectName: "agentops",

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  markdown: {
    mermaid: true,
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  themes: [
    "@docusaurus/theme-mermaid",
    // Local search for development and self-hosted deployments
    [
      require.resolve("@easyops-cn/docusaurus-search-local"),
      {
        hashed: true,
        language: ["en"],
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
        // Only enable if Algolia is not configured
        docsRouteBasePath: "/",
        indexBlog: false,
      },
    ],
  ],

  // Algolia search configuration (for production)
  // To enable: set ALGOLIA_APP_ID, ALGOLIA_API_KEY, and ALGOLIA_INDEX_NAME env vars
  // Then uncomment the algolia section in themeConfig below

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/josedab/agentops/tree/main/website/",
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/agentops-social-card.svg",
    metadata: [
      {
        name: "keywords",
        content:
          "ai, observability, agents, llm, monitoring, openai, anthropic, copilot",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    colorMode: {
      defaultMode: "dark",
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    announcementBar: {
      id: "star_us",
      content:
        '⭐️ If you like AgentOps, give it a star on <a target="_blank" rel="noopener noreferrer" href="https://github.com/josedab/agentops">GitHub</a>!',
      backgroundColor: "#6366f1",
      textColor: "#ffffff",
      isCloseable: true,
    },
    navbar: {
      title: "AgentOps",
      logo: {
        alt: "AgentOps Logo",
        src: "img/logo.svg",
        srcDark: "img/logo-dark.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Docs",
        },
        {
          to: "/docs/api-reference",
          label: "API",
          position: "left",
        },
        {
          href: "https://app.agentops.dev",
          label: "Dashboard",
          position: "right",
        },
        {
          href: "https://discord.gg/agentops",
          label: "Discord",
          position: "right",
        },
        {
          href: "https://github.com/josedab/agentops",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Documentation",
          items: [
            { label: "Getting Started", to: "/docs/getting-started" },
            { label: "Core Concepts", to: "/docs/concepts" },
            { label: "Guides", to: "/docs/guides" },
            { label: "API Reference", to: "/docs/api-reference" },
          ],
        },
        {
          title: "SDKs",
          items: [
            { label: "TypeScript", to: "/docs/sdks/typescript" },
            { label: "Python", to: "/docs/sdks/python" },
            { label: "Go", to: "/docs/sdks/go" },
          ],
        },
        {
          title: "Community",
          items: [
            { label: "Discord", href: "https://discord.gg/agentops" },
            {
              label: "GitHub Discussions",
              href: "https://github.com/josedab/agentops/discussions",
            },
            { label: "Twitter", href: "https://twitter.com/agentops_dev" },
          ],
        },
        {
          title: "More",
          items: [
            { label: "GitHub", href: "https://github.com/josedab/agentops" },
            { label: "Dashboard", href: "https://app.agentops.dev" },
            { label: "Status", href: "https://status.agentops.dev" },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Jose David Baena. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "json", "python", "go", "typescript"],
    },
    // Algolia DocSearch configuration (for production)
    // Apply for free at: https://docsearch.algolia.com/apply/
    // After approval, uncomment and configure:
    // algolia: {
    //   appId: process.env.ALGOLIA_APP_ID || 'YOUR_APP_ID',
    //   apiKey: process.env.ALGOLIA_API_KEY || 'YOUR_SEARCH_API_KEY',
    //   indexName: process.env.ALGOLIA_INDEX_NAME || 'agentops',
    //   contextualSearch: true,
    //   searchPagePath: 'search',
    // },
  } satisfies Preset.ThemeConfig,
};

export default config;

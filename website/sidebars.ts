import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docsSidebar: [
    "intro",
    "getting-started",
    "comparison",
    {
      type: "category",
      label: "Core Concepts",
      link: { type: "doc", id: "concepts/index" },
      items: [
        "concepts/sessions",
        "concepts/events",
        "concepts/auto-instrumentation",
        "concepts/cost-tracking",
      ],
    },
    {
      type: "category",
      label: "SDKs",
      link: { type: "doc", id: "sdks/index" },
      items: ["sdks/typescript", "sdks/python", "sdks/go"],
    },
    {
      type: "category",
      label: "Examples",
      link: { type: "doc", id: "examples/index" },
      items: [
        "examples/basic-usage",
        "examples/openai-integration",
        "examples/agent-with-tools",
      ],
    },
    {
      type: "category",
      label: "Guides",
      link: { type: "doc", id: "guides/index" },
      items: [
        "guides/openai-integration",
        "guides/anthropic-integration",
        "guides/copilot-sdk-integration",
        "guides/debugging-with-copilot",
        "guides/semantic-diff",
        "guides/cost-guardrails",
      ],
    },
    {
      type: "category",
      label: "Advanced Recipes",
      link: { type: "doc", id: "recipes/index" },
      items: [
        "recipes/multi-agent",
        "recipes/streaming",
        "recipes/rag",
        "recipes/batch-processing",
      ],
    },
    {
      type: "category",
      label: "Migration",
      link: { type: "doc", id: "migration/index" },
      items: [
        "migration/from-langsmith",
        "migration/from-helicone",
        "migration/from-custom-logging",
      ],
    },
    {
      type: "category",
      label: "API Reference",
      link: { type: "doc", id: "api-reference/index" },
      items: [
        "api-reference/sessions",
        "api-reference/metrics",
        "api-reference/alerts",
        "api-reference/webhooks",
      ],
    },
    {
      type: "category",
      label: "Architecture",
      link: { type: "doc", id: "architecture/index" },
      items: [
        "architecture/overview",
        "architecture/data-pipeline",
        "architecture/adrs",
      ],
    },
    "benchmarks",
    "troubleshooting",
    "faq",
    "changelog",
    {
      type: "category",
      label: "Contributing",
      link: { type: "doc", id: "contributing/index" },
      items: ["contributing/development-setup", "contributing/code-of-conduct"],
    },
  ],
};

export default sidebars;

import type { ReactNode } from "react";
import clsx from "clsx";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";
import CodeBlock from "@theme/CodeBlock";

import styles from "./index.module.css";

const installCode = `npm install @agentops/sdk`;

const quickStartCode = `import { AgentOps } from '@agentops/sdk';
import OpenAI from 'openai';

// Initialize AgentOps
const agentops = new AgentOps({
  apiKey: process.env.AGENTOPS_API_KEY!,
});

// Wrap your LLM client - that's it!
const openai = agentops.wrap(new OpenAI());

// All calls are automatically tracked
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
});

// Graceful shutdown
await agentops.shutdown();`;

type FeatureItem = {
  title: string;
  icon: string;
  description: string;
};

const FeatureList: FeatureItem[] = [
  {
    title: "Session Tracing",
    icon: "🔍",
    description:
      "Visualize complete agent decision trees with parent-child event relationships.",
  },
  {
    title: "Cost Attribution",
    icon: "💰",
    description:
      "Track LLM costs by feature, user, and model with real-time spending alerts.",
  },
  {
    title: "Tool Tracking",
    icon: "🔧",
    description:
      "Monitor MCP tool execution, latencies, and success rates across your agents.",
  },
  {
    title: "AI Debugging Copilot",
    icon: "🤖",
    description:
      "Ask natural language questions to investigate sessions and find root causes.",
  },
  {
    title: "Semantic Diff",
    icon: "📈",
    description:
      "Compare agent behavior across versions, deployments, and time periods.",
  },
  {
    title: "Cost Guardrails",
    icon: "🛡️",
    description:
      "Prevent runaway costs with real-time spending limits and budget enforcement.",
  },
];

function Feature({ title, icon, description }: FeatureItem) {
  return (
    <div className={clsx("col col--4")}>
      <div className={styles.featureCard}>
        <div className={styles.featureIcon}>{icon}</div>
        <Heading as="h3" className={styles.featureTitle}>
          {title}
        </Heading>
        <p className={styles.featureDescription}>{description}</p>
      </div>
    </div>
  );
}

function HomepageHeader() {
  return (
    <header className={clsx("hero", styles.heroBanner)}>
      <div className="container">
        <div className={styles.heroContent}>
          <div className={styles.badges}>
            <a
              href="https://www.npmjs.com/package/@agentops/sdk"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src="https://badge.fury.io/js/@agentops%2Fsdk.svg"
                alt="npm version"
              />
            </a>
            <a
              href="https://github.com/josedab/agentops/actions/workflows/ci.yml"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src="https://github.com/josedab/agentops/actions/workflows/ci.yml/badge.svg"
                alt="CI"
              />
            </a>
            <a
              href="https://opensource.org/licenses/MIT"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src="https://img.shields.io/badge/License-MIT-yellow.svg"
                alt="License: MIT"
              />
            </a>
          </div>
          <Heading as="h1" className="hero__title">
            Observability for AI Agents
          </Heading>
          <p className="hero__subtitle">
            Monitor, debug, and optimize your AI-powered applications with
            session tracing, cost attribution, and AI-powered debugging—all with
            zero configuration.
          </p>
          <div className={styles.installCommand}>
            <code>npm install @agentops/sdk</code>
            <button
              className={styles.copyButton}
              onClick={() => navigator.clipboard.writeText(installCode)}
              title="Copy to clipboard"
            >
              📋
            </button>
          </div>
          <div className={styles.buttons}>
            <Link
              className="button button--primary button--lg"
              to="/docs/getting-started"
            >
              Get Started →
            </Link>
            <Link
              className="button button--secondary button--lg"
              to="https://github.com/josedab/agentops"
            >
              GitHub
            </Link>
            <Link
              className="button button--outline button--lg"
              to="https://app.agentops.dev"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

function QuickStartSection() {
  return (
    <section className={styles.quickStart}>
      <div className="container">
        <div className="row">
          <div className={clsx("col col--6", styles.quickStartText)}>
            <Heading as="h2">Start tracking in 3 lines</Heading>
            <p>
              AgentOps uses a proxy pattern to automatically instrument your LLM
              clients. Just wrap your client and all calls are tracked—no code
              changes required.
            </p>
            <ul className={styles.benefitsList}>
              <li>✅ Works with OpenAI, Anthropic, and GitHub Copilot SDK</li>
              <li>✅ Less than 1% performance overhead</li>
              <li>✅ Automatic token counting and cost calculation</li>
              <li>✅ Full TypeScript support with type safety</li>
            </ul>
          </div>
          <div className="col col--6">
            <CodeBlock language="typescript" title="Quick Start">
              {quickStartCode}
            </CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <Heading as="h2">
            Everything you need to understand your agents
          </Heading>
          <p>
            AgentOps provides comprehensive observability specifically designed
            for AI-powered systems.
          </p>
        </div>
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoSection() {
  return (
    <section className={styles.demo}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <Heading as="h2">See it in action</Heading>
          <p>
            Watch how AgentOps captures and visualizes your AI agent sessions.
          </p>
        </div>
        <div className={styles.demoContainer}>
          <div className={styles.demoPlaceholder}>
            <div className={styles.demoWindow}>
              <div className={styles.demoWindowHeader}>
                <span
                  className={styles.demoWindowDot}
                  style={{ background: "#ff5f56" }}
                />
                <span
                  className={styles.demoWindowDot}
                  style={{ background: "#ffbd2e" }}
                />
                <span
                  className={styles.demoWindowDot}
                  style={{ background: "#27ca40" }}
                />
                <span className={styles.demoWindowTitle}>
                  AgentOps Dashboard
                </span>
              </div>
              <div className={styles.demoWindowContent}>
                <div className={styles.demoSidebar}>
                  <div className={styles.demoNavItem}>📊 Sessions</div>
                  <div className={styles.demoNavItem}>💰 Costs</div>
                  <div className={styles.demoNavItem}>🔔 Alerts</div>
                </div>
                <div className={styles.demoMain}>
                  <div className={styles.demoCard}>
                    <div className={styles.demoCardTitle}>
                      Session: chat-assistant
                    </div>
                    <div className={styles.demoTrace}>
                      <div className={styles.demoTraceItem}>
                        <span className={styles.demoTraceIcon}>💬</span>
                        <span>User prompt (28 tokens)</span>
                      </div>
                      <div
                        className={styles.demoTraceItem}
                        style={{ marginLeft: "1.5rem" }}
                      >
                        <span className={styles.demoTraceIcon}>🤖</span>
                        <span>GPT-4o response (156 tokens)</span>
                      </div>
                      <div
                        className={styles.demoTraceItem}
                        style={{ marginLeft: "1.5rem" }}
                      >
                        <span className={styles.demoTraceIcon}>🔧</span>
                        <span>Tool: search_web (287ms)</span>
                      </div>
                      <div
                        className={styles.demoTraceItem}
                        style={{ marginLeft: "1.5rem" }}
                      >
                        <span className={styles.demoTraceIcon}>✅</span>
                        <span>Session complete ($0.0045)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.demoActions}>
          <Link
            className="button button--primary button--lg"
            to="/docs/getting-started"
          >
            Try it yourself →
          </Link>
        </div>
      </div>
    </section>
  );
}

function IntegrationsSection() {
  return (
    <section className={styles.integrations}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <Heading as="h2">Works with your stack</Heading>
          <p>
            First-class integrations for popular LLM providers and frameworks.
          </p>
        </div>
        <div className={styles.integrationGrid}>
          <div className={styles.integrationItem}>
            <span className={styles.integrationIcon}>🤖</span>
            <span>OpenAI</span>
          </div>
          <div className={styles.integrationItem}>
            <span className={styles.integrationIcon}>🧠</span>
            <span>Anthropic</span>
          </div>
          <div className={styles.integrationItem}>
            <span className={styles.integrationIcon}>🐙</span>
            <span>GitHub Copilot SDK</span>
          </div>
          <div className={styles.integrationItem}>
            <span className={styles.integrationIcon}>🐍</span>
            <span>Python SDK</span>
          </div>
          <div className={styles.integrationItem}>
            <span className={styles.integrationIcon}>🔷</span>
            <span>TypeScript SDK</span>
          </div>
          <div className={styles.integrationItem}>
            <span className={styles.integrationIcon}>🐹</span>
            <span>Go SDK</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function UsedBySection() {
  return (
    <section className={styles.usedBy}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <Heading as="h2">Trusted by AI developers</Heading>
          <p>Built for production AI applications.</p>
        </div>
        <div className={styles.statsGrid}>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>&lt;1ms</span>
            <span className={styles.statLabel}>SDK overhead</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>3</span>
            <span className={styles.statLabel}>SDK languages</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>100%</span>
            <span className={styles.statLabel}>Open source</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>5 min</span>
            <span className={styles.statLabel}>Setup time</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className={styles.cta}>
      <div className="container">
        <Heading as="h2">Ready to understand your AI agents?</Heading>
        <p>
          Get started in under 5 minutes. Free tier includes 100K events per
          month.
        </p>
        <div className={styles.buttons}>
          <Link
            className="button button--primary button--lg"
            to="/docs/getting-started"
          >
            Start for Free
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="https://discord.gg/agentops"
          >
            Join Discord
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="AI-Native Observability"
      description="AgentOps provides comprehensive monitoring, debugging, and optimization for AI agent applications. Track sessions, costs, and tool execution with zero configuration."
    >
      <HomepageHeader />
      <main>
        <QuickStartSection />
        <DemoSection />
        <FeaturesSection />
        <IntegrationsSection />
        <UsedBySection />
        <CTASection />
      </main>
    </Layout>
  );
}

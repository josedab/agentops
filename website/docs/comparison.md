# Why AgentOps?

How AgentOps compares to other observability solutions for AI applications.

## The Problem with General-Purpose Tools

Traditional observability tools (Datadog, New Relic, Grafana) are designed for web services and infrastructure—not AI agents. They lack:

- **Semantic understanding** of prompts and responses
- **Token-based cost attribution**
- **Conversation/session grouping**
- **Tool call tracing** for agentic workflows
- **AI-native debugging** capabilities

## Comparison Matrix

| Feature                  | AgentOps            | LangSmith         | Helicone   | Datadog   | Custom      |
| ------------------------ | ------------------- | ----------------- | ---------- | --------- | ----------- |
| **Auto-instrumentation** | ✅ Zero-config      | ⚠️ Decorators     | ⚠️ Proxy   | ❌ Manual | ❌ Build it |
| **Multi-language SDKs**  | ✅ TS/Py/Go         | ⚠️ Python-first   | ⚠️ Limited | ✅ Many   | ❌ DIY      |
| **Session tracing**      | ✅ Native           | ✅ Native         | ⚠️ Basic   | ❌ None   | ❌ DIY      |
| **Cost attribution**     | ✅ Per-user/feature | ⚠️ Basic          | ✅ Good    | ❌ None   | ❌ DIY      |
| **AI debugging**         | ✅ Natural language | ⚠️ Limited        | ❌ None    | ❌ None   | ❌ None     |
| **Semantic diff**        | ✅ Built-in         | ⚠️ Via playground | ❌ None    | ❌ None   | ❌ DIY      |
| **Cost guardrails**      | ✅ Real-time        | ❌ None           | ⚠️ Alerts  | ❌ None   | ❌ DIY      |
| **Self-host option**     | ✅ Yes              | ❌ No             | ❌ No      | ❌ No     | ✅ Yes      |
| **Open source**          | ✅ MIT              | ❌ No             | ⚠️ Partial | ❌ No     | ✅ Yes      |

## AgentOps vs LangSmith

**LangSmith** is great if you're all-in on LangChain. However:

| Aspect                   | AgentOps                 | LangSmith           |
| ------------------------ | ------------------------ | ------------------- |
| **Framework lock-in**    | None—works with any code | LangChain-centric   |
| **Language support**     | TypeScript, Python, Go   | Primarily Python    |
| **Auto-instrumentation** | Wrap any client          | Requires decorators |
| **AI debugging**         | Natural language queries | Manual exploration  |
| **Pricing**              | Transparent, event-based | Per-trace pricing   |
| **Self-hosting**         | Full self-host support   | No self-host        |

**Choose AgentOps if:** You want framework-agnostic observability with strong TypeScript support.

**Choose LangSmith if:** You're building exclusively with LangChain in Python.

## AgentOps vs Helicone

**Helicone** is a proxy-based solution focused on cost tracking:

| Aspect               | AgentOps              | Helicone           |
| -------------------- | --------------------- | ------------------ |
| **Architecture**     | SDK-based             | Proxy-based        |
| **Session grouping** | Native                | Limited            |
| **Tool tracking**    | Full MCP support      | Limited            |
| **Cost guardrails**  | Real-time enforcement | Alerts only        |
| **AI debugging**     | Built-in copilot      | None               |
| **Latency impact**   | Async, ~0ms           | Proxy adds latency |

**Choose AgentOps if:** You need full session tracing and AI debugging.

**Choose Helicone if:** You only need basic cost tracking with minimal setup.

## AgentOps vs Custom Logging

Building your own observability? Consider:

| Aspect            | AgentOps                     | Custom Solution   |
| ----------------- | ---------------------------- | ----------------- |
| **Time to value** | 5 minutes                    | Weeks/months      |
| **Maintenance**   | Managed                      | Your team         |
| **Features**      | Complete                     | What you build    |
| **Cost**          | Usage-based                  | Engineering time  |
| **Scale**         | Built for billions of events | Your architecture |

**Build custom if:** You have very specific requirements and dedicated platform team.

**Use AgentOps if:** You want to ship features instead of building infrastructure.

## What Sets AgentOps Apart

### 1. Zero-Config Auto-Instrumentation

Other tools require decorators, middleware, or code changes:

```typescript
// AgentOps - just wrap your client
const openai = agentops.wrap(new OpenAI());

// vs. typical solutions requiring code changes everywhere
@trace()  // ❌ Decorators on every function
async function myAgent() { ... }
```

### 2. AI-Powered Debugging

Ask questions in natural language:

```typescript
await copilot.ask({
  question: "Why did sessions fail yesterday?",
});
// Returns: "Analysis shows 35 failures due to rate limiting..."
```

No other tool offers this capability.

### 3. Semantic Diff for Agent Behavior

Compare how your agent behaves across versions:

```typescript
const diff = await diffEngine.comparePromptVersions("v1", "v2");
// { assessment: 'improved', metrics: { successRate: +4% } }
```

### 4. Real-Time Cost Guardrails

Prevent runaway costs before they happen:

```typescript
const check = guardrails.checkCost({ userId, estimatedCost: 0.05 });
if (!check.allowed) {
  // Request blocked by budget
}
```

### 5. True Multi-Language Support

First-class SDKs in TypeScript, Python, and Go—not afterthoughts.

## Migration is Easy

Already using another tool? AgentOps works alongside existing instrumentation:

```typescript
// Keep your existing logging
import { logger } from "./your-logger";

// Add AgentOps in one line
const openai = agentops.wrap(new OpenAI());

// Both work together
```

## Get Started

Ready to try AgentOps?

```bash
npm install @agentops/sdk
```

[Get Started →](/docs/getting-started) | [View on GitHub](https://github.com/josedab/agentops)

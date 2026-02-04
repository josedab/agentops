# AgentOps

[![npm version](https://img.shields.io/npm/v/@agentops/sdk.svg)](https://www.npmjs.com/package/@agentops/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Build Status](https://img.shields.io/github/actions/workflow/status/josedab/agentops/ci.yml?branch=main)](https://github.com/josedab/agentops/actions)

> AI-native observability platform for AI agent applications

AgentOps provides comprehensive monitoring, debugging, and optimization capabilities specifically designed for AI-powered systems—tracking prompt quality, model costs, tool execution, decision paths, and outcome metrics in a unified dashboard.

## Why AgentOps?

Building AI agents is hard. Understanding what they're doing is even harder. AgentOps gives you visibility into:

- **What your agents are doing** - Complete session traces showing every prompt, response, and tool call
- **How much it costs** - Real-time cost tracking by user, feature, and model
- **Why things go wrong** - AI-powered debugging to find root causes in natural language
- **How behavior changes** - Semantic diffs to compare agent versions and deployments

## Key Features

| Feature                 | Description                             |
| ----------------------- | --------------------------------------- |
| 🔍 Session Tracing      | Visualize complete agent decision trees |
| 💰 Cost Attribution     | Track costs by feature, user, and model |
| 🔧 Tool Tracking        | Monitor MCP tool execution              |
| 📊 Real-time Dashboards | Live metrics and alerts                 |
| 🤖 AI Debugging Copilot | Natural language investigation          |
| 📈 Semantic Diff        | Compare behavior across versions        |
| 🛡️ Cost Guardrails      | Budget enforcement and spending limits  |

## Quick Install

```bash
npm install @agentops/sdk
```

## Supported Integrations

- **OpenAI** - Full support for chat completions, embeddings, and function calling
- **Anthropic** - Claude models with message and tool use tracking
- **GitHub Copilot SDK** - First-class integration for Copilot extensions
- **Generic** - Works with any async JavaScript/TypeScript function

## Next Steps

- [Getting Started](/docs/getting-started) - Be productive in 5 minutes
- [Core Concepts](/docs/concepts) - Understand the mental model
- [SDK Reference](/docs/sdks/typescript) - Full API documentation

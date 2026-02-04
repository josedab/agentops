# Migration Guides

Step-by-step guides to migrate from other observability tools to AgentOps.

## Available Guides

- [Migrate from LangSmith](/docs/migration/from-langsmith) - Switch from LangChain's observability
- [Migrate from Helicone](/docs/migration/from-helicone) - Switch from Helicone proxy
- [Migrate from Custom Logging](/docs/migration/from-custom-logging) - Replace homegrown solutions

## Why Migrate?

| Capability           | AgentOps    | LangSmith | Helicone | Custom |
| -------------------- | ----------- | --------- | -------- | ------ |
| Multi-language SDK   | ✅ TS/Py/Go | ✅ Python | ❌ Proxy | Varies |
| Auto-instrumentation | ✅          | ✅        | ❌       | ❌     |
| Cost tracking        | ✅          | ❌        | ✅       | Manual |
| AI debugging copilot | ✅          | ❌        | ❌       | ❌     |
| Semantic diff        | ✅          | ✅        | ❌       | ❌     |
| Real-time alerts     | ✅          | ✅        | ✅       | Manual |
| Self-hostable        | ✅          | ❌        | ❌       | ✅     |

## Migration Time

| From           | Estimated Time |
| -------------- | -------------- |
| LangSmith      | 30-60 minutes  |
| Helicone       | 15-30 minutes  |
| Custom logging | 1-2 hours      |

## Need Help?

- [Discord](https://discord.gg/agentops) - Migration support
- [GitHub Discussions](https://github.com/josedab/agentops/discussions) - Ask questions

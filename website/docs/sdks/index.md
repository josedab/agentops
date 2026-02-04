# SDKs

AgentOps provides native SDKs for multiple languages, allowing you to instrument your AI applications regardless of your tech stack.

## Available SDKs

| SDK                                 | Status    | Package                          |
| ----------------------------------- | --------- | -------------------------------- |
| [TypeScript](/docs/sdks/typescript) | ✅ Stable | `@agentops/sdk`                  |
| [Python](/docs/sdks/python)         | ✅ Stable | `agentops`                       |
| [Go](/docs/sdks/go)                 | ✅ Stable | `github.com/josedab/agentops-go` |

## Feature Parity

All SDKs share the same core capabilities:

| Feature              | TypeScript | Python | Go  |
| -------------------- | ---------- | ------ | --- |
| Auto-instrumentation | ✅         | ✅     | ✅  |
| Session tracking     | ✅         | ✅     | ✅  |
| Cost calculation     | ✅         | ✅     | ✅  |
| Event batching       | ✅         | ✅     | ✅  |
| OpenAI support       | ✅         | ✅     | ✅  |
| Anthropic support    | ✅         | ✅     | ✅  |
| Debug Copilot        | ✅         | 🚧     | 🚧  |
| Semantic Diff        | ✅         | 🚧     | 🚧  |
| Cost Guardrails      | ✅         | 🚧     | 🚧  |

## Quick Comparison

### TypeScript

```typescript
import { AgentOps } from "@agentops/sdk";
const agentops = new AgentOps({ apiKey: "..." });
const openai = agentops.wrap(new OpenAI());
```

### Python

```python
import agentops
agentops.init(api_key="...")
client = agentops.wrap(OpenAI())
```

### Go

```go
import "github.com/josedab/agentops-go"
agentops.Init(&agentops.Config{APIKey: "..."})
session := agentops.StartSession()
```

## Choosing an SDK

- **TypeScript** - Full-featured, best for Node.js and Copilot extensions
- **Python** - Great for ML/AI workloads, LangChain integration
- **Go** - Best for high-performance services and microservices

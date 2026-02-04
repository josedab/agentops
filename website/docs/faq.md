# Frequently Asked Questions

## General

### What is AgentOps?

AgentOps is an AI-native observability platform for monitoring, debugging, and optimizing AI agent applications. It tracks sessions, costs, tool execution, and provides AI-powered debugging.

### Is AgentOps open source?

Yes, AgentOps is MIT licensed. See the [GitHub repository](https://github.com/josedab/agentops).

### Which LLM providers are supported?

- OpenAI (GPT-4, GPT-4o, GPT-3.5, o1)
- Anthropic (Claude 3.5, Claude 3)
- GitHub Copilot SDK
- Any LLM via manual tracking

### What languages are supported?

- TypeScript/JavaScript (primary)
- Python
- Go

## Pricing

### Is there a free tier?

Yes! The free tier includes:

- 100K events/month
- 7-day data retention
- Basic tracing

### How is pricing calculated?

Pricing is based on events ingested per month. See [Pricing](https://agentops.dev/pricing) for details.

## Technical

### How much overhead does the SDK add?

Less than 1ms per LLM call. Events are buffered and sent asynchronously.

### Does AgentOps work offline?

The SDK buffers events locally. If the ingest endpoint is unreachable, events queue up and send when connectivity returns.

### How long is data retained?

| Tier       | Retention |
| ---------- | --------- |
| Free       | 7 days    |
| Pro        | 30 days   |
| Team       | 90 days   |
| Enterprise | Custom    |

### Is my data encrypted?

Yes:

- TLS 1.3 in transit
- AES-256 at rest
- API keys hashed (never stored in plain text)

### Can I self-host?

Yes. See the [infrastructure docs](https://github.com/josedab/agentops/tree/main/infrastructure) for Docker and Terraform configurations.

## Privacy & Security

### What data does AgentOps collect?

- Prompt and response content
- Token usage and costs
- Timing and latency
- Error messages
- Custom metadata you provide

### Can I redact sensitive data?

Yes. Configure PII redaction in project settings or filter client-side before tracking.

### Is AgentOps SOC 2 compliant?

Enterprise tier includes SOC 2 compliance. Contact sales for details.

## Support

### How do I get help?

- [Discord Community](https://discord.gg/agentops)
- [GitHub Discussions](https://github.com/josedab/agentops/discussions)
- [GitHub Issues](https://github.com/josedab/agentops/issues)
- Enterprise: Dedicated support

### How do I report a bug?

Open an issue on [GitHub](https://github.com/josedab/agentops/issues/new).

### How do I request a feature?

Start a discussion on [GitHub Discussions](https://github.com/josedab/agentops/discussions/new?category=ideas).

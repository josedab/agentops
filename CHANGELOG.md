# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- CodeQL security scanning in CI pipeline
- GitHub issue templates (bug report, feature request)
- GitHub pull request template
- CONTRIBUTING.md with development guidelines
- LICENSE file (MIT)

### Fixed

- Memory leak in SDK client caused by event listeners not being removed on shutdown

## [0.1.0] - 2024-01-30

### Added

- Initial release of AgentOps SDK
- **TypeScript SDK** (`@agentops/sdk`)
  - Session tracking and management
  - Automatic instrumentation via `wrap()` for OpenAI, Anthropic, and Copilot SDK
  - Manual tracking API for prompts, responses, tools, and errors
  - Cost calculation with model pricing
  - Event buffering with configurable flush intervals
  - Graceful shutdown handling
- **Advanced Features**
  - AI Debugging Copilot - Natural language interface for session investigation
  - Semantic Diff Engine - Compare agent behavior across versions
  - Cost Guardrails - Real-time spending limits and budget enforcement
  - Quality Evaluator - Score agent responses against rubrics
  - Anomaly Detection - Identify unusual patterns in agent behavior
  - Multi-Agent Tracing - Correlate events across agent systems
  - Prompt Registry - Version control and A/B testing for prompts
  - Context Window Analyzer - Optimize token usage
  - Compliance Manager - PII detection and audit logging
  - Budget Manager - Forecasting and cost allocation
  - Root Cause Analyzer - Automated failure analysis
  - Predictive Alerting - Forecast-based alerts
  - Benchmark Marketplace - Share and run agent benchmarks
  - IDE Integration Service - In-editor annotations and cost estimates
  - Team Collaboration - Investigations and annotations
- **Python SDK** (`agentops`)
  - Core session tracking
  - OpenAI and Anthropic integrations
  - Async support
- **Go SDK** (`agentops-go`)
  - Core client implementation
  - OpenAI integration
- **Dashboard** (Next.js)
  - Session explorer
  - Cost analytics
  - Real-time alerts
- **API Server** (Hono)
  - REST API for sessions, events, and metrics
- **Ingestion Workers** (Cloudflare Workers)
  - High-throughput event ingestion
- **Infrastructure**
  - Docker Compose for local development
  - ClickHouse for analytics
  - PostgreSQL for metadata
  - Redis for caching
  - Redpanda for event streaming
  - Terraform modules for cloud deployment

[Unreleased]: https://github.com/josedab/agentops/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/josedab/agentops/releases/tag/v0.1.0

# Product Requirements Document: AgentOps

## Observability Platform for AI Agents

**Document Version:** 1.0  
**Last Updated:** January 28, 2026  
**Author:** Jose David Baena  
**Status:** Draft  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Market Analysis](#3-market-analysis)
4. [Target Users & Personas](#4-target-users--personas)
5. [Product Vision & Strategy](#5-product-vision--strategy)
6. [Features & Requirements](#6-features--requirements)
7. [Technical Architecture](#7-technical-architecture)
8. [User Stories & Use Cases](#8-user-stories--use-cases)
9. [User Experience & Design](#9-user-experience--design)
10. [Success Metrics & KPIs](#10-success-metrics--kpis)
11. [Competitive Analysis](#11-competitive-analysis)
12. [Go-to-Market Strategy](#12-go-to-market-strategy)
13. [Monetization Strategy](#13-monetization-strategy)
14. [Risks & Mitigations](#14-risks--mitigations)
15. [Roadmap & Milestones](#15-roadmap--milestones)
16. [Dependencies & Constraints](#16-dependencies--constraints)
17. [Appendices](#17-appendices)

---

## 1. Executive Summary

### 1.1 Product Overview

AgentOps is a purpose-built observability platform for AI agent applications. It provides comprehensive monitoring, debugging, and optimization capabilities specifically designed for the unique characteristics of AI-powered systems—tracking prompt quality, model costs, tool execution, decision paths, and outcome metrics in a unified dashboard.

### 1.2 Value Proposition

**For teams building AI agent applications**, AgentOps provides the visibility and insights needed to understand why agents behave the way they do, optimize costs, improve reliability, and debug issues—capabilities that traditional observability tools were never designed to deliver.

### 1.3 Key Differentiators

- **AI-Native Observability:** Designed for AI workloads, not adapted from traditional APM
- **Copilot SDK Native:** First-class integration with GitHub Copilot SDK
- **Full Agent Tracing:** Visualize complete decision trees, not just API calls
- **Cost Attribution:** Per-feature, per-user, per-session cost breakdown
- **Outcome Correlation:** Connect agent actions to business results

### 1.4 Business Opportunity

- **Target Market Size:** $8-15B AI observability market by 2030 (within $62.9B total observability)
- **Revenue Model:** Usage-based pricing ($0.001-0.01/event) with platform fees
- **Primary Customers:** Teams building AI agent applications (10K+ potential customers by 2027)

---

## 2. Problem Statement

### 2.1 The AI Observability Gap

Traditional observability tools (Datadog, New Relic, Grafana) were built to answer questions like "did the API return 200?" and "what was the p99 latency?" They're fundamentally unable to answer the questions AI teams need:

**Questions Traditional Tools Can't Answer:**
- Why did the agent choose action A over action B?
- What context was the model using when it made that decision?
- Which prompts are performing poorly?
- How much is this feature costing us in LLM spend?
- Why did the agent hallucinate in this session?

### 2.2 Current State of AI Observability

**Stack Overflow 2025 Survey:**
- 43% of developers use traditional monitoring (Grafana/Prometheus) for AI applications
- Only 12% use AI-specific observability tools
- 38% report "flying blind" with AI systems

**The Gap:**

| Need | Traditional Tools | AI-Specific Need |
|------|-------------------|------------------|
| Request tracing | HTTP requests | Multi-step agent reasoning |
| Error detection | Exceptions, status codes | Hallucinations, poor outputs |
| Performance | Latency, throughput | Token usage, model selection |
| Debugging | Stack traces | Prompt inspection, context review |
| Cost monitoring | Infrastructure | Per-token, per-model costs |

### 2.3 Why Existing Solutions Fall Short

#### LangSmith (LangChain)
- Tightly coupled to LangChain framework
- Limited support for non-LangChain agents
- No Copilot SDK native integration

#### Weights & Biases
- ML experiment focused, not production observability
- Overkill for agent monitoring
- Different mental model (experiments vs. production)

#### Helicone / PromptLayer
- Prompt-level only, no agent orchestration visibility
- Limited tool execution tracking
- Basic dashboards

#### Traditional APM (Datadog, New Relic)
- Can trace API calls but miss AI semantics
- No prompt/response inspection
- No model cost attribution
- No agent decision tree visualization

### 2.4 The Opportunity

AgentOps addresses the observability gap by providing:
1. **Native AI semantics** in all tracing and monitoring
2. **Copilot SDK first-class integration** for the growing ecosystem
3. **Decision tree visualization** for understanding agent behavior
4. **Cost attribution** down to feature and user level
5. **Quality metrics** that correlate with business outcomes

---

## 3. Market Analysis

### 3.1 Market Size & Growth

**Total Addressable Market (TAM):**
- Observability market: $62.9B by 2030 (Gartner)
- Growing at 12% CAGR

**Serviceable Addressable Market (SAM):**
- AI/ML observability: $8-15B by 2030
- Fastest growing segment within observability

**Serviceable Obtainable Market (SOM):**
- Agent-specific observability: $1-3B by 2028
- Based on: 100K+ AI agent deployments, $1K-10K/month average spend

### 3.2 Market Trends

**Favorable Trends:**
1. **AI Agent Explosion:** Every company building AI agents (95% fail rate creates observability demand)
2. **Cost Pressure:** LLM costs significant, need visibility for optimization
3. **Reliability Requirements:** Production AI needs production-grade observability
4. **Copilot SDK Adoption:** New ecosystem without established observability leader

**Growth Drivers:**
- Enterprise AI initiatives requiring governance and visibility
- Regulatory requirements (EU AI Act) demanding explainability
- Cost optimization pressure as AI scales

### 3.3 Industry Analysis

**Porter's Five Forces:**

| Force | Assessment | Implication |
|-------|------------|-------------|
| New Entrants | Medium | AI observability requires specialized expertise |
| Buyer Power | Low | Few alternatives, high switching costs |
| Supplier Power | Low | Multi-cloud, multiple LLM providers |
| Substitutes | Medium | Traditional APM attempting to add AI features |
| Rivalry | Medium | LangSmith, Helicone, but fragmented |

---

## 4. Target Users & Personas

### 4.1 Primary Personas

#### Persona 1: Priya - AI/ML Engineer

**Demographics:**
- Title: Senior ML Engineer / AI Engineer
- Experience: 3-7 years
- Focus: Building AI-powered features

**Goals:**
- Understand why agents behave unexpectedly
- Debug production issues quickly
- Optimize prompts for quality and cost

**Pain Points:**
- Can't see what's happening inside agent sessions
- Debugging AI is like debugging a black box
- No good way to trace multi-step agent workflows

**Quote:** *"When something goes wrong, I have no idea where in the agent's reasoning it failed."*

---

#### Persona 2: David - Platform Engineer

**Demographics:**
- Title: Platform Engineer / Infrastructure Lead
- Experience: 8+ years (including distributed systems)
- Focus: Developer productivity, infrastructure

**Goals:**
- Provide reliable AI infrastructure to teams
- Control and optimize AI costs
- Standardize AI observability across org

**Pain Points:**
- Each team instruments AI differently
- Can't aggregate AI metrics across services
- Traditional tools don't understand AI semantics

**Quote:** *"I need to give our AI teams the same observability experience our backend teams have."*

---

#### Persona 3: Elena - Engineering Manager

**Demographics:**
- Title: Engineering Manager / Director
- Team: 10-30 engineers building AI features
- Accountability: Cost, quality, velocity

**Goals:**
- Control AI spending
- Ensure AI quality before production
- Report on AI feature performance

**Pain Points:**
- AI costs are unpredictable
- Hard to attribute costs to features
- No way to measure AI quality improvements

**Quote:** *"My cloud bill doubled but I can't tell which AI feature is responsible."*

---

### 4.2 Secondary Personas

#### Persona 4: Security/Compliance Officer
- Needs audit logs of AI decisions
- Requires explainability for regulatory compliance
- Wants alerting on policy violations

#### Persona 5: Product Manager
- Wants to see AI feature usage and outcomes
- Needs cost/benefit analysis for AI features
- Requires user-level AI interaction data

### 4.3 User Segmentation

| Segment | Size | Monthly Spend | Primary Value |
|---------|------|---------------|---------------|
| Enterprise | 5,000 orgs | $5K-50K | Governance, scale, compliance |
| Mid-Market | 25,000 orgs | $500-5K | Cost control, debugging |
| Startup | 100,000 orgs | $50-500 | Visibility, optimization |
| Individual | Millions | $0-50 | Learning, side projects |

---

## 5. Product Vision & Strategy

### 5.1 Vision Statement

**"Become the standard observability layer for AI agent applications—giving teams the same confidence in their AI systems that they have in their traditional infrastructure."**

### 5.2 Mission

To eliminate the "black box" nature of AI agents by providing comprehensive, AI-native observability that enables teams to build, debug, and optimize AI applications with confidence.

### 5.3 Strategic Pillars

#### Pillar 1: AI-Native Semantics
Every metric, trace, and dashboard designed for AI workloads from the ground up.

#### Pillar 2: Developer Experience
Drop-in SDK integration, beautiful visualizations, minimal configuration.

#### Pillar 3: Cost Intelligence
Complete cost visibility and optimization recommendations.

#### Pillar 4: Enterprise Ready
Security, compliance, and scale for the largest AI deployments.

### 5.4 Product Principles

1. **Lightweight Integration:** Minimal performance overhead, no code changes required
2. **Real-Time Visibility:** Streaming data, not batch analysis
3. **Actionable Insights:** Every dashboard answers "what should I do?"
4. **Privacy by Design:** Configurable data retention, PII handling

### 5.5 Success Criteria

**Year 1:**
- 5,000 active projects
- $3M ARR
- 99.9% ingestion reliability
- Integration with 3+ major AI frameworks

**Year 3:**
- 50,000 active projects
- $40M ARR
- Industry standard for AI observability
- Platform ecosystem with 50+ integrations

---

## 6. Features & Requirements

### 6.1 Feature Overview

| Feature | Priority | Phase | Description |
|---------|----------|-------|-------------|
| SDK Instrumentation | P0 | MVP | Automatic tracing for Copilot SDK |
| Session Tracing | P0 | MVP | Full agent session visualization |
| Cost Attribution | P0 | MVP | Per-token, per-feature cost tracking |
| Real-Time Dashboard | P0 | MVP | Live metrics and traces |
| Alerting | P1 | V1.1 | Threshold and anomaly-based alerts |
| Prompt Analytics | P1 | V1.1 | Prompt performance scoring |
| Tool Execution Tracing | P0 | MVP | MCP tool call tracking |
| Quality Metrics | P1 | V1.1 | LLM-as-judge quality scoring |
| Export/API | P1 | V1.1 | Data export, query API |
| Enterprise Features | P2 | V1.2 | SSO, RBAC, compliance |

### 6.2 Functional Requirements

#### FR-001: SDK Instrumentation

**Description:** Lightweight wrapper that automatically instruments Copilot SDK applications.

**Acceptance Criteria:**
- Zero-config instrumentation via wrapper import
- <1% performance overhead
- Captures: sessions, prompts, responses, tool calls, timing
- Async/streaming support

**SDK Integration:**

```typescript
// Before (standard Copilot SDK)
import { CopilotClient } from "@github/copilot-sdk";
const client = new CopilotClient();

// After (with AgentOps instrumentation)
import { CopilotClient } from "@github/copilot-sdk";
import { AgentOps } from "agentops-sdk";

const agentOps = new AgentOps({ apiKey: process.env.AGENTOPS_API_KEY });
const client = agentOps.wrap(new CopilotClient());

// Everything else works exactly the same
// AgentOps automatically captures all sessions, prompts, tool calls
```

---

#### FR-002: Session Tracing

**Description:** Visualize complete agent sessions as decision trees.

**Acceptance Criteria:**
- Hierarchical view of session events
- Expand/collapse prompt/response pairs
- Show tool execution with inputs/outputs
- Timeline view with latencies
- Filter by session attributes

**Trace Data Model:**

```typescript
interface AgentSession {
  session_id: string;
  user_id?: string;
  feature_id?: string;
  model: string;
  started_at: Date;
  ended_at?: Date;
  events: SessionEvent[];
  metadata: Record<string, any>;
  total_tokens: number;
  total_cost: number;
  outcome?: SessionOutcome;
}

interface SessionEvent {
  event_id: string;
  parent_event_id?: string;
  type: 'prompt' | 'response' | 'tool_call' | 'tool_result' | 'error';
  timestamp: Date;
  duration_ms: number;
  content: EventContent;
  tokens?: TokenUsage;
  cost?: number;
  metadata?: Record<string, any>;
}

interface EventContent {
  role?: 'user' | 'assistant' | 'system' | 'tool';
  text?: string;
  tool_name?: string;
  tool_input?: any;
  tool_output?: any;
  model?: string;
}
```

---

#### FR-003: Cost Attribution

**Description:** Track and attribute LLM costs at multiple granularities.

**Acceptance Criteria:**
- Per-token cost tracking by model
- Attribution to: feature, user, session, team
- Historical cost trends
- Budget alerts and forecasting
- Cost per successful outcome

**Cost Dimensions:**

```
Cost Attribution Hierarchy
├── Organization
│   ├── Team A
│   │   ├── Feature: Code Review Agent
│   │   │   ├── Model: GPT-5 ($12,340)
│   │   │   ├── Model: Claude 4.5 ($3,210)
│   │   │   └── MCP Tool Calls ($456)
│   │   └── Feature: Doc Generator
│   │       └── ...
│   └── Team B
│       └── ...
└── By User
    ├── User 123: $234.56
    ├── User 456: $123.45
    └── ...
```

---

#### FR-004: Real-Time Dashboard

**Description:** Live view of AI system health and performance.

**Acceptance Criteria:**
- <5 second data freshness
- Customizable widgets
- Pre-built dashboards for common use cases
- Drill-down from metrics to traces
- Shareable dashboard links

**Default Dashboard Widgets:**

| Widget | Metric | Visualization |
|--------|--------|---------------|
| Sessions/Minute | Session volume | Line chart |
| Error Rate | Failed sessions % | Gauge |
| Token Usage | Tokens by model | Stacked area |
| Cost/Hour | Hourly spend | Line + trend |
| Latency P50/P95 | Response time | Histogram |
| Top Errors | Error aggregation | Table |
| Tool Success Rate | Tool execution | Bar chart |

---

#### FR-005: Tool Execution Tracing

**Description:** Track MCP tool calls with full context.

**Acceptance Criteria:**
- Capture all tool invocations
- Record inputs and outputs
- Track latency and errors
- Link to parent session
- Aggregate tool performance metrics

**Tool Trace Example:**

```json
{
  "tool_call_id": "tc_abc123",
  "session_id": "sess_xyz789",
  "tool_name": "web_search",
  "mcp_server": "web-search-mcp",
  "started_at": "2026-01-28T10:30:00Z",
  "duration_ms": 1234,
  "status": "success",
  "input": {
    "query": "latest AI research papers"
  },
  "output": {
    "results_count": 10,
    "truncated": true
  },
  "error": null,
  "metadata": {
    "retry_count": 0,
    "cache_hit": false
  }
}
```

---

#### FR-006: Prompt Analytics

**Description:** Analyze prompt effectiveness and quality.

**Acceptance Criteria:**
- Track prompt versions and performance
- A/B comparison capabilities
- Quality scoring via LLM-as-judge
- Token efficiency metrics
- Prompt template management

**Prompt Metrics:**

| Metric | Description | Calculation |
|--------|-------------|-------------|
| Quality Score | Output quality rating | LLM-as-judge (1-10) |
| Token Efficiency | Output value per token | Quality / Input tokens |
| Success Rate | % achieving goal | User feedback + heuristics |
| Latency | Time to first token | Timing measurement |
| Cost Efficiency | Quality per dollar | Quality / Cost |

---

#### FR-007: Alerting

**Description:** Proactive alerts for AI system issues.

**Acceptance Criteria:**
- Threshold-based alerts (cost, error rate, latency)
- Anomaly detection alerts
- Multiple notification channels (Slack, PagerDuty, email)
- Alert grouping and deduplication
- Runbook integration

**Alert Types:**

```yaml
# Example alert configurations
alerts:
  - name: "High Error Rate"
    condition: "error_rate > 5%"
    window: "5m"
    severity: "critical"
    channels: ["pagerduty", "slack"]
    
  - name: "Cost Anomaly"
    condition: "hourly_cost > 2x 7d_average"
    severity: "warning"
    channels: ["slack", "email"]
    
  - name: "Quality Degradation"
    condition: "avg_quality_score < 6"
    window: "1h"
    severity: "warning"
    channels: ["slack"]
```

---

### 6.3 Non-Functional Requirements

#### NFR-001: Performance

| Metric | Requirement |
|--------|-------------|
| Ingestion Latency | <100ms P99 |
| Query Latency | <500ms P95 |
| Dashboard Load | <2s initial load |
| Throughput | 1M events/second |

#### NFR-002: Reliability

| Metric | Requirement |
|--------|-------------|
| Availability | 99.9% uptime |
| Data Durability | 99.999999999% |
| Recovery Time | <15 minutes |

#### NFR-003: Scalability

| Dimension | Requirement |
|-----------|-------------|
| Events/Day | 100B+ |
| Concurrent Users | 10,000+ |
| Data Retention | 90 days default, configurable |
| Query Performance | <5s for 30-day queries |

#### NFR-004: Security

| Requirement | Description |
|-------------|-------------|
| Encryption | AES-256 at rest, TLS 1.3 in transit |
| PII Handling | Automatic detection, configurable redaction |
| Access Control | RBAC, API key scopes |
| Compliance | SOC 2 Type II, GDPR, HIPAA-ready |

---

## 7. Technical Architecture

### 7.1 System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AgentOps Architecture                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        Customer Applications                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │   │
│  │  │  Copilot    │  │  LangChain  │  │   Custom    │                   │   │
│  │  │  SDK App    │  │    Agent    │  │   Agent     │                   │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                   │   │
│  │         │                │                │                           │   │
│  │         └────────────────┴────────────────┘                           │   │
│  │                          │                                            │   │
│  │                    AgentOps SDK                                       │   │
│  └──────────────────────────┼───────────────────────────────────────────┘   │
│                             │                                                │
│                             ▼                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      Ingestion Layer                                  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │   │
│  │  │   Edge      │  │   Load      │  │   Schema    │                   │   │
│  │  │   Ingest    │──▶│   Balancer │──▶│  Validation│                   │   │
│  │  │   (Global)  │  │             │  │             │                   │   │
│  │  └─────────────┘  └─────────────┘  └──────┬──────┘                   │   │
│  └───────────────────────────────────────────┼──────────────────────────┘   │
│                                              │                               │
│                                              ▼                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     Processing Layer                                  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │   │
│  │  │   Kafka     │  │   Flink     │  │   Cost      │                   │   │
│  │  │   (Events)  │──▶│(Real-time) │──▶│  Calculator│                   │   │
│  │  └─────────────┘  └─────────────┘  └──────┬──────┘                   │   │
│  └───────────────────────────────────────────┼──────────────────────────┘   │
│                                              │                               │
│                                              ▼                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                       Storage Layer                                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │   │
│  │  │ ClickHouse  │  │   Redis     │  │  Postgres   │                   │   │
│  │  │(Time-series)│  │  (Cache)    │  │ (Metadata)  │                   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                              │                               │
│                                              ▼                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        Query Layer                                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │   │
│  │  │   API       │  │  Dashboard  │  │   Alerts    │                   │   │
│  │  │   Gateway   │  │   Backend   │  │   Engine    │                   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Component Architecture

#### 7.2.1 SDK Layer

**Responsibility:** Instrument client applications with minimal overhead

**Technology:**
- TypeScript SDK for Node.js
- Python SDK for Python applications
- Go SDK for Go applications

**Instrumentation Approach:**

```typescript
// TypeScript SDK Implementation
export class AgentOps {
  private readonly apiKey: string;
  private readonly buffer: EventBuffer;
  private readonly transport: Transport;
  
  constructor(config: AgentOpsConfig) {
    this.apiKey = config.apiKey;
    this.buffer = new EventBuffer({ 
      maxSize: 1000,
      flushInterval: 1000 
    });
    this.transport = new Transport({ endpoint: config.endpoint });
  }
  
  wrap<T extends CopilotClient>(client: T): T {
    return new Proxy(client, {
      get: (target, prop) => {
        if (prop === 'createSession') {
          return this.wrapCreateSession(target.createSession.bind(target));
        }
        return target[prop as keyof T];
      }
    });
  }
  
  private wrapCreateSession(original: Function) {
    return async (config: SessionConfig) => {
      const sessionId = generateSessionId();
      const startTime = Date.now();
      
      // Track session start
      this.track({
        type: 'session_start',
        session_id: sessionId,
        config,
        timestamp: startTime
      });
      
      const session = await original(config);
      
      // Wrap session methods
      return this.wrapSession(session, sessionId);
    };
  }
  
  private wrapSession(session: Session, sessionId: string) {
    const originalSend = session.sendAndWait.bind(session);
    
    session.sendAndWait = async (message: Message) => {
      const eventId = generateEventId();
      const startTime = Date.now();
      
      this.track({
        type: 'prompt',
        session_id: sessionId,
        event_id: eventId,
        content: message,
        timestamp: startTime
      });
      
      try {
        const response = await originalSend(message);
        
        this.track({
          type: 'response',
          session_id: sessionId,
          event_id: eventId,
          content: response,
          duration_ms: Date.now() - startTime,
          tokens: response.usage
        });
        
        return response;
      } catch (error) {
        this.track({
          type: 'error',
          session_id: sessionId,
          event_id: eventId,
          error: serializeError(error),
          duration_ms: Date.now() - startTime
        });
        throw error;
      }
    };
    
    return session;
  }
  
  private track(event: AgentEvent) {
    this.buffer.add(event);
  }
}
```

---

#### 7.2.2 Ingestion Layer

**Responsibility:** Receive and validate events at scale

**Technology:**
- Edge workers (Cloudflare/Fastly) for global ingestion
- Protocol Buffers for efficient serialization
- Schema validation with JSON Schema

**Capacity Design:**
- Target: 1M events/second sustained
- Buffer: 10 seconds of traffic
- Backpressure: HTTP 429 with Retry-After

---

#### 7.2.3 Processing Layer

**Responsibility:** Real-time event processing, enrichment, aggregation

**Technology:**
- Apache Kafka for event streaming
- Apache Flink for stream processing
- Custom cost calculator service

**Stream Processing Jobs:**

```java
// Flink job for real-time aggregations
public class SessionAggregator {
  public void process(DataStream<AgentEvent> events) {
    events
      .keyBy(event -> event.getSessionId())
      .window(SessionWindows.withGap(Time.minutes(5)))
      .aggregate(new SessionMetricsAggregator())
      .addSink(new ClickHouseSink());
  }
}

public class CostCalculator {
  private final Map<String, ModelPricing> pricing;
  
  public CostEvent calculate(AgentEvent event) {
    if (event.getType() != EventType.RESPONSE) return null;
    
    ModelPricing price = pricing.get(event.getModel());
    double cost = 
      (event.getPromptTokens() * price.inputPer1K / 1000) +
      (event.getCompletionTokens() * price.outputPer1K / 1000);
    
    return new CostEvent(event.getSessionId(), cost, event.getTimestamp());
  }
}
```

---

#### 7.2.4 Storage Layer

**Responsibility:** Persist events and aggregations for querying

**Technology:**
- ClickHouse for time-series event data
- Redis for real-time caches and recent data
- PostgreSQL for metadata and configuration

**ClickHouse Schema:**

```sql
CREATE TABLE agent_events (
    event_id UUID,
    session_id String,
    project_id String,
    user_id String,
    feature_id String,
    event_type Enum8('session_start', 'prompt', 'response', 'tool_call', 'tool_result', 'error'),
    model String,
    prompt_tokens UInt32,
    completion_tokens UInt32,
    cost Decimal64(6),
    duration_ms UInt32,
    content String,
    metadata String,
    timestamp DateTime64(3),
    INDEX idx_session session_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_project project_id TYPE bloom_filter GRANULARITY 1
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, timestamp, session_id)
TTL timestamp + INTERVAL 90 DAY;

-- Materialized view for real-time dashboards
CREATE MATERIALIZED VIEW session_metrics_1m
ENGINE = SummingMergeTree()
ORDER BY (project_id, model, minute)
AS SELECT
    project_id,
    model,
    toStartOfMinute(timestamp) AS minute,
    count() AS event_count,
    countIf(event_type = 'error') AS error_count,
    sum(prompt_tokens) AS total_prompt_tokens,
    sum(completion_tokens) AS total_completion_tokens,
    sum(cost) AS total_cost,
    avg(duration_ms) AS avg_duration
FROM agent_events
GROUP BY project_id, model, minute;
```

---

### 7.3 Data Flow

```
1. Agent application makes Copilot SDK call
         │
         ▼
2. AgentOps SDK intercepts and records event
         │
         ▼
3. Event buffered locally (1 second / 1000 events)
         │
         ▼
4. Batch sent to nearest edge ingestion point
         │
         ▼
5. Event validated, enriched, published to Kafka
         │
         ▼
6. Flink processes in real-time:
   - Calculate costs
   - Update aggregations
   - Check alert conditions
         │
         ▼
7. Events written to ClickHouse
         │
         ▼
8. Dashboard queries via API gateway
```

### 7.4 Infrastructure (Leveraging Distributed Systems Expertise)

This architecture leverages patterns from high-scale background job processing:

**Key Design Decisions:**

1. **Kafka as Event Backbone:** Same pattern as GitHub's 25B jobs/day—reliable, partitioned, replayable
2. **ClickHouse for Analytics:** Column-oriented, compression, fast aggregations
3. **Redis for Real-Time:** Sub-second dashboard updates, alert state
4. **Edge Ingestion:** Minimize client-side latency impact

**Scaling Strategy:**

| Load | Kafka Partitions | Flink Workers | ClickHouse Shards |
|------|------------------|---------------|-------------------|
| 10K events/s | 16 | 4 | 1 |
| 100K events/s | 64 | 16 | 3 |
| 1M events/s | 256 | 64 | 12 |

---

## 8. User Stories & Use Cases

### 8.1 Epic: Agent Debugging

#### US-001: Trace Agent Session
**As a** developer  
**I want** to see the complete trace of an agent session  
**So that** I can understand why the agent behaved a certain way  

**Acceptance Criteria:**
- View all events in session chronologically
- Expand to see full prompts and responses
- See tool calls with inputs/outputs
- View timing breakdown

---

#### US-002: Debug Production Issue
**As an** on-call engineer  
**I want** to quickly find failing sessions  
**So that** I can diagnose and fix production issues  

**Acceptance Criteria:**
- Filter sessions by error type
- See error messages and stack traces
- Compare failing sessions to successful ones
- Link to relevant logs

---

### 8.2 Epic: Cost Management

#### US-003: Track Feature Costs
**As an** engineering manager  
**I want** to see costs broken down by feature  
**So that** I can optimize high-cost areas  

**Acceptance Criteria:**
- Cost attribution by feature tag
- Trend charts showing cost over time
- Drill-down from feature to sessions
- Cost per successful outcome

---

#### US-004: Set Budget Alerts
**As a** finance stakeholder  
**I want** to be alerted when AI costs exceed budget  
**So that** I can take action before overspending  

**Acceptance Criteria:**
- Configure daily/weekly/monthly budgets
- Alert when approaching threshold
- Alert when threshold exceeded
- Show forecast based on current trajectory

---

### 8.3 Use Case Scenarios

#### Scenario 1: Debugging Unexpected Agent Behavior

**Context:** Customer reports agent gave incorrect answer.

**Flow:**
1. Support finds session ID from logs
2. Opens session trace in AgentOps
3. Sees agent made correct tool call
4. But tool returned stale data
5. Identifies MCP server caching issue
6. Fixes cache TTL configuration

**Without AgentOps:** Hours of log analysis, unclear root cause.
**With AgentOps:** 10-minute diagnosis with clear evidence.

---

#### Scenario 2: Cost Optimization

**Context:** AI costs doubled last month.

**Flow:**
1. Open cost dashboard
2. See 60% of cost from one feature
3. Drill into feature sessions
4. Notice system prompts are very long
5. Optimize prompt, reduce tokens by 40%
6. Cost returns to normal

**Impact:** $10K/month savings identified and fixed in one hour.

---

## 9. User Experience & Design

### 9.1 Dashboard Design

#### Session Trace View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Session: sess_abc123                                        ⬛ Copy ID     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Status: ✅ Success | Duration: 4.2s | Cost: $0.0234 | Tokens: 3,456       │
│  Model: gpt-5 | Feature: code-review | User: user_789                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Timeline                                                                    │
│  ────────────────────────────────────────────────────────────────────────── │
│  0s        1s        2s        3s        4s                                 │
│  ├─────────┼─────────┼─────────┼─────────┤                                 │
│  │▓▓▓▓▓▓▓▓│         │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓│                        │
│  │ Prompt │ Tool    │ LLM Processing    │Response│                         │
│  └────────┴─────────┴───────────────────┴────────┘                         │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Events                                                                      │
│  ────────────────────────────────────────────────────────────────────────── │
│                                                                              │
│  ▼ 10:30:00.000 | System Prompt                        245 tokens | $0.002  │
│    ┌─────────────────────────────────────────────────────────────────┐     │
│    │ You are a code review assistant...                              │     │
│    └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ▼ 10:30:00.050 | User Prompt                          128 tokens | $0.001  │
│    ┌─────────────────────────────────────────────────────────────────┐     │
│    │ Review this PR for security issues: [diff content]              │     │
│    └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ▶ 10:30:00.100 | Tool Call: get_context              456ms | Success      │
│                                                                              │
│  ▼ 10:30:03.200 | Assistant Response                  1,234 tokens | $0.02  │
│    ┌─────────────────────────────────────────────────────────────────┐     │
│    │ I found 2 potential security issues:                            │     │
│    │ 1. SQL injection vulnerability in line 42...                    │     │
│    └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Cost Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Cost Analytics                                    This Month: $12,345.67   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Daily Cost Trend                                                           │
│  $800 ┤                              ╭─────╮                                │
│  $600 ┤        ╭──────╮    ╭────────╯     │                                │
│  $400 ┤───────╯      ╰────╯               ╰──────                          │
│  $200 ┤                                                                     │
│       └─────────────────────────────────────────────────────────────────    │
│        Jan 1                        Jan 14                        Jan 28    │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Cost by Feature                              Cost by Model                  │
│  ┌────────────────────────────────┐          ┌─────────────────────────────┐│
│  │ Code Review      ████████ 45% │          │ GPT-5         ██████████ 62%││
│  │ Doc Generator    █████░░░ 28% │          │ Claude 4.5    ████░░░░░ 25% ││
│  │ Chat Assistant   ███░░░░░ 15% │          │ GPT-4.1       ██░░░░░░░ 13% ││
│  │ Other            █░░░░░░░ 12% │          └─────────────────────────────┘│
│  └────────────────────────────────┘                                         │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Top Cost Sessions                                                          │
│  ├── sess_abc123 | Code Review | $2.34 | 45,678 tokens | Jan 28            │
│  ├── sess_def456 | Doc Gen     | $1.89 | 34,567 tokens | Jan 28            │
│  └── sess_ghi789 | Chat        | $1.23 | 23,456 tokens | Jan 27            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Success Metrics & KPIs

### 10.1 Product Metrics

| Metric | Definition | Target (Y1) |
|--------|------------|-------------|
| Active Projects | Projects sending data in last 7 days | 5,000 |
| Events Ingested | Total events per day | 1B |
| Dashboard DAU | Daily active dashboard users | 2,000 |
| Alert Volume | Alerts triggered per day | 10,000 |

### 10.2 Business Metrics

| Metric | Definition | Target (Y1) |
|--------|------------|-------------|
| ARR | Annual Recurring Revenue | $3M |
| Net Revenue Retention | Annual renewal + expansion | 120% |
| Gross Margin | Revenue - COGS | 65% |
| CAC Payback | Months to recover CAC | 8 |

### 10.3 Technical Metrics

| Metric | Target |
|--------|--------|
| Ingestion Availability | 99.99% |
| P99 Query Latency | <1s |
| Data Freshness | <5s |

---

## 11. Competitive Analysis

### 11.1 Competitor Comparison

| Feature | AgentOps | LangSmith | Helicone | Datadog APM |
|---------|----------|-----------|----------|-------------|
| Copilot SDK Native | ✅ | ❌ | ❌ | ❌ |
| Agent Decision Trees | ✅ | ✅ | ❌ | ❌ |
| Cost Attribution | ✅ | ✅ | ✅ | Limited |
| Tool Execution Tracing | ✅ | ✅ | ❌ | ❌ |
| Framework Agnostic | ✅ | ❌ (LangChain) | ✅ | ✅ |
| Real-time Dashboards | ✅ | ✅ | ✅ | ✅ |
| Enterprise Ready | Planned | ✅ | Limited | ✅ |

### 11.2 Competitive Positioning

**vs. LangSmith:** Framework-agnostic, Copilot SDK native  
**vs. Helicone:** Full agent tracing, not just prompts  
**vs. Datadog:** AI-native semantics, purpose-built

---

## 12. Go-to-Market Strategy

### 12.1 Launch Phases

1. **Developer Preview (M1-2):** Open-source SDK, free cloud tier
2. **Public Beta (M3-4):** Full product, usage limits
3. **GA Launch (M5-6):** Paid tiers, enterprise features

### 12.2 Distribution Channels

- GitHub Marketplace
- npm/PyPI package registries
- Developer content marketing
- Conference sponsorships

### 12.3 Partnerships

- GitHub (Copilot SDK ecosystem)
- Anthropic, OpenAI (model provider integrations)
- Enterprise IT consultants

---

## 13. Monetization Strategy

### 13.1 Pricing Model

**Usage-Based + Platform Fee:**

| Tier | Platform Fee | Event Price | Included Events |
|------|--------------|-------------|-----------------|
| Free | $0 | N/A | 100K/month |
| Pro | $49/month | $0.001 | 500K |
| Team | $199/month | $0.0008 | 2M |
| Enterprise | Custom | $0.0005 | Unlimited |

### 13.2 Revenue Projections

| Year | Customers | Avg. Monthly | ARR |
|------|-----------|--------------|-----|
| Y1 | 1,000 | $250 | $3M |
| Y2 | 5,000 | $350 | $21M |
| Y3 | 15,000 | $450 | $81M |

---

## 14. Risks & Mitigations

### 14.1 Key Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| High infrastructure costs | High | Medium | Efficient architecture, tiered storage |
| LangSmith dominance | Medium | High | Focus on Copilot SDK ecosystem |
| Enterprise sales cycles | Medium | Medium | PLG motion for initial revenue |
| SDK adoption friction | Medium | High | Zero-config instrumentation |

---

## 15. Roadmap & Milestones

### 15.1 Development Timeline

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Foundation | M1-2 | SDK, ingestion, basic storage |
| MVP | M3-4 | Dashboards, tracing, cost tracking |
| Beta Polish | M5-6 | Alerting, API, documentation |
| Scale | M7-12 | Enterprise features, partnerships |

### 15.2 Key Milestones

| Milestone | Date | Criteria |
|-----------|------|----------|
| SDK Release | M2 | 500 downloads |
| Beta Launch | M4 | 1,000 projects |
| GA Launch | M6 | $50K MRR |
| Enterprise | M12 | 5 enterprise customers |

---

## 16. Dependencies & Constraints

### 16.1 Dependencies

| Dependency | Risk | Mitigation |
|------------|------|------------|
| Copilot SDK stability | Medium | Multi-framework support |
| Cloud infrastructure | Low | Multi-cloud deployment |
| LLM pricing accuracy | Low | Dynamic pricing updates |

### 16.2 Constraints

- Engineering team size limits feature velocity
- Infrastructure costs constrain free tier generosity
- Enterprise compliance requires significant investment

---

## 17. Appendices

### 17.1 Glossary

| Term | Definition |
|------|------------|
| **Event** | Single observable action in agent execution |
| **Session** | Complete agent interaction from start to end |
| **Trace** | Hierarchical view of session events |
| **MCP** | Model Context Protocol |

### 17.2 References

1. Stack Overflow Developer Survey 2025 - AI Observability section
2. Gartner: Observability Market Analysis 2025
3. Apache Kafka Documentation
4. ClickHouse Best Practices Guide

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-28 | Jose David Baena | Initial draft |

---

*This PRD is a living document and will be updated as product development progresses and market conditions evolve.*

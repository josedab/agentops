# API Reference

> AgentOps REST API for querying sessions, metrics, and managing resources

**Base URL:** `https://api.agentops.dev` (or `http://localhost:3001` for local development)

## Authentication

All API requests require authentication via API key.

**Header Options:**

```
Authorization: Bearer ao_proj1_abc123...
# or
X-API-Key: ao_proj1_abc123...
```

**Key Format:** `ao_<projectId>_<secret>` (minimum 32 characters)

> ⚠️ **Current Limitation:** API key validation currently only checks format. Database validation against stored key hashes is planned but not yet implemented. See [Architecture - Current Limitations](./ARCHITECTURE.md#current-limitations).

---

## Sessions

### List Sessions

`GET /v1/sessions`

List all sessions with filtering and pagination.

**Query Parameters:**

| Parameter   | Type    | Default | Description                            |
| ----------- | ------- | ------- | -------------------------------------- |
| `limit`     | integer | 50      | Results per page (1-100)               |
| `offset`    | integer | 0       | Pagination offset                      |
| `status`    | string  | -       | Filter: `active`, `completed`, `error` |
| `userId`    | string  | -       | Filter by user ID                      |
| `featureId` | string  | -       | Filter by feature ID                   |
| `model`     | string  | -       | Filter by model used                   |
| `tags`      | string  | -       | Comma-separated tags                   |
| `startDate` | ISO8601 | -       | Sessions started after                 |
| `endDate`   | ISO8601 | -       | Sessions started before                |
| `minCost`   | number  | -       | Minimum total cost                     |
| `maxCost`   | number  | -       | Maximum total cost                     |

**Response:**

```json
{
  "sessions": [
    {
      "sessionId": "sess_abc123",
      "projectId": "proj_xyz",
      "userId": "user_123",
      "featureId": "chat-agent",
      "status": "completed",
      "models": ["gpt-4o"],
      "eventCount": 12,
      "tokens": {
        "prompt": 450,
        "completion": 230,
        "total": 680
      },
      "totalCost": 0.0156,
      "durationMs": 5420,
      "toolsUsed": ["web_search"],
      "tags": ["production"],
      "startedAt": "2024-01-15T10:30:00Z",
      "endedAt": "2024-01-15T10:30:05Z"
    }
  ],
  "total": 1523,
  "limit": 50,
  "offset": 0,
  "hasMore": true
}
```

### Get Session

`GET /v1/sessions/:sessionId`

Get detailed session information.

**Response:**

```json
{
  "sessionId": "sess_abc123",
  "projectId": "proj_xyz",
  "userId": "user_123",
  "featureId": "chat-agent",
  "status": "completed",
  "models": ["gpt-4o"],
  "eventCount": 12,
  "tokens": { "prompt": 450, "completion": 230, "total": 680 },
  "totalCost": 0.0156,
  "durationMs": 5420,
  "toolsUsed": ["web_search"],
  "tags": ["production"],
  "metadata": { "version": "1.2.0" },
  "startedAt": "2024-01-15T10:30:00Z",
  "endedAt": "2024-01-15T10:30:05Z"
}
```

### Get Session Events

`GET /v1/sessions/:sessionId/events`

Get all events for a session.

**Query Parameters:**

| Parameter | Type    | Default | Description          |
| --------- | ------- | ------- | -------------------- |
| `limit`   | integer | 100     | Results per page     |
| `offset`  | integer | 0       | Pagination offset    |
| `type`    | string  | -       | Filter by event type |

**Response:**

```json
{
  "events": [
    {
      "eventId": "evt_001",
      "sessionId": "sess_abc123",
      "type": "prompt",
      "timestamp": "2024-01-15T10:30:00.123Z",
      "model": "gpt-4o",
      "role": "user",
      "content": "What is the weather?",
      "tokens": { "prompt": 8, "completion": 0, "total": 8 }
    },
    {
      "eventId": "evt_002",
      "sessionId": "sess_abc123",
      "parentEventId": "evt_001",
      "type": "tool_call",
      "timestamp": "2024-01-15T10:30:00.500Z",
      "toolName": "get_weather",
      "toolInput": { "location": "San Francisco" }
    },
    {
      "eventId": "evt_003",
      "sessionId": "sess_abc123",
      "parentEventId": "evt_002",
      "type": "tool_result",
      "timestamp": "2024-01-15T10:30:01.200Z",
      "toolName": "get_weather",
      "toolOutput": { "temp": 65, "condition": "sunny" },
      "toolStatus": "success",
      "durationMs": 700
    },
    {
      "eventId": "evt_004",
      "sessionId": "sess_abc123",
      "type": "response",
      "timestamp": "2024-01-15T10:30:02.000Z",
      "model": "gpt-4o",
      "content": "The weather in San Francisco is sunny with 65°F.",
      "tokens": { "prompt": 45, "completion": 15, "total": 60 },
      "cost": 0.0012,
      "durationMs": 800
    }
  ],
  "total": 4
}
```

### Get Session Trace

`GET /v1/sessions/:sessionId/trace`

Get hierarchical trace tree for visualization.

**Response:**

```json
{
  "sessionId": "sess_abc123",
  "trace": {
    "eventId": "evt_001",
    "type": "prompt",
    "timestamp": "2024-01-15T10:30:00.123Z",
    "children": [
      {
        "eventId": "evt_002",
        "type": "tool_call",
        "toolName": "get_weather",
        "children": [
          {
            "eventId": "evt_003",
            "type": "tool_result",
            "toolStatus": "success"
          }
        ]
      },
      {
        "eventId": "evt_004",
        "type": "response"
      }
    ]
  }
}
```

### Delete Session

`DELETE /v1/sessions/:sessionId`

Delete a session and all associated events (GDPR compliance).

**Response:** `204 No Content`

---

## Metrics

### Overview Metrics

`GET /v1/metrics`

Get aggregated metrics overview.

**Query Parameters:**

| Parameter     | Type    | Default | Description             |
| ------------- | ------- | ------- | ----------------------- |
| `startDate`   | ISO8601 | 24h ago | Period start            |
| `endDate`     | ISO8601 | now     | Period end              |
| `granularity` | string  | `hour`  | `minute`, `hour`, `day` |

**Response:**

```json
{
  "period": {
    "start": "2024-01-14T10:00:00Z",
    "end": "2024-01-15T10:00:00Z"
  },
  "summary": {
    "totalSessions": 1523,
    "totalEvents": 45692,
    "totalTokens": 2456000,
    "totalCost": 45.23,
    "avgSessionDuration": 5420,
    "errorRate": 0.023
  },
  "timeseries": [
    {
      "timestamp": "2024-01-15T09:00:00Z",
      "sessions": 52,
      "events": 1560,
      "tokens": 82000,
      "cost": 1.89,
      "errors": 2
    }
  ]
}
```

### Cost Metrics

`GET /v1/metrics/cost`

Get detailed cost breakdown.

**Query Parameters:**

| Parameter   | Type    | Default | Description                |
| ----------- | ------- | ------- | -------------------------- |
| `startDate` | ISO8601 | 24h ago | Period start               |
| `endDate`   | ISO8601 | now     | Period end                 |
| `groupBy`   | string  | `model` | `model`, `user`, `feature` |

**Response:**

```json
{
  "total": 45.23,
  "currency": "USD",
  "breakdown": [
    {
      "key": "gpt-4o",
      "cost": 32.15,
      "percentage": 71.1,
      "tokens": { "prompt": 1500000, "completion": 450000 }
    },
    {
      "key": "gpt-4o-mini",
      "cost": 8.45,
      "percentage": 18.7,
      "tokens": { "prompt": 800000, "completion": 200000 }
    }
  ]
}
```

### Error Metrics

`GET /v1/metrics/errors`

Get error analysis.

**Response:**

```json
{
  "total": 35,
  "rate": 0.023,
  "byType": [
    { "type": "RateLimitError", "count": 15, "percentage": 42.8 },
    { "type": "TimeoutError", "count": 12, "percentage": 34.3 },
    { "type": "APIError", "count": 8, "percentage": 22.9 }
  ],
  "byModel": [
    { "model": "gpt-4o", "count": 20, "rate": 0.018 },
    { "model": "gpt-4o-mini", "count": 15, "rate": 0.031 }
  ]
}
```

### Latency Metrics

`GET /v1/metrics/latency`

Get latency percentiles.

**Response:**

```json
{
  "overall": {
    "p50": 523,
    "p90": 1245,
    "p95": 2100,
    "p99": 4500
  },
  "byModel": [
    {
      "model": "gpt-4o",
      "p50": 650,
      "p90": 1500,
      "p95": 2500,
      "p99": 5000
    }
  ]
}
```

---

## API Keys

### Create API Key

`POST /v1/api-keys`

Generate a new API key.

**Request:**

```json
{
  "name": "Production Key",
  "description": "Main production ingestion key",
  "scopes": ["ingest", "read"],
  "expiresAt": "2025-01-01T00:00:00Z",
  "rateLimit": {
    "requestsPerMinute": 1000,
    "eventsPerMinute": 10000
  }
}
```

**Response:**

```json
{
  "id": "key_abc123",
  "name": "Production Key",
  "key": "ao_proj1_abc123def456...", // Only shown once!
  "keyPrefix": "ao_proj1_abc",
  "scopes": ["ingest", "read"],
  "createdAt": "2024-01-15T10:30:00Z",
  "expiresAt": "2025-01-01T00:00:00Z"
}
```

⚠️ **The full key is only returned once. Store it securely.**

### List API Keys

`GET /v1/api-keys`

**Response:**

```json
{
  "keys": [
    {
      "id": "key_abc123",
      "name": "Production Key",
      "keyPrefix": "ao_proj1_abc",
      "scopes": ["ingest", "read"],
      "lastUsedAt": "2024-01-15T10:30:00Z",
      "usageCount": 45230,
      "createdAt": "2024-01-01T00:00:00Z",
      "expiresAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### Rotate API Key

`POST /v1/api-keys/:keyId/rotate`

Generate a new secret while keeping the same key ID.

**Response:**

```json
{
  "id": "key_abc123",
  "key": "ao_proj1_newSecret789...", // New key
  "rotatedAt": "2024-01-15T10:30:00Z"
}
```

### Revoke API Key

`POST /v1/api-keys/:keyId/revoke`

Immediately invalidate an API key.

**Response:** `204 No Content`

### Delete API Key

`DELETE /v1/api-keys/:keyId`

Permanently delete an API key.

**Response:** `204 No Content`

---

## Alerts

### Create Alert

`POST /v1/alerts`

Create an alert rule.

**Request:**

```json
{
  "name": "High Error Rate",
  "description": "Alert when error rate exceeds 5%",
  "severity": "critical",
  "condition": {
    "metric": "error_rate",
    "operator": "gt",
    "threshold": 0.05,
    "window": "5m"
  },
  "channels": [
    { "type": "slack", "target": "#alerts" },
    { "type": "email", "target": "team@company.com" }
  ],
  "filters": {
    "features": ["production-agent"],
    "models": ["gpt-4o"]
  },
  "cooldownMinutes": 15,
  "enabled": true
}
```

**Response:**

```json
{
  "id": "alert_xyz",
  "name": "High Error Rate",
  "severity": "critical",
  "condition": { ... },
  "channels": [ ... ],
  "enabled": true,
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### List Alerts

`GET /v1/alerts`

**Response:**

```json
{
  "alerts": [
    {
      "id": "alert_xyz",
      "name": "High Error Rate",
      "severity": "critical",
      "enabled": true,
      "lastTriggeredAt": "2024-01-15T08:00:00Z",
      "triggerCount": 3
    }
  ]
}
```

### Update Alert

`PATCH /v1/alerts/:alertId`

### Delete Alert

`DELETE /v1/alerts/:alertId`

---

## Webhooks

### Create Webhook

`POST /v1/webhooks`

**Request:**

```json
{
  "name": "Session Events",
  "url": "https://api.example.com/webhooks/agentops",
  "events": ["session.completed", "session.error", "alert.triggered"],
  "headers": {
    "X-Custom-Header": "value"
  },
  "filters": {
    "severity": ["critical", "warning"]
  },
  "retryPolicy": {
    "maxRetries": 3,
    "retryDelayMs": 1000
  },
  "enabled": true
}
```

**Response:**

```json
{
  "id": "webhook_abc",
  "name": "Session Events",
  "url": "https://api.example.com/webhooks/agentops",
  "secret": "whsec_abc123...", // For HMAC verification
  "events": ["session.completed", "session.error", "alert.triggered"],
  "enabled": true,
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### Webhook Payload

```json
{
  "id": "evt_delivery_123",
  "type": "session.completed",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "sessionId": "sess_abc123",
    "status": "completed",
    "totalCost": 0.0156
  }
}
```

**Signature Header:** `X-AgentOps-Signature: sha256=...`

---

## Projects

### Get Project

`GET /v1/projects/:projectId`

### Update Project Settings

`PATCH /v1/projects/:projectId`

**Request:**

```json
{
  "settings": {
    "defaultRetention": 90,
    "samplingRate": 1.0,
    "piiRedaction": true,
    "costAlerts": {
      "dailyLimit": 100,
      "monthlyLimit": 2000
    }
  }
}
```

### Get Project Usage

`GET /v1/projects/:projectId/usage`

**Response:**

```json
{
  "period": "2024-01",
  "events": 1523000,
  "sessions": 45230,
  "cost": 156.45,
  "tokens": 12500000,
  "limits": {
    "events": 5000000,
    "percentUsed": 30.5
  }
}
```

---

## Export

### Export Sessions

`POST /v1/export`

Export session data for analysis.

**Request:**

```json
{
  "type": "sessions",
  "format": "json",
  "filters": {
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-01-31T23:59:59Z",
    "status": "completed"
  },
  "includeEvents": true
}
```

**Response:**

```json
{
  "exportId": "export_abc123",
  "status": "processing",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### Get Export Status

`GET /v1/export/:exportId`

**Response:**

```json
{
  "exportId": "export_abc123",
  "status": "completed",
  "downloadUrl": "https://exports.agentops.dev/...",
  "expiresAt": "2024-01-16T10:30:00Z",
  "size": 15234567
}
```

---

## Health Checks

### Health

`GET /health`

**Response:**

```json
{ "status": "healthy" }
```

### Readiness

`GET /ready`

**Response:**

```json
{
  "status": "ready",
  "services": {
    "clickhouse": "connected",
    "postgres": "connected",
    "redis": "connected"
  }
}
```

---

## Error Responses

All errors follow a consistent format:

```json
{
  "error": "unauthorized",
  "message": "Invalid or missing API key"
}
```

**Status Codes:**

| Code | Description                               |
| ---- | ----------------------------------------- |
| 400  | Bad Request - Invalid parameters          |
| 401  | Unauthorized - Missing or invalid API key |
| 403  | Forbidden - Insufficient permissions      |
| 404  | Not Found - Resource doesn't exist        |
| 429  | Too Many Requests - Rate limited          |
| 500  | Internal Server Error                     |

---

## Rate Limits

Default rate limits (configurable per API key):

| Tier       | Requests/min | Events/min |
| ---------- | ------------ | ---------- |
| Free       | 100          | 1,000      |
| Pro        | 1,000        | 10,000     |
| Team       | 5,000        | 50,000     |
| Enterprise | Custom       | Custom     |

Rate limit headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1705312800
```

---

## Related Documentation

- [Architecture Overview](./ARCHITECTURE.md) - System design, data flow, infrastructure
- [Current Limitations](./ARCHITECTURE.md#current-limitations) - Known limitations (API key validation, queue system)
- [TypeScript SDK](./sdk-typescript.md) - TypeScript SDK reference
- [Python SDK](./sdk-python.md) - Python SDK reference
- [Go SDK](./sdk-go.md) - Go SDK reference
- [ADR-001: ClickHouse](./adr/001-clickhouse-analytics.md) - Why we chose ClickHouse for analytics

# API Reference

REST API documentation for AgentOps backend services.

**Base URL:** `https://api.agentops.dev`

## Authentication

All requests require an API key:

```bash
# Header options
Authorization: Bearer ao_projectId_secret
# or
X-API-Key: ao_projectId_secret
```

## Endpoints

- [Sessions](/docs/api-reference/sessions) - List, get, and manage sessions
- [Metrics](/docs/api-reference/metrics) - Aggregated analytics
- [Alerts](/docs/api-reference/alerts) - Alert rules and notifications
- [Webhooks](/docs/api-reference/webhooks) - Event webhooks

## Error Handling

All errors follow a consistent format:

```json
{
  "error": "unauthorized",
  "message": "Invalid or missing API key"
}
```

| Code | Description  |
| ---- | ------------ |
| 400  | Bad Request  |
| 401  | Unauthorized |
| 403  | Forbidden    |
| 404  | Not Found    |
| 429  | Rate Limited |
| 500  | Server Error |

## Rate Limits

| Tier       | Requests/min |
| ---------- | ------------ |
| Free       | 100          |
| Pro        | 1,000        |
| Team       | 5,000        |
| Enterprise | Custom       |

Headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1705312800
```

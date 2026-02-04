# Metrics API

## Overview Metrics

`GET /v1/metrics`

**Query Parameters:**

| Parameter   | Type    | Default | Description       |
| ----------- | ------- | ------- | ----------------- |
| startDate   | ISO8601 | 24h ago | Period start      |
| endDate     | ISO8601 | now     | Period end        |
| granularity | string  | hour    | minute, hour, day |

**Response:**

```json
{
  "summary": {
    "totalSessions": 1523,
    "totalEvents": 45692,
    "totalTokens": 2456000,
    "totalCost": 45.23,
    "errorRate": 0.023
  },
  "timeseries": [...]
}
```

## Cost Metrics

`GET /v1/metrics/cost`

**Query Parameters:**

| Parameter | Type   | Default | Description          |
| --------- | ------ | ------- | -------------------- |
| groupBy   | string | model   | model, user, feature |

**Response:**

```json
{
  "total": 45.23,
  "currency": "USD",
  "breakdown": [{ "key": "gpt-4o", "cost": 32.15, "percentage": 71.1 }]
}
```

## Error Metrics

`GET /v1/metrics/errors`

## Latency Metrics

`GET /v1/metrics/latency`

**Response:**

```json
{
  "overall": {
    "p50": 523,
    "p90": 1245,
    "p95": 2100,
    "p99": 4500
  }
}
```

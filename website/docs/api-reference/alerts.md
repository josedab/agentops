# Alerts API

## Create Alert

`POST /v1/alerts`

**Request:**

```json
{
  "name": "High Error Rate",
  "severity": "critical",
  "condition": {
    "metric": "error_rate",
    "operator": "gt",
    "threshold": 0.05,
    "window": "5m"
  },
  "channels": [{ "type": "slack", "target": "#alerts" }],
  "enabled": true
}
```

## List Alerts

`GET /v1/alerts`

## Update Alert

`PATCH /v1/alerts/:alertId`

## Delete Alert

`DELETE /v1/alerts/:alertId`

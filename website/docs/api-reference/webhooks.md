# Webhooks API

## Create Webhook

`POST /v1/webhooks`

**Request:**

```json
{
  "name": "Session Events",
  "url": "https://api.example.com/webhooks",
  "events": ["session.completed", "session.error"],
  "enabled": true
}
```

**Response:**

```json
{
  "id": "webhook_abc",
  "secret": "whsec_abc123...",
  "enabled": true
}
```

## Webhook Payload

```json
{
  "id": "evt_delivery_123",
  "type": "session.completed",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "sessionId": "sess_abc123",
    "status": "completed"
  }
}
```

**Signature:** `X-AgentOps-Signature: sha256=...`

## List Webhooks

`GET /v1/webhooks`

## Delete Webhook

`DELETE /v1/webhooks/:webhookId`

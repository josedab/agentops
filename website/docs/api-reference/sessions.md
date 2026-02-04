# Sessions API

## List Sessions

`GET /v1/sessions`

**Query Parameters:**

| Parameter | Type    | Default | Description                      |
| --------- | ------- | ------- | -------------------------------- |
| limit     | integer | 50      | Results per page (1-100)         |
| offset    | integer | 0       | Pagination offset                |
| status    | string  | -       | Filter: active, completed, error |
| userId    | string  | -       | Filter by user ID                |
| startDate | ISO8601 | -       | Sessions started after           |
| endDate   | ISO8601 | -       | Sessions started before          |

**Response:**

```json
{
  "sessions": [
    {
      "sessionId": "sess_abc123",
      "userId": "user_123",
      "status": "completed",
      "eventCount": 12,
      "totalCost": 0.0156,
      "startedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1523,
  "hasMore": true
}
```

## Get Session

`GET /v1/sessions/:sessionId`

## Get Session Events

`GET /v1/sessions/:sessionId/events`

**Response:**

```json
{
  "events": [
    {
      "eventId": "evt_001",
      "type": "prompt",
      "timestamp": "2024-01-15T10:30:00Z",
      "content": "What is the weather?"
    }
  ]
}
```

## Delete Session

`DELETE /v1/sessions/:sessionId`

**Response:** `204 No Content`

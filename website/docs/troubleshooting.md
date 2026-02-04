# Troubleshooting

Common issues and solutions.

## SDK Issues

### Events not appearing in dashboard

**Symptoms:** SDK initialized but no data in dashboard.

**Solutions:**

1. **Check API key** - Ensure `AGENTOPS_API_KEY` is set correctly

   ```bash
   echo $AGENTOPS_API_KEY
   # Should start with ao_
   ```

2. **Call shutdown** - Events are buffered; ensure shutdown is called

   ```typescript
   await agentops.shutdown();
   ```

3. **Check for errors** - Enable debug logging

   ```typescript
   const agentops = new AgentOps({
     apiKey: "...",
     debug: true,
   });
   ```

4. **Network issues** - Check if ingest endpoint is reachable
   ```bash
   curl -I https://ingest.agentops.dev/health
   ```

### High latency added to LLM calls

**Symptoms:** LLM calls slower than expected.

**Solutions:**

1. AgentOps adds less than 1ms overhead. If seeing more:
   - Check network latency to ingest endpoint
   - Ensure you're not awaiting flush on every call

2. Event sending is async and shouldn't block LLM calls

### Memory usage growing

**Symptoms:** Application memory increasing over time.

**Solutions:**

1. **Check event buffer** - If events fail to send, buffer grows
   - Enable debug logging to see send failures
   - Check network connectivity

2. **End sessions** - Always call `session.end()`

## Dashboard Issues

### Sessions show "in progress" indefinitely

**Cause:** Session was not properly ended.

**Solution:** Always call `session.end()`:

```typescript
session.end({ status: "completed" });
```

### Cost shows $0

**Cause:** Token usage not captured or unknown model.

**Solutions:**

1. Ensure LLM API returns usage data
2. For custom models, provide cost explicitly:
   ```typescript
   session.trackResponse(content, {
     cost: 0.005, // Explicit cost
   });
   ```

### Missing events in trace

**Cause:** Events may be buffered when viewing.

**Solutions:**

1. Wait for flush (1 second)
2. Ensure `shutdown()` was called

## Authentication Issues

### "Invalid API key" error

**Solutions:**

1. Check key format: `ao_<projectId>_<secret>`
2. Minimum 32 characters
3. Key not revoked in dashboard

### 401 on API requests

**Solutions:**

1. Include header: `Authorization: Bearer <key>`
2. Or: `X-API-Key: <key>`

## Getting Help

- [Discord Community](https://discord.gg/agentops)
- [GitHub Issues](https://github.com/josedab/agentops/issues)
- [FAQ](/docs/faq)

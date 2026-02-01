# ADR-002: Proxy Pattern for SDK Instrumentation

## Status

Accepted

## Context

The AgentOps SDK needs to automatically instrument LLM client libraries (OpenAI, Anthropic, Copilot SDK) to track:

- Prompts and responses
- Token usage and costs
- Latency metrics
- Tool calls and results
- Errors and exceptions

Goals:

1. **Minimal code changes** - Users should add 1-2 lines to enable tracking
2. **Non-invasive** - Shouldn't modify the underlying client behavior
3. **Framework agnostic** - Work with any LLM library
4. **Type-safe** - Maintain TypeScript types through instrumentation
5. **Opt-in** - Users explicitly wrap clients they want tracked

Alternatives considered:

1. **Monkey patching** - Modify prototype methods directly
   - Risk: Fragile, breaks with library updates
   - Risk: Global pollution, affects all instances

2. **Subclassing** - Extend client classes
   - Risk: Tight coupling to library internals
   - Risk: Each library needs different approach

3. **Middleware pattern** - Insert middleware layer
   - Risk: Requires libraries to support middleware
   - Risk: Not all LLM libraries have this concept

4. **Decorator functions** - Wrap individual method calls
   - Risk: Verbose, users wrap every call
   - Risk: Easy to miss some calls

## Decision

We use **JavaScript Proxy pattern** to wrap LLM client instances:

```typescript
const client = agentops.wrap(new OpenAI());
```

The Proxy intercepts property access and method calls, allowing us to:

1. Detect known methods (e.g., `chat.completions.create`)
2. Inject tracking before/after the original call
3. Pass through all other operations unchanged

Implementation approach:

```typescript
wrap<T extends object>(client: T): T {
  return new Proxy(client, {
    get: (target, prop, receiver) => {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function' && this.shouldTrack(prop)) {
        return this.wrapMethod(value.bind(target));
      }
      return value;
    },
  });
}
```

## Consequences

### Positive

- **Zero modification** to underlying libraries
- **Type preservation** - Proxy returns same type as input
- **Selective tracking** - Only wrap methods we understand
- **Graceful degradation** - Unknown methods pass through unchanged
- **Single integration point** - One `wrap()` call instruments everything
- **Testable** - Easy to mock in tests

### Negative

- **Proxy overhead** - Small performance cost for property access (~nanoseconds)
- **Deep wrapping** - Nested objects (e.g., `client.chat.completions`) require recursive proxying
- **Method detection** - Must maintain list of known methods per library
- **Edge cases** - Some patterns (e.g., destructuring) might bypass proxy

### Mitigation

- Performance: Overhead is negligible compared to network latency
- Deep wrapping: Implemented recursive proxy for nested objects
- Method detection: Centralized configuration per supported library
- Documentation: Clear examples showing correct usage patterns

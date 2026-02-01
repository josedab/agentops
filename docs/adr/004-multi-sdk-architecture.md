# ADR-004: Multi-Language SDK Architecture

## Status

Accepted

## Context

AgentOps users work in multiple programming languages:

- **TypeScript/JavaScript** - Node.js backends, browser-based agents
- **Python** - Data science, LangChain, most AI/ML frameworks
- **Go** - High-performance services, Kubernetes operators

We need SDKs for each language that:

1. **Share core concepts** - Same event model, API patterns
2. **Feel native** - Idiomatic for each language
3. **Stay synchronized** - Feature parity across languages
4. **Minimize maintenance** - Small team maintaining multiple codebases

Alternatives considered:

1. **Single language + FFI** - Write core in Rust/C, bind to each language
   - Pro: Single source of truth
   - Con: Complex build, FFI overhead, debugging difficulty

2. **Code generation** - Generate SDKs from OpenAPI/Protobuf spec
   - Pro: Automatic synchronization
   - Con: Generic output, not idiomatic, limited flexibility

3. **Shared types only** - Common schema, independent implementations
   - Pro: Native feel, full control
   - Con: Risk of drift, more maintenance

4. **TypeScript primary** - Full features in TS, minimal wrappers elsewhere
   - Pro: Focused effort
   - Con: Non-JS users get second-class experience

## Decision

We adopt a **shared contracts + native implementation** approach:

### Architecture

```
packages/
├── shared/           # Shared TypeScript types (source of truth)
├── sdk-ts/           # TypeScript SDK (primary, most features)
├── sdk-python/       # Python SDK (native implementation)
└── sdk-go/           # Go SDK (native implementation)
```

### Principles

1. **TypeScript is primary** - New features land here first
2. **Shared types** - `packages/shared` defines event schemas
3. **Native implementations** - Each SDK is idiomatic for its language
4. **Feature tiers**:
   - **Core** (all SDKs): Session tracking, events, cost calculation
   - **Advanced** (TS first, then port): Semantic diff, cost guardrails, debug copilot
5. **API consistency** - Same method names and patterns where possible:

   ```typescript
   // TypeScript
   agentops.startSession({ userId: 'user123' });

   // Python
   agentops.start_session(user_id='user123')

   // Go
   agentops.StartSession(SessionOptions{UserID: "user123"})
   ```

### Synchronization Strategy

1. **Event schema** - JSON Schema in `packages/shared`, validate in CI
2. **API versioning** - Backend versioned, SDKs declare compatibility
3. **Feature flags** - Backend returns capabilities, SDKs adapt
4. **Test suites** - Shared test cases run against all SDKs

## Consequences

### Positive

- **Native experience** - Each SDK feels natural to its ecosystem
- **Incremental adoption** - Can prioritize TS, add languages over time
- **Full control** - Can optimize for each language's strengths
- **Independent releases** - SDKs version independently

### Negative

- **Maintenance burden** - Three codebases to maintain
- **Feature lag** - Python/Go may trail TypeScript
- **Drift risk** - Implementations could diverge subtly
- **Testing complexity** - Need CI for each language

### Mitigation

- **Shared test fixtures** - Same JSON test cases validate all SDKs
- **Feature parity tracking** - Public roadmap shows what's available where
- **Documentation consistency** - Same docs structure, language-specific examples
- **Community contributions** - Open source allows community to help port features

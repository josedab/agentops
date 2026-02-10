# Contributing to AgentOps

Thank you for your interest in contributing to AgentOps! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local infrastructure)

### Getting Started

The fastest way to get up and running:

```bash
git clone https://github.com/josedab/agentops.git
cd agentops
pnpm setup      # Installs deps, copies .env files, starts Docker, builds
pnpm dev        # Start development servers
```

<details>
<summary>Manual setup (step-by-step)</summary>

```bash
# Clone the repository
git clone https://github.com/josedab/agentops.git
cd agentops

# Install dependencies
pnpm install

# Copy environment files (review and add your API keys)
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
cp apps/ingest/.env.example apps/ingest/.env

# Start infrastructure (ClickHouse, PostgreSQL, Redis, Redpanda)
cd infrastructure/docker
docker compose up -d
cd ../..

# Build packages
pnpm build

# Run tests to verify setup
pnpm test

# Start development
pnpm dev
```

</details>

## Project Structure

```
agentops/
├── packages/
│   ├── sdk-ts/          # TypeScript SDK (primary)
│   ├── sdk-python/      # Python SDK
│   ├── sdk-go/          # Go SDK
│   └── shared/          # Shared types and utilities
├── apps/
│   ├── web/             # Dashboard (Next.js)
│   ├── api/             # API server (Hono)
│   ├── ingest/          # Ingestion workers (Cloudflare Workers)
│   └── docs/            # Documentation (Mintlify)
└── infrastructure/
    ├── terraform/       # Cloud infrastructure
    └── docker/          # Local development
```

## Development Workflow

### Branching Strategy

- `main` - Production-ready code
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates

### Making Changes

1. **Create a branch** from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our coding standards (see below)

3. **Run tests** to ensure nothing is broken:

   ```bash
   pnpm test
   ```

4. **Run linting**:

   ```bash
   pnpm lint
   ```

5. **Commit your changes** using conventional commits:

   ```bash
   git commit -m "feat: add new feature"
   git commit -m "fix: resolve issue with X"
   git commit -m "docs: update README"
   ```

6. **Push and create a Pull Request**

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `style:` - Code style (formatting, semicolons, etc.)
- `refactor:` - Code refactoring
- `perf:` - Performance improvement
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

### Coding Standards

#### TypeScript

- Use TypeScript for all new code
- Export types explicitly from `types.ts` files
- Prefer `interface` over `type` for object shapes
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

#### Testing

- Write tests for all new features
- Maintain or improve code coverage
- Use descriptive test names that explain the expected behavior
- Place tests in `tests/` directory alongside the source

#### Code Style

- We use Prettier for formatting (run `pnpm format`)
- ESLint for linting (run `pnpm lint`)
- Keep functions small and focused
- Avoid deep nesting

## Pull Request Guidelines

### Before Submitting

- [ ] Tests pass locally (`pnpm test`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Code builds successfully (`pnpm build`)
- [ ] Documentation is updated if needed
- [ ] Commit messages follow conventional commits

### PR Description

Please include:

- **What** - Brief description of the change
- **Why** - Motivation for the change
- **How** - High-level implementation approach
- **Testing** - How you tested the changes

### Review Process

1. A maintainer will review your PR
2. Address any feedback or requested changes
3. Once approved, a maintainer will merge your PR

## Reporting Issues

### Bug Reports

When reporting bugs, please include:

- AgentOps SDK version
- Node.js/Python version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Relevant code snippets or error messages

### Feature Requests

For feature requests, please describe:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Getting Help

- 📖 [Documentation](https://docs.agentops.dev)
- 💬 [Discord Community](https://discord.gg/agentops)
- 🐛 [GitHub Issues](https://github.com/josedab/agentops/issues)

## License

By contributing to AgentOps, you agree that your contributions will be licensed under the MIT License.

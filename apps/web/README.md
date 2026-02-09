# @agentops/web

> Dashboard web application for the AgentOps observability platform

Built with [Next.js](https://nextjs.org/), [Clerk](https://clerk.com/) authentication, and [Tailwind CSS](https://tailwindcss.com/).

## Pages

| Route                   | Description                    |
| ----------------------- | ------------------------------ |
| `/dashboard`            | Overview with key metrics      |
| `/dashboard/sessions`   | Session list and detail view   |
| `/dashboard/costs`      | Cost analytics and breakdown   |
| `/dashboard/alerts`     | Alert management               |
| `/dashboard/quality`    | Quality monitoring             |
| `/dashboard/prompts`    | Prompt management              |
| `/dashboard/playground` | Interactive testing playground |
| `/dashboard/settings`   | Project settings               |
| `/live`                 | Real-time monitoring           |
| `/tests`                | Regression test dashboard      |

## Development

```bash
pnpm dev               # http://localhost:3000
pnpm build             # Production build
pnpm typecheck         # Type check
pnpm lint              # Lint (via next lint)
```

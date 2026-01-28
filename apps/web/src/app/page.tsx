import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-muted">
      <div className="max-w-4xl mx-auto text-center px-4">
        <h1 className="text-6xl font-bold tracking-tight mb-6">
          Agent<span className="text-primary">Ops</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          AI-native observability platform for agent applications. 
          Track sessions, debug issues, and optimize costs.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/dashboard">
            <Button size="lg">Go to Dashboard</Button>
          </Link>
          <Link href="https://github.com/josedab/agentops" target="_blank">
            <Button variant="outline" size="lg">View on GitHub</Button>
          </Link>
        </div>
        
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          <div className="p-6 rounded-lg border bg-card">
            <div className="text-2xl mb-2">🔍</div>
            <h3 className="font-semibold mb-2">Session Tracing</h3>
            <p className="text-sm text-muted-foreground">
              Visualize complete agent decision trees and debug issues instantly.
            </p>
          </div>
          <div className="p-6 rounded-lg border bg-card">
            <div className="text-2xl mb-2">💰</div>
            <h3 className="font-semibold mb-2">Cost Attribution</h3>
            <p className="text-sm text-muted-foreground">
              Track costs by feature, user, and model with detailed breakdowns.
            </p>
          </div>
          <div className="p-6 rounded-lg border bg-card">
            <div className="text-2xl mb-2">🚨</div>
            <h3 className="font-semibold mb-2">Real-time Alerts</h3>
            <p className="text-sm text-muted-foreground">
              Get notified of errors, cost spikes, and performance issues.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

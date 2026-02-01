"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Activity,
  DollarSign,
  Bell,
  Settings,
  Layers,
  Key,
  MessageSquare,
  Webhook,
  Download,
  FlaskConical,
  Sparkles,
  Database,
  Radio,
  TestTube2,
} from "lucide-react";

const navigation = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Sessions", href: "/dashboard/sessions", icon: Activity },
  { name: "Live", href: "/dashboard/live", icon: Radio },
  { name: "Costs", href: "/dashboard/costs", icon: DollarSign },
  { name: "Prompts", href: "/dashboard/prompts", icon: MessageSquare },
  { name: "Alerts", href: "/dashboard/alerts", icon: Bell },
];

const toolsNav = [
  { name: "Playground", href: "/dashboard/playground", icon: FlaskConical },
  { name: "Quality", href: "/dashboard/quality", icon: Sparkles },
  { name: "Tests", href: "/dashboard/tests", icon: TestTube2 },
  { name: "Cache", href: "/dashboard/cache", icon: Database },
];

const secondaryNav = [
  { name: "API Keys", href: "/dashboard/api-keys", icon: Key },
  { name: "Webhooks", href: "/dashboard/webhooks", icon: Webhook },
  { name: "Export", href: "/dashboard/export", icon: Download },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <div className="w-64 bg-card border-r flex flex-col">
        <div className="p-4 border-b">
          <Link href="/" className="flex items-center gap-2">
            <Layers className="h-6 w-6" />
            <span className="font-bold text-lg">AgentOps</span>
          </Link>
        </div>

        <nav className="flex-1 p-4">
          <div className="space-y-1">
            {navigation.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t">
            <p className="px-3 text-xs font-semibold text-muted-foreground mb-2">
              Tools
            </p>
            <div className="space-y-1">
              {toolsNav.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t">
            <p className="px-3 text-xs font-semibold text-muted-foreground mb-2">
              Settings
            </p>
            <div className="space-y-1">
              {secondaryNav.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        <div className="p-4 border-t">
          <div className="text-xs text-muted-foreground">
            <div className="font-medium">Development Project</div>
            <div>Free tier • 87,432 events used</div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b flex items-center px-6 gap-4">
          <div className="flex-1">
            <input
              type="search"
              placeholder="Search sessions, users..."
              className="w-full max-w-md h-9 px-3 rounded-md border bg-background text-sm"
            />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Last 24 hours</span>
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold">
              U
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { formatRelativeTime, cn } from "@/lib/utils";
import { 
  Bell, 
  Plus, 
  AlertTriangle, 
  AlertCircle, 
  Info,
  CheckCircle,
  Clock,
  Settings,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

function AlertSeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={cn(
      "px-2 py-0.5 rounded-full text-xs font-medium",
      severity === "critical" && "bg-red-100 text-red-700",
      severity === "warning" && "bg-yellow-100 text-yellow-700",
      severity === "info" && "bg-blue-100 text-blue-700"
    )}>
      {severity}
    </span>
  );
}

function AlertStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
      status === "triggered" && "bg-red-100 text-red-700",
      status === "acknowledged" && "bg-yellow-100 text-yellow-700",
      status === "resolved" && "bg-green-100 text-green-700"
    )}>
      {status === "triggered" && <AlertCircle className="h-3 w-3" />}
      {status === "acknowledged" && <Clock className="h-3 w-3" />}
      {status === "resolved" && <CheckCircle className="h-3 w-3" />}
      {status}
    </span>
  );
}

export default function AlertsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const { data: alerts, refetch: refetchAlerts } = trpc.alerts.list.useQuery({});
  const { data: alertEvents } = trpc.alerts.events.useQuery({ limit: 20 });
  
  const updateAlert = trpc.alerts.update.useMutation({
    onSuccess: () => refetchAlerts(),
  });
  const deleteAlert = trpc.alerts.delete.useMutation({
    onSuccess: () => refetchAlerts(),
  });

  const toggleAlert = (alertId: string, enabled: boolean) => {
    updateAlert.mutate({ alertId, enabled: !enabled });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Alerts</h1>
          <p className="text-muted-foreground">Configure alerts for your AI agents</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Alert
        </Button>
      </div>

      {/* Alert Configurations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Alert Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alerts?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No alerts configured. Create one to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {alerts?.map((alert) => (
                <div 
                  key={alert.id}
                  className={cn(
                    "p-4 rounded-lg border",
                    !alert.enabled && "opacity-60"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{alert.name}</h3>
                        <AlertSeverityBadge severity={alert.severity} />
                        {!alert.enabled && (
                          <span className="text-xs text-muted-foreground">(disabled)</span>
                        )}
                      </div>
                      {alert.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {alert.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>
                          Condition: {alert.condition.metric} {alert.condition.operator} {alert.condition.threshold}
                          {alert.condition.window && ` (${alert.condition.window})`}
                        </span>
                        {alert.lastTriggeredAt && (
                          <span>
                            Last triggered: {formatRelativeTime(alert.lastTriggeredAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 mt-2">
                        {alert.channels.map((channel, i) => (
                          <span 
                            key={i}
                            className="px-2 py-0.5 bg-muted rounded text-xs"
                          >
                            {channel.type}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleAlert(alert.id, alert.enabled)}
                      >
                        {alert.enabled ? (
                          <ToggleRight className="h-5 w-5 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteAlert.mutate({ alertId: alert.id })}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Alert Events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Recent Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alertEvents?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No alert events yet.
            </div>
          ) : (
            <div className="space-y-4">
              {alertEvents?.map((event) => (
                <div 
                  key={event.id}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center",
                      event.severity === "critical" && "bg-red-100",
                      event.severity === "warning" && "bg-yellow-100",
                      (event.severity as string) === "info" && "bg-blue-100"
                    )}>
                      {event.severity === "critical" && <AlertCircle className="h-5 w-5 text-red-600" />}
                      {event.severity === "warning" && <AlertTriangle className="h-5 w-5 text-yellow-600" />}
                      {(event.severity as string) === "info" && <Info className="h-5 w-5 text-blue-600" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{event.alertName}</span>
                        <AlertStatusBadge status={event.status} />
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        Triggered {formatRelativeTime(event.triggeredAt)}
                        {event.resolvedAt && ` • Resolved ${formatRelativeTime(event.resolvedAt)}`}
                      </div>
                      {event.details && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {JSON.stringify(event.details)}
                        </div>
                      )}
                    </div>
                  </div>
                  {(event.status as string) === "triggered" && (
                    <Button variant="outline" size="sm">
                      Acknowledge
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

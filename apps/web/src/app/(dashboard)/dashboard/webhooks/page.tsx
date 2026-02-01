"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDistanceToNow } from "date-fns";

export default function WebhooksPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<string | null>(null);

  const {
    data: webhooks,
    isLoading,
    refetch,
  } = trpc.webhooks.list.useQuery({});
  const createMutation = trpc.webhooks.create.useMutation({
    onSuccess: () => {
      setShowCreateModal(false);
      refetch();
    },
  });
  const deleteMutation = trpc.webhooks.delete.useMutation({
    onSuccess: () => refetch(),
  });
  const testMutation = trpc.webhooks.test.useMutation();
  const { data: deliveries } = trpc.webhooks.getDeliveries.useQuery(
    { webhookId: selectedWebhook ?? "" },
    { enabled: !!selectedWebhook },
  );

  const webhookEvents = [
    { id: "session.started", label: "Session Started" },
    { id: "session.completed", label: "Session Completed" },
    { id: "session.error", label: "Session Error" },
    { id: "alert.triggered", label: "Alert Triggered" },
    { id: "alert.resolved", label: "Alert Resolved" },
    { id: "cost.threshold", label: "Cost Threshold" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Webhooks
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Send real-time notifications to your systems
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Create Webhook
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Webhooks List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : webhooks?.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
              <div className="text-4xl mb-4">🔔</div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No Webhooks
              </h3>
              <p className="text-gray-500 mt-1">
                Create a webhook to receive real-time events
              </p>
            </div>
          ) : (
            webhooks?.map((webhook) => (
              <div
                key={webhook.id}
                className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 cursor-pointer transition-all ${
                  selectedWebhook === webhook.id ? "ring-2 ring-blue-500" : ""
                }`}
                onClick={() => setSelectedWebhook(webhook.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {webhook.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          webhook.enabled
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                        }`}
                      >
                        {webhook.enabled ? "Active" : "Disabled"}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-gray-500 font-mono truncate">
                      {webhook.url}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {webhook.events.map((event) => (
                        <span
                          key={event}
                          className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
                        >
                          {event}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        testMutation.mutate({ webhookId: webhook.id });
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Test
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete this webhook?")) {
                          deleteMutation.mutate({ webhookId: webhook.id });
                        }
                      }}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {webhook.lastDeliveryAt && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500">
                    Last delivery:{" "}
                    {formatDistanceToNow(new Date(webhook.lastDeliveryAt), {
                      addSuffix: true,
                    })}
                    {" • "}
                    <span
                      className={
                        webhook.lastDeliveryStatus === "success"
                          ? "text-green-600"
                          : "text-red-600"
                      }
                    >
                      {webhook.lastDeliveryStatus}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Delivery History */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Delivery History
            </h2>
          </div>
          {selectedWebhook ? (
            <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-[500px] overflow-y-auto">
              {deliveries?.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No deliveries yet
                </div>
              ) : (
                deliveries?.map((delivery) => (
                  <div key={delivery.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            delivery.status === "success"
                              ? "bg-green-500"
                              : "bg-red-500"
                          }`}
                        />
                        <span className="font-medium text-gray-900 dark:text-white">
                          {delivery.event}
                        </span>
                      </div>
                      <span className="text-sm text-gray-500">
                        {formatDistanceToNow(new Date(delivery.deliveredAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                      <span>HTTP {delivery.responseCode}</span>
                      <span>{delivery.responseTime}ms</span>
                      <span>Attempts: {delivery.attemptCount}</span>
                    </div>
                    <details className="mt-2">
                      <summary className="text-sm text-blue-600 cursor-pointer">
                        View payload
                      </summary>
                      <pre className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs overflow-x-auto">
                        {JSON.stringify(delivery.payload, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              Select a webhook to view delivery history
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Create Webhook
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const name = (
                  form.elements.namedItem("name") as HTMLInputElement
                ).value;
                const url = (form.elements.namedItem("url") as HTMLInputElement)
                  .value;
                const events = Array.from(
                  form.querySelectorAll<HTMLInputElement>(
                    'input[name="events"]:checked',
                  ),
                ).map((el) => el.value) as any;
                createMutation.mutate({
                  projectId: "proj_1",
                  name,
                  url,
                  events,
                });
              }}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name
                  </label>
                  <input
                    name="name"
                    type="text"
                    required
                    placeholder="e.g., Slack Notifications"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    URL
                  </label>
                  <input
                    name="url"
                    type="url"
                    required
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Events
                  </label>
                  <div className="space-y-2">
                    {webhookEvents.map((event) => (
                      <label key={event.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="events"
                          value={event.id}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {event.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

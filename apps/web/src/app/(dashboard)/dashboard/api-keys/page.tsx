"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDistanceToNow } from "date-fns";

export default function ApiKeysPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([
    "ingest",
    "read",
  ]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const { data: apiKeys, isLoading, refetch } = trpc.apiKeys.list.useQuery({});
  const createMutation = trpc.apiKeys.create.useMutation({
    onSuccess: (data) => {
      if (data) {
        setCreatedKey(data.key);
        refetch();
      }
    },
  });
  const revokeMutation = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => refetch(),
  });

  const handleCreate = () => {
    if (!newKeyName.trim()) return;
    createMutation.mutate({
      projectId: "proj_1",
      name: newKeyName,
      scopes: newKeyScopes as ("ingest" | "read" | "write" | "admin")[],
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            API Keys
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage API keys for your project. Keep them secret and rotate
            regularly.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create API Key
        </button>
      </div>

      {/* Created key alert */}
      {createdKey && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">
            🔑 API Key Created Successfully
          </h3>
          <p className="text-sm text-green-700 dark:text-green-300 mb-3">
            Copy this key now. You won't be able to see it again!
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-2 bg-green-100 dark:bg-green-900 rounded text-sm font-mono">
              {createdKey}
            </code>
            <button
              onClick={() => copyToClipboard(createdKey)}
              className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Copy
            </button>
            <button
              onClick={() => setCreatedKey(null)}
              className="px-3 py-2 text-gray-600 hover:text-gray-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* API Keys List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Key
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Scopes
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Last Used
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : apiKeys?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No API keys yet. Create one to get started.
                </td>
              </tr>
            ) : (
              apiKeys?.map((key) => (
                <tr
                  key={key.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {key.name}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                      {key.keyPrefix}...
                    </code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-1">
                      {key.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {key.lastUsedAt
                      ? formatDistanceToNow(new Date(key.lastUsedAt), {
                          addSuffix: true,
                        })
                      : "Never"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDistanceToNow(new Date(key.createdAt), {
                      addSuffix: true,
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            "Are you sure you want to revoke this API key?",
                          )
                        ) {
                          revokeMutation.mutate({ keyId: key.id });
                        }
                      }}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Create API Key
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Key Name
                </label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., Production Key"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Scopes
                </label>
                <div className="space-y-2">
                  {["ingest", "read", "write", "admin"].map((scope) => (
                    <label key={scope} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newKeyScopes.includes(scope)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewKeyScopes([...newKeyScopes, scope]);
                          } else {
                            setNewKeyScopes(
                              newKeyScopes.filter((s) => s !== scope),
                            );
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                        {scope}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewKeyName("");
                  setNewKeyScopes(["ingest", "read"]);
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleCreate();
                  setShowCreateModal(false);
                  setNewKeyName("");
                  setNewKeyScopes(["ingest", "read"]);
                }}
                disabled={!newKeyName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

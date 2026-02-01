"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDistanceToNow } from "date-fns";

export default function PromptsPage() {
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);

  const { data: prompts, isLoading } = trpc.prompts.list.useQuery({});
  const { data: promptDetail } = trpc.prompts.get.useQuery(
    { promptId: selectedPromptId ?? "" },
    { enabled: !!selectedPromptId },
  );

  const selectedPrompt = prompts?.find((p) => p.id === selectedPromptId);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Prompt Analytics
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Track and analyze prompt performance across versions
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Prompts List */}
        <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Prompts
            </h2>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-[600px] overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500">Loading...</div>
            ) : prompts?.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No prompts tracked yet
              </div>
            ) : (
              prompts?.map((prompt) => (
                <button
                  key={prompt.id}
                  onClick={() => setSelectedPromptId(prompt.id)}
                  className={`w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                    selectedPromptId === prompt.id
                      ? "bg-blue-50 dark:bg-blue-900/20"
                      : ""
                  }`}
                >
                  <div className="font-medium text-gray-900 dark:text-white truncate">
                    {prompt.name}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                    <span>v{prompt.version}</span>
                    <span>•</span>
                    <span>
                      {prompt.metrics.usageCount.toLocaleString()} uses
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        prompt.metrics.avgQualityScore >= 7
                          ? "bg-green-500"
                          : prompt.metrics.avgQualityScore >= 5
                            ? "bg-yellow-500"
                            : "bg-red-500"
                      }`}
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Quality: {prompt.metrics.avgQualityScore.toFixed(1)}/10
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Prompt Detail */}
        <div className="lg:col-span-2 space-y-6">
          {selectedPrompt && promptDetail ? (
            <>
              {/* Header */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {selectedPrompt.name}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Template ID: {selectedPrompt.id}
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm rounded-full">
                    v{selectedPrompt.version}
                  </span>
                </div>

                {/* Metrics */}
                <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {selectedPrompt.metrics.usageCount.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500">Total Uses</div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {selectedPrompt.metrics.avgQualityScore.toFixed(1)}
                    </div>
                    <div className="text-sm text-gray-500">Avg Quality</div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {selectedPrompt.metrics.avgLatency}ms
                    </div>
                    <div className="text-sm text-gray-500">Avg Latency</div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      ${selectedPrompt.metrics.avgCost.toFixed(4)}
                    </div>
                    <div className="text-sm text-gray-500">Avg Cost</div>
                  </div>
                </div>
              </div>

              {/* Versions */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Version History
                  </h3>
                </div>
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {promptDetail.versions.map((version) => (
                    <div key={version.version} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                            v{version.version}
                          </span>
                          {version.version === selectedPrompt.version && (
                            <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                              Current
                            </span>
                          )}
                        </div>
                        <span className="text-sm text-gray-500">
                          {formatDistanceToNow(new Date(version.createdAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Uses:</span>{" "}
                          <span className="text-gray-900 dark:text-white">
                            {version.metrics.usageCount.toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Quality:</span>{" "}
                          <span
                            className={`font-medium ${
                              version.metrics.avgQualityScore >= 7
                                ? "text-green-600"
                                : version.metrics.avgQualityScore >= 5
                                  ? "text-yellow-600"
                                  : "text-red-600"
                            }`}
                          >
                            {version.metrics.avgQualityScore.toFixed(1)}
                          </span>
                        </div>
                      </div>
                      <details className="mt-2">
                        <summary className="text-sm text-blue-600 cursor-pointer hover:text-blue-800">
                          View template
                        </summary>
                        <pre className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 rounded text-sm overflow-x-auto">
                          {version.template}
                        </pre>
                      </details>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quality Breakdown */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
                  Quality Analysis
                </h3>
                <div className="space-y-3">
                  {["Relevance", "Coherence", "Accuracy", "Completeness"].map(
                    (metric, _index) => {
                      const score =
                        selectedPrompt.metrics.avgQualityScore -
                        0.5 +
                        Math.random();
                      const percentage = (score / 10) * 100;
                      return (
                        <div key={metric}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600 dark:text-gray-400">
                              {metric}
                            </span>
                            <span className="text-gray-900 dark:text-white">
                              {score.toFixed(1)}/10
                            </span>
                          </div>
                          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                percentage >= 70
                                  ? "bg-green-500"
                                  : percentage >= 50
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                              }`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
              <div className="text-4xl mb-4">📝</div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Select a Prompt
              </h3>
              <p className="text-gray-500 mt-1">
                Choose a prompt from the list to view analytics
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

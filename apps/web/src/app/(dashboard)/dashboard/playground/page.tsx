"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const DEFAULT_MODELS = [
  { id: "gpt-4o", name: "GPT-4o" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini" },
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet" },
  { id: "claude-3-haiku", name: "Claude 3 Haiku" },
];

export default function PlaygroundPage() {
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [response, setResponse] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    latency?: number;
    tokens?: number;
    cost?: number;
  } | null>(null);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareModels, setCompareModels] = useState<string[]>([
    "gpt-4o",
    "claude-3-5-sonnet",
  ]);
  const [compareResults, setCompareResults] = useState<Array<{
    model: string;
    response: string;
    latency: number;
    cost: number;
  }> | null>(null);

  const executeMutation = trpc.playground.execute.useMutation({
    onSuccess: (data) => {
      setResponse(data.response);
      setStats({
        latency: data.latency,
        tokens: data.usage.totalTokens,
        cost: data.cost,
      });
    },
  });

  const compareMutation = trpc.playground.compare.useMutation({
    onSuccess: (data) => {
      setCompareResults(data.results);
    },
  });

  const handleExecute = () => {
    if (!prompt.trim()) return;

    if (isCompareMode) {
      compareMutation.mutate({
        prompt,
        models: compareModels,
        systemPrompt: systemPrompt || undefined,
        temperature,
        maxTokens,
      });
    } else {
      executeMutation.mutate({
        prompt,
        model,
        systemPrompt: systemPrompt || undefined,
        temperature,
        maxTokens,
      });
    }
  };

  const isLoading = executeMutation.isPending || compareMutation.isPending;

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Playground</h1>
        <p className="text-muted-foreground">
          Test prompts and compare model responses
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Mode Toggle */}
              <div className="flex gap-2">
                <Button
                  variant={!isCompareMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIsCompareMode(false)}
                >
                  Single Model
                </Button>
                <Button
                  variant={isCompareMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIsCompareMode(true)}
                >
                  Compare Models
                </Button>
              </div>

              {/* Model Selection */}
              {!isCompareMode ? (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Model
                  </label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full p-2 border rounded-md bg-background"
                  >
                    {DEFAULT_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Compare Models
                  </label>
                  <div className="space-y-2">
                    {DEFAULT_MODELS.map((m) => (
                      <label key={m.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={compareModels.includes(m.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCompareModels([...compareModels, m.id]);
                            } else {
                              setCompareModels(
                                compareModels.filter((id) => id !== m.id),
                              );
                            }
                          }}
                          className="rounded"
                        />
                        {m.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Temperature */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Temperature: {temperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* Max Tokens */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Max Tokens: {maxTokens}
                </label>
                <input
                  type="range"
                  min="100"
                  max="4096"
                  step="100"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Prompt</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* System Prompt */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  System Prompt (optional)
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="You are a helpful assistant..."
                  className="w-full p-3 border rounded-md bg-background min-h-[80px] font-mono text-sm"
                />
              </div>

              {/* User Prompt */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  User Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Enter your prompt here..."
                  className="w-full p-3 border rounded-md bg-background min-h-[150px] font-mono text-sm"
                />
              </div>

              <Button
                onClick={handleExecute}
                disabled={isLoading || !prompt.trim()}
                className="w-full"
              >
                {isLoading
                  ? "Generating..."
                  : isCompareMode
                    ? "Compare Models"
                    : "Generate"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Output Panel */}
        <div className="space-y-4">
          {!isCompareMode ? (
            <Card>
              <CardHeader>
                <CardTitle>Response</CardTitle>
                {stats && (
                  <CardDescription>
                    {stats.latency}ms • {stats.tokens} tokens • $
                    {stats.cost?.toFixed(6)}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <div className="animate-pulse text-muted-foreground">
                      Generating response...
                    </div>
                  </div>
                ) : response ? (
                  <div className="whitespace-pre-wrap font-mono text-sm bg-muted p-4 rounded-md min-h-[300px]">
                    {response}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    Response will appear here
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {isLoading ? (
                <Card>
                  <CardContent className="flex items-center justify-center h-[400px]">
                    <div className="animate-pulse text-muted-foreground">
                      Comparing models...
                    </div>
                  </CardContent>
                </Card>
              ) : compareResults ? (
                compareResults.map((result) => (
                  <Card key={result.model}>
                    <CardHeader>
                      <CardTitle className="text-lg">{result.model}</CardTitle>
                      <CardDescription>
                        {result.latency}ms • ${result.cost.toFixed(6)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="whitespace-pre-wrap font-mono text-sm bg-muted p-4 rounded-md">
                        {result.response}
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="flex items-center justify-center h-[400px] text-muted-foreground">
                    Select models and enter a prompt to compare responses
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Quick Prompts */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Prompts</CardTitle>
              <CardDescription>Click to use a sample prompt</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {[
                  "Explain machine learning in simple terms",
                  "Write a haiku about programming",
                  "What are the SOLID principles?",
                  "Compare REST vs GraphQL",
                ].map((p) => (
                  <Button
                    key={p}
                    variant="outline"
                    size="sm"
                    onClick={() => setPrompt(p)}
                  >
                    {p.slice(0, 30)}...
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface StreamingTextProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
  cursorClassName?: string;
  speed?: number;
}

/**
 * StreamingText component renders text with a typing animation effect.
 * Used for displaying real-time LLM responses token-by-token.
 */
export function StreamingText({
  content,
  isStreaming = false,
  className,
  cursorClassName,
  speed = 20,
}: StreamingTextProps) {
  const [displayedContent, setDisplayedContent] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const contentRef = useRef(content);
  const indexRef = useRef(0);

  // Update content when it changes (new chunks arrive)
  useEffect(() => {
    if (content !== contentRef.current) {
      contentRef.current = content;
    }
  }, [content]);

  // Animate text display
  useEffect(() => {
    if (!isStreaming) {
      setDisplayedContent(content);
      setShowCursor(false);
      return;
    }

    setShowCursor(true);
    const interval = setInterval(() => {
      if (indexRef.current < content.length) {
        setDisplayedContent(content.slice(0, indexRef.current + 1));
        indexRef.current++;
      } else if (indexRef.current >= content.length && content.length > 0) {
        // Keep cursor visible while streaming even if caught up
      }
    }, speed);

    return () => clearInterval(interval);
  }, [content, isStreaming, speed]);

  // Cursor blink effect
  useEffect(() => {
    if (!showCursor) return;

    const interval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 530);

    return () => clearInterval(interval);
  }, [showCursor]);

  return (
    <span className={className}>
      {displayedContent}
      {isStreaming && (
        <span
          className={cn(
            "inline-block w-2 h-4 ml-0.5 bg-current transition-opacity",
            showCursor ? "opacity-100" : "opacity-0",
            cursorClassName,
          )}
        />
      )}
    </span>
  );
}

interface TokenCounterProps {
  promptTokens: number;
  completionTokens: number;
  isStreaming?: boolean;
  className?: string;
}

/**
 * TokenCounter displays real-time token count during streaming.
 */
export function TokenCounter({
  promptTokens,
  completionTokens,
  isStreaming,
  className,
}: TokenCounterProps) {
  return (
    <div className={cn("flex items-center gap-4 text-sm", className)}>
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">Prompt:</span>
        <span className="font-mono">{promptTokens.toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">Completion:</span>
        <span className="font-mono">
          {completionTokens.toLocaleString()}
          {isStreaming && <span className="animate-pulse text-primary">+</span>}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">Total:</span>
        <span className="font-mono font-medium">
          {(promptTokens + completionTokens).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

interface CostTickerProps {
  cost: number;
  isStreaming?: boolean;
  className?: string;
}

/**
 * CostTicker displays real-time cost during streaming with animation.
 */
export function CostTicker({ cost, isStreaming, className }: CostTickerProps) {
  const [displayedCost, setDisplayedCost] = useState(0);
  const targetRef = useRef(cost);

  useEffect(() => {
    targetRef.current = cost;
  }, [cost]);

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedCost(cost);
      return;
    }

    const interval = setInterval(() => {
      setDisplayedCost((prev) => {
        const diff = targetRef.current - prev;
        if (Math.abs(diff) < 0.0001) return targetRef.current;
        return prev + diff * 0.1;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [cost, isStreaming]);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <span className="text-muted-foreground">Cost:</span>
      <span className="font-mono font-medium">
        ${displayedCost.toFixed(4)}
        {isStreaming && (
          <span className="animate-pulse text-green-500 ml-1">↑</span>
        )}
      </span>
    </div>
  );
}

interface DurationTimerProps {
  startTime: number;
  endTime?: number;
  className?: string;
}

/**
 * DurationTimer displays elapsed time for a session or event.
 */
export function DurationTimer({
  startTime,
  endTime,
  className,
}: DurationTimerProps) {
  const [elapsed, setElapsed] = useState(0);
  const isRunning = !endTime;

  useEffect(() => {
    if (!isRunning) {
      setElapsed(endTime - startTime);
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);

    return () => clearInterval(interval);
  }, [startTime, endTime, isRunning]);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {formatDuration(elapsed)}
      {isRunning && <span className="animate-pulse">...</span>}
    </span>
  );
}

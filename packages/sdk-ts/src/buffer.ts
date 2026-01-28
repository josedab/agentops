/**
 * AgentOps SDK - Event Buffer
 * 
 * Buffers events locally and flushes them in batches for efficiency.
 */

import type { AgentEvent, FlushResult } from './types.js';

export interface EventBufferConfig {
  /** Maximum events before auto-flush */
  maxSize: number;
  
  /** Milliseconds between auto-flushes */
  flushInterval: number;
  
  /** Callback when buffer is flushed */
  onFlush: (events: AgentEvent[]) => Promise<FlushResult>;
  
  /** Enable debug logging */
  debug?: boolean;
}

export class EventBuffer {
  private buffer: AgentEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private isShutdown = false;
  
  constructor(private readonly config: EventBufferConfig) {
    this.startFlushTimer();
  }

  /**
   * Add a single event to the buffer
   */
  add(event: AgentEvent): void {
    if (this.isShutdown) {
      if (this.config.debug) {
        console.warn('[AgentOps] Buffer is shutdown, event dropped');
      }
      return;
    }

    this.buffer.push(event);
    
    if (this.config.debug) {
      console.debug(`[AgentOps] Event added: ${event.type} (buffer: ${this.buffer.length})`);
    }

    // Auto-flush if buffer is full
    if (this.buffer.length >= this.config.maxSize) {
      void this.flush();
    }
  }

  /**
   * Add multiple events to the buffer
   */
  addAll(events: AgentEvent[]): void {
    for (const event of events) {
      this.add(event);
    }
  }

  /**
   * Get current buffer size
   */
  size(): number {
    return this.buffer.length;
  }

  /**
   * Drain all events from the buffer without flushing
   */
  drain(): AgentEvent[] {
    const events = this.buffer;
    this.buffer = [];
    return events;
  }

  /**
   * Flush buffered events
   */
  async flush(): Promise<FlushResult> {
    // Prevent concurrent flushes
    if (this.isFlushing || this.buffer.length === 0) {
      return { success: true, eventCount: 0 };
    }

    this.isFlushing = true;
    const events = this.drain();

    if (this.config.debug) {
      console.debug(`[AgentOps] Flushing ${events.length} events`);
    }

    try {
      const result = await this.config.onFlush(events);
      
      if (!result.success && result.error) {
        // Re-buffer failed events for retry
        this.addAll(events);
      }
      
      return result;
    } catch (error) {
      // Re-buffer on error
      this.addAll(events);
      return {
        success: false,
        eventCount: events.length,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Stop the flush timer
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Shutdown the buffer (stop timer and final flush)
   */
  async shutdown(): Promise<void> {
    this.isShutdown = true;
    this.stop();
    await this.flush();
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        void this.flush();
      }
    }, this.config.flushInterval);

    // Ensure timer doesn't prevent process exit
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }
}

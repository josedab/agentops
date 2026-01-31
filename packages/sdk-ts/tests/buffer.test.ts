import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventBuffer } from "../src/buffer";
import type { AgentEvent, FlushResult } from "../src/types";

function createEvent(
  id: string,
  type: "prompt" | "response" = "prompt",
): AgentEvent {
  return {
    eventId: id,
    sessionId: "sess_1",
    type,
    timestamp: Date.now(),
    role: "user",
    content: `test ${id}`,
  } as AgentEvent;
}

describe("EventBuffer", () => {
  let buffer: EventBuffer;
  let flushCallback: ReturnType<
    typeof vi.fn<[AgentEvent[]], Promise<FlushResult>>
  >;

  beforeEach(() => {
    flushCallback = vi.fn().mockResolvedValue({ success: true, eventCount: 0 });
    buffer = new EventBuffer({
      maxSize: 5,
      flushInterval: 1000,
      onFlush: flushCallback,
    });
  });

  afterEach(() => {
    buffer.stop();
  });

  describe("buffering", () => {
    it("should add events to buffer", () => {
      buffer.add(createEvent("1"));
      expect(buffer.size()).toBe(1);
    });

    it("should flush when max size reached", async () => {
      for (let i = 0; i < 5; i++) {
        buffer.add(createEvent(String(i)));
      }

      // Wait for async flush
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(flushCallback).toHaveBeenCalled();
    });

    it("should add multiple events at once", () => {
      buffer.addAll([createEvent("1"), createEvent("2", "response")]);
      expect(buffer.size()).toBe(2);
    });
  });

  describe("flushing", () => {
    it("should flush all events", async () => {
      buffer.add(createEvent("1"));
      buffer.add(createEvent("2"));

      await buffer.flush();

      expect(buffer.size()).toBe(0);
      expect(flushCallback).toHaveBeenCalledWith(expect.any(Array));
    });

    it("should call onFlush callback", async () => {
      buffer.add(createEvent("1"));

      await buffer.flush();

      expect(flushCallback).toHaveBeenCalledWith(expect.any(Array));
    });

    it("should return success when buffer is empty", async () => {
      const result = await buffer.flush();
      expect(result.success).toBe(true);
      expect(result.eventCount).toBe(0);
    });
  });

  describe("drain", () => {
    it("should drain without calling callback", () => {
      buffer.add(createEvent("1"));

      const drained = buffer.drain();

      expect(drained).toHaveLength(1);
      expect(buffer.size()).toBe(0);
    });
  });

  describe("auto-flush interval", () => {
    it("should auto-flush after interval", async () => {
      vi.useFakeTimers();

      const autoBuffer = new EventBuffer({
        maxSize: 100,
        flushInterval: 500,
        onFlush: flushCallback,
      });

      autoBuffer.add(createEvent("1"));

      await vi.advanceTimersByTimeAsync(600);

      expect(flushCallback).toHaveBeenCalled();

      autoBuffer.stop();
      vi.useRealTimers();
    });

    it("should stop interval timer", async () => {
      vi.useFakeTimers();

      const autoBuffer = new EventBuffer({
        maxSize: 100,
        flushInterval: 500,
        onFlush: flushCallback,
      });

      autoBuffer.stop();
      autoBuffer.add(createEvent("1"));

      await vi.advanceTimersByTimeAsync(1000);

      // Should not have been called after stop
      expect(flushCallback).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});

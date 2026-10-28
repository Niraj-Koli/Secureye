import { http, HttpResponse } from "msw/http";
import { describe, expect, it } from "vitest";

import { setAccessToken } from "@/shared/auth/store";
import { apiError, server } from "@/test/server";

import { ApiError } from "./errors";
import { parseSse, streamEvents, type SseMessage } from "./sse";

function streamOf(...chunks: string[]): ReadableStream<BufferSource> {
  const encoder = new TextEncoder();
  return new ReadableStream<BufferSource>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(messages: AsyncIterable<SseMessage>): Promise<SseMessage[]> {
  const all: SseMessage[] = [];
  for await (const message of messages) all.push(message);
  return all;
}

describe("parseSse", () => {
  it("parses events the way FastAPI sends them", async () => {
    const messages = await collect(
      parseSse(
        streamOf(
          'event: status\r\ndata: {"status":"processing"}\r\n\r\n',
          ': ping\r\n\r\nevent: progress\r\ndata: {"progress":0.5}\r\n\r\n',
        ),
      ),
    );

    expect(messages).toEqual([
      { event: "status", data: '{"status":"processing"}' },
      { event: "progress", data: '{"progress":0.5}' },
    ]);
  });

  it("handles lines and line endings split across chunks", async () => {
    const messages = await collect(
      parseSse(streamOf("event: fr", "ame\r", "\ndata: abc", "def\r\n\r", "\n")),
    );

    expect(messages).toEqual([{ event: "frame", data: "abcdef" }]);
  });

  it("follows the standard's field rules", async () => {
    const messages = await collect(
      parseSse(streamOf("data: line 1\ndata:line 2\nid: 7\n\n", "data\n\n", "event: x\n\n")),
    );

    expect(messages).toEqual([
      { event: "message", data: "line 1\nline 2", id: "7" },
      { event: "message", data: "", id: "7" },
      // "event: x" with no data dispatches nothing
    ]);
  });

  it("drops an event that the stream ends in the middle of", async () => {
    const messages = await collect(parseSse(streamOf("data: complete\n\n", "data: cut off")));

    expect(messages.map((m) => m.data)).toEqual(["complete"]);
  });
});

describe("streamEvents", () => {
  it("sends the access token and yields the events", async () => {
    setAccessToken("access-1");
    server.use(
      http.get("/api/v1/videos/5/events", ({ request }) =>
        request.headers.get("Authorization") === "Bearer access-1"
          ? new HttpResponse('event: completed\ndata: {"type":"completed"}\n\n', {
              headers: { "Content-Type": "text/event-stream" },
            })
          : apiError(401, "Not authenticated"),
      ),
    );

    const messages = await collect(streamEvents("/api/v1/videos/5/events"));

    expect(messages).toEqual([{ event: "completed", data: '{"type":"completed"}' }]);
  });

  it("throws the API's error before streaming", async () => {
    setAccessToken("access-1");
    server.use(
      http.get("/api/v1/videos/6/events", () => apiError(404, "Video job not found.", "not_found")),
    );

    const error: unknown = await collect(streamEvents("/api/v1/videos/6/events")).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: "Video job not found." });
  });
});

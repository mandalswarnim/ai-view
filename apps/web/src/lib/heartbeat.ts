const HEARTBEAT_MS = 8_000;

/**
 * Responds straight away and keeps the connection alive with whitespace
 * until `result` settles, then sends it as JSON. Leading whitespace is valid
 * JSON, so callers still just call `response.json()`.
 *
 * This exists because a vision analysis can take over a minute, and Chrome
 * shuts down an extension service worker whose fetch has had no response
 * for 30 seconds.
 */
export function heartbeatJson(result: Promise<unknown>, intervalMs = HEARTBEAT_MS): Response {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(" "));
      timer = setInterval(() => controller.enqueue(encoder.encode(" ")), intervalMs);
      result
        .then(
          (value) => JSON.stringify(value),
          () =>
            JSON.stringify({
              ok: false,
              error: { code: "analysis_failed", message: "The analysis could not be completed." },
            }),
        )
        .then((json) => {
          clearInterval(timer);
          try {
            controller.enqueue(encoder.encode(json));
            controller.close();
          } catch {
            // The stream was cancelled while the analysis was running.
          }
        });
    },
    cancel() {
      // The caller went away. The analysis carries on and is cached for next time.
      clearInterval(timer);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

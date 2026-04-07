const http = require("node:http");

const port = Number(process.env.PORT || 9999);
const events = [];
const maxEvents = 500;

const readBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
};

const writeJson = (response, statusCode, payload) => {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
};

const server = http.createServer(async (request, response) => {
  const method = request.method || "GET";
  const url = request.url || "/";

  if (method === "GET" && url === "/health") {
    writeJson(response, 200, { status: "ok", count: events.length });
    return;
  }

  if (method === "GET" && url === "/events") {
    writeJson(response, 200, {
      count: events.length,
      events
    });
    return;
  }

  if (method === "DELETE" && url === "/events") {
    events.length = 0;
    writeJson(response, 200, { ok: true });
    return;
  }

  if (method === "POST" && url === "/mock-webhook") {
    const body = await readBody(request);
    events.push({
      at: new Date().toISOString(),
      headers: request.headers,
      body
    });

    if (events.length > maxEvents) {
      events.splice(0, events.length - maxEvents);
    }

    writeJson(response, 200, { ok: true, count: events.length });
    return;
  }

  writeJson(response, 404, { error: "not_found" });
});

server.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`alert-sink listening on ${port}`);
});

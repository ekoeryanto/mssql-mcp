import http from 'http';
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
const server = http.createServer((req, res) => {
  if (req.url === '/sse') {
    console.log("Got SSE request!");
    const t = new SSEServerTransport("/message", res);
  } else {
    res.writeHead(404);
    res.end();
  }
});
server.listen(3000);

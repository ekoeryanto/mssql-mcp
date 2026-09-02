import http from 'http';
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
const transports = new Map();

const server = http.createServer((req, res) => {
  if (req.url === '/sse') {
    const transport = new SSEServerTransport('/message', res);
    transports.set(transport.sessionId, transport);
    return;
  }
  
  if (req.url.startsWith('/message')) {
    // ALWAYS return 404 to simulate the error
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  res.writeHead(404);
  res.end();
});
server.listen(3000);

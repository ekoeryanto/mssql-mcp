import * as eventsource from 'eventsource';
globalThis.EventSource = eventsource.EventSource || eventsource;

import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

async function main() {
  console.log("Creating transport...");
  const transport = new SSEClientTransport(new URL('https://mssql-mcp.api.tirtapatriot.net/sse'), {
    requestInit: {
      headers: {
        'Authorization': 'Bearer MWE3MTI3ODAyOWYwZjEzYWU1MDRkYTg4MWY0ZTg0NzhmYzg4N2ViODVjZTcxMTQzMjQxYjIzMTg2NGYyYThkZQo'
      }
    }
  });

  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

  console.log("Connecting...");
  try {
    await client.connect(transport);
    console.log("Connected successfully!");
    
    console.log("Listing tools...");
    const tools = await client.listTools();
    console.log(tools);
    
    process.exit(0);
  } catch (err) {
    console.error("Connection failed!");
    console.error(err);
    process.exit(1);
  }
}

main();

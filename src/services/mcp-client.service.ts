import { Injectable } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
//import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { ConfigService } from '@nestjs/config';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

@Injectable()
export class McpClientService {
  private client: Client;

  constructor(private configService: ConfigService) {
    const uri = this.configService.get<string>('config.mcp_server.uri') as string;
    this.initializeClient(uri);
  }

  private async initializeClient(uri: string) {
    /*const transport = new SSEClientTransport(
      new URL(uri),
    );*/
    const transport = new StreamableHTTPClientTransport(new URL(uri));
    this.client = new Client(
      {
        name: 'mcp-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      },
    );
    await this.client.connect(transport);
  }

  getClient(): Client {
    return this.client;
  }
}

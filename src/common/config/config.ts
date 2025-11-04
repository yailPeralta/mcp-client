import { registerAs } from '@nestjs/config';
import path from 'path';

export default registerAs('config', () => ({
  system: {
    port: Number(process.env.PORT),
  },
  mcp_server: {
    uri: process.env.MCP_SERVER_URI,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  antropic: {
    apiKey: process.env.ANTROPIC_API_KEY,
  },
  llm: {
    priority: process.env.LLM_PRIORITY,
  },
}));

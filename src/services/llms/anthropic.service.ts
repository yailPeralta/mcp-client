import { Injectable } from '@nestjs/common';
import { Anthropic } from '@anthropic-ai/sdk';
import {
  MessageParam,
  Tool,
} from '@anthropic-ai/sdk/resources/messages/messages.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ConfigService } from '@nestjs/config';
import { McpClientService } from '../mcp-client.service';
import { decode } from '@toon-format/toon';

// Constants
const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 1024;
const MCP_TRELLO_LISTS_URI = 'mcp://trello/lists';
const MCP_KNOWN_PROBLEMS_URI = 'mcp://known-problems';
const TRELLO_CREATE_TICKET_TOOL = 'trello-create-ticket-tool';

@Injectable()
export class AnthropicService {
  private mcpClient: Client;
  private anthropic: Anthropic;

  constructor(
    private configService: ConfigService,
    private readonly mcpClientService: McpClientService,
  ) {
    const antropicApiKey = this.configService.get<string>(
      'config.antropic.apiKey',
    ) as string;
    this.anthropic = new Anthropic({
      apiKey: antropicApiKey,
    });

    this.mcpClient = this.mcpClientService.getClient();
  }

  async ping(): Promise<{ alive: boolean; latency: number; error?: string }> {
    const start = Date.now();

    try {
      await this.anthropic.models.list();
      return { alive: true, latency: Date.now() - start };
    } catch (error: any) {
      return {
        alive: false,
        latency: Date.now() - start,
        error: error.message,
      };
    }
  }

  private async prepareTools(): Promise<Tool[]> {
    // Fetch available tools from MCP server
    let availableTools;
    try {
      availableTools = await this.mcpClient.listTools();
    } catch (error) {
      console.error('Failed to fetch MCP tools:', error);
      availableTools = { tools: [] };
    }

    // Convert MCP tools to Anthropic tool format
    const tools: Tool[] = availableTools.tools.map((mcpTool) => ({
      name: mcpTool.name,
      description: mcpTool.description,
      input_schema: mcpTool.inputSchema,
    }));

    console.log('Available tools:', tools);

    // Add resource-based tools that use MCP readResource
    const resourceTools: Tool[] = [
      {
        name: 'get_trello_lists',
        description: 'Obtiene el listado de listas disponibles en Trello',
        input_schema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'get_known_problems',
        description: 'Obtiene la lista de problemas conocidos resueltos',
        input_schema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ];

    tools.push(...resourceTools);
    return tools;
  }

  private createInitialMessage(problema: string): MessageParam[] {
    return [
      {
        role: 'user',
        content: `
          Eres un asistente que resuelve problemas técnicos. Cuando recibes un problema (toda la data de los resources/tools vienen en formato toon codificados con la libreria toon-format/toon):
          1. Primero obtén el listado de listas de Trello usando get_trello_lists para posteriormente obtener el id de la lista "Problemas resueltos anteriormente" o "Problemas Nuevos"
          2. Luego consulta los problemas conocidos usando get_known_problems
          3. Si el problema ya existe en la base de conocimiento y tiene solución:
            - Crea un ticket con el tool trello-create-ticket-tool en la lista "Problemas resueltos anteriormente" con el título "[problema]" y descripción que incluya el problema y la solución existente
          4. Si el problema no existe o no tiene solución:
            - Crea un ticket con el tool trello-create-ticket-tool en la lista "Problemas Nuevos" con el título "[problema]" y descripción que incluya el problema y una solución propuesta basada en tu conocimiento
          Siempre usa las herramientas disponibles para interactuar con los sistemas externos.

          Problema a resolver: "${problema}"
        `,
      },
    ];
  }

  private extractResultFromMessage(message: any): string {
    return message.content?.[0]?.type === 'text'
      ? message.content[0].text
      : 'Problema procesado exitosamente';
  }

  async resolverProblemaConLLM(problema: string): Promise<{ result: string }> {
    const tools = await this.prepareTools();
    const messages = this.createInitialMessage(problema);

    let responseMessage = await this.createAnthropicMessage(messages, tools);

    console.log('Response message:', responseMessage);

    if (responseMessage.stop_reason === 'tool_use' && responseMessage.content) {
      messages.push({
        role: 'assistant',
        content: responseMessage.content,
      });

      await this.processToolCalls(responseMessage.content, messages, tools);

      // Get final response after tool calls
      let finalMessage = await this.createAnthropicMessage(messages, tools);

      console.log('Final message:', finalMessage);
      console.log('Final message stop reason:', finalMessage.stop_reason);

      // Check if final message also has tool calls that need processing
      if (finalMessage.stop_reason === 'tool_use' && finalMessage.content) {
        console.log('Final message has additional tool calls, processing...');

        messages.push({
          role: 'assistant',
          content: finalMessage.content,
        });

        await this.processToolCalls(finalMessage.content, messages, tools);

        // Get final final response after additional tool calls
        finalMessage = await this.createAnthropicMessage(messages, tools);

        console.log('Final final message:', finalMessage);

        return {
          result: this.extractResultFromMessage(finalMessage),
        };
      }

      return {
        result: this.extractResultFromMessage(finalMessage),
      };
    }

    console.log('responseMessage:', responseMessage.content);
    console.log('No tool use detected, returning initial response');

    return {
      result: this.extractResultFromMessage(responseMessage),
    };
  }

  private async getTrelloLists() {
    try {
      const response = await this.mcpClient.readResource({
        uri: MCP_TRELLO_LISTS_URI,
      });

      return response.contents.map((c) => decode(c.text as string));
    } catch (error) {
      console.error('Error fetching Trello lists:', error);
      return { error: error.message };
    }
  }

  private async getKnownProblems() {
    try {
      const response = await this.mcpClient.readResource({
        uri: MCP_KNOWN_PROBLEMS_URI,
      });

      return response.contents.map((c) => decode(c.text as string));
    } catch (error) {
      console.error('Error fetching known problems:', error);
      return { error: error.message };
    }
  }

  private async createTrelloTicket(
    listId: string,
    name: string,
    description: string,
  ) {
    try {
      console.log('Calling MCP tool: trello-create-ticket-tool with args:', {
        listId,
        name,
        description,
      });
      const result = await this.mcpClient.callTool({
        name: TRELLO_CREATE_TICKET_TOOL,
        arguments: {
          listId,
          name,
          description,
        },
      });
      console.log('MCP tool result:', result);
      return result;
    } catch (error) {
      console.error('MCP tool call error:', error);
      return { error: error.message };
    }
  }

  private async createAnthropicMessage(
    messages: MessageParam[],
    tools: Tool[],
  ): Promise<any> {
    return await this.anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_TOKENS,
      messages,
      tools,
    });
  }

  private async processToolCalls(
    content: any[],
    messages: MessageParam[],
    tools: Tool[],
  ): Promise<void> {
    for (const contentBlock of content) {
      console.log('Processing content block:', contentBlock.type);
      if (contentBlock.type === 'tool_use') {
        const toolCall = contentBlock;
        const functionName = toolCall.name;
        const functionArgs = toolCall.input as
          | { [x: string]: unknown }
          | undefined;

        console.log(
          'Calling MCP tool:',
          functionName,
          'with args:',
          JSON.stringify(functionArgs, null, 2),
        );

        let result;
        switch (functionName) {
          case 'get_trello_lists':
            result = await this.getTrelloLists();
            break;
          case 'get_known_problems':
            result = await this.getKnownProblems();
            break;
          case TRELLO_CREATE_TICKET_TOOL:
            const listId = functionArgs?.idList || functionArgs?.listId;
            const name = functionArgs?.name;
            const description = functionArgs?.desc || functionArgs?.description;
            result = await this.createTrelloTicket(
              listId as string,
              name as string,
              description as string,
            );
            break;
          default:
            try {
              result = await this.mcpClient.callTool({
                name: functionName,
                arguments: functionArgs as { [x: string]: unknown },
              });
            } catch (error) {
              console.error('Dynamic MCP tool call error:', error);
              result = { error: error.message };
            }
            break;
        }

        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: JSON.stringify(result),
            },
          ],
        });
      }
    }
  }
}

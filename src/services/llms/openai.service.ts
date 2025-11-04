import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { McpClientService } from '../mcp-client.service';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ConfigService } from '@nestjs/config';
import { decode } from '@toon-format/toon';

// Constants
const OPENAI_MODEL = 'gpt-4';
const MCP_TRELLO_LISTS_URI = 'mcp://trello/lists';
const MCP_KNOWN_PROBLEMS_URI = 'mcp://known-problems';
const TRELLO_CREATE_TICKET_TOOL = 'trello-create-ticket-tool';

@Injectable()
export class OpenaiService {
  private openai: OpenAI;
  private mcpClient: Client;

  constructor(
    private configService: ConfigService,
    private readonly mcpClientService: McpClientService,
  ) {
    const openaiApiKey = this.configService.get<string>(
      'config.openai.apiKey',
    ) as string;
    this.openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    this.mcpClient = this.mcpClientService.getClient();
  }

  async ping(): Promise<{ alive: boolean; latency: number; error?: string }> {
    const start = Date.now();

    try {
      await this.openai.models.list();
      return { alive: true, latency: Date.now() - start };
    } catch (error: any) {
      return {
        alive: false,
        latency: Date.now() - start,
        error: error.message,
      };
    }
  }

  private async prepareTools(): Promise<
    OpenAI.Chat.Completions.ChatCompletionTool[]
  > {
    // Fetch available tools from MCP server
    let availableTools;
    try {
      availableTools = await this.mcpClient.listTools();
    } catch (error) {
      console.error('Failed to fetch MCP tools:', error);
      availableTools = { tools: [] };
    }

    // Convert MCP tools to OpenAI tool format
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] =
      availableTools.tools.map((mcpTool) => ({
        type: 'function' as const,
        function: {
          name: mcpTool.name,
          description: mcpTool.description,
          parameters: mcpTool.inputSchema,
        },
      }));

    // Add resource-based tools that use MCP readResource
    const resourceTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: 'function' as const,
        function: {
          name: 'get_trello_lists',
          description: 'Obtiene el listado de listas disponibles en Trello',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'get_known_problems',
          description: 'Obtiene la lista de problemas conocidos resueltos',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
    ];

    tools.push(...resourceTools);
    return tools;
  }

  private createInitialMessage(
    problema: string,
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return [
      {
        role: 'user',
        content: `Resuelve este problema técnico: "${problema}"
          INSTRUCCIONES:
          1.  Primero llama a get_trello_lists para obtener las listas de Trello
          2.  Luego llama a get_known_problems para consultar problemas conocidos
          3.  Si el problema ya existe en la base de conocimiento y tiene solución:
                - Crea un ticket con el tool trello-create-ticket-tool en la lista "Problemas resueltos anteriormente" con el título "[problema]" y descripción que incluya el problema y la solución existente
              Si el problema no existe o no tiene solución:
                - Crea un ticket con el tool trello-create-ticket-tool en la lista "Problemas Nuevos" con el título "[problema]" y descripción que incluya el problema y una solución propuesta basada en tu conocimiento
              Crea un ticket usando trello-create-ticket-tool con:
                - listId: ID de la lista "Problemas Nuevos" o "Problemas resueltos anteriormente"
                - name: "[problema]"
                - desc: descripción estructurada del ticket siguiendo este formato exacto:

                  **PROBLEMA:**
                  [Descripción del problema]

                  **CONTEXTO:**
                  [Contexto adicional del problema]

                  **CRITICIDAD:** [Baja/Media/Alta/Crítica]
                  **FRECUENCIA:** [Rara/Ocasional/Frecuente/Constante]
                  **CATEGORÍA:** [Técnico/Funcional/Performance/Seguridad/UX/UI]
                  **PRIORIDAD:** [Baja/Media/Alta]

                  **ROLES AFECTADOS:**
                  [Lista de roles separados por comas]

                  **SOLUCIÓN EXISTENTE:**
                  [Descripción de la solución si existe en la base de conocimiento]

                  **ACCIONES RECOMENDADAS:**
                  [Lista de acciones con estado ✓ Completada o Pendiente]

                  **NIVEL DE SATISFACCIÓN:** [1-5]/5

                  **TAGS:** [lista de tags separados por comas]
          IMPORTANTE: Debes usar las herramientas disponibles, no describir lo que harías. Si el problema existe en la base de conocimiento, incluye toda la información estructurada disponible.`,
      },
    ];
  }

  private extractResultFromMessage(message: any): string {
    return message.content || 'Problema procesado exitosamente';
  }

  private async createOpenAIMessage(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
    const completion = await this.openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
    });
    return completion.choices[0].message;
  }

  private async processToolCalls(
    toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
  ): Promise<void> {
    for (const toolCall of toolCalls) {
      if ('function' in toolCall) {
        const functionName = toolCall.function.name;
        try {
          const functionArgs =
            typeof toolCall.function.arguments === 'string'
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments;

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
              const description =
                functionArgs?.desc || functionArgs?.description;
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
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        } catch (error) {
          console.error('MCP tool call error:', error);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: error.message }),
          });
        }
      }
    } // End for
  }

  async resolverProblemaConLLM(problema: string): Promise<{ result: string }> {
    const tools = await this.prepareTools();
    const messages = this.createInitialMessage(problema);

    let responseMessage = await this.createOpenAIMessage(messages, tools);

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      messages.push({
        role: 'assistant',
        content: responseMessage.content,
        tool_calls: responseMessage.tool_calls,
      });

      await this.processToolCalls(responseMessage.tool_calls, messages, tools);

      // Get final response after tool calls
      let finalMessage = await this.createOpenAIMessage(messages, tools);

      // Check if final message also has tool calls that need processing
      if (finalMessage.tool_calls && finalMessage.tool_calls.length > 0) {
        // Processing final ticket creation tool calls

        messages.push({
          role: 'assistant',
          content: finalMessage.content,
          tool_calls: finalMessage.tool_calls,
        });

        await this.processToolCalls(finalMessage.tool_calls, messages, tools);

        // Get final final response after additional tool calls
        finalMessage = await this.createOpenAIMessage(messages, tools);

        console.log(
          'Final final message after additional tool calls:',
          finalMessage,
        );

        // Check if this final message also has tool calls (should be the ticket creation)
        if (finalMessage.tool_calls && finalMessage.tool_calls.length > 0) {
          console.log('Processing final ticket creation tool calls...');

          messages.push({
            role: 'assistant',
            content: finalMessage.content,
            tool_calls: finalMessage.tool_calls,
          });

          await this.processToolCalls(finalMessage.tool_calls, messages, tools);

          // Get the actual final response
          finalMessage = await this.createOpenAIMessage(messages, tools);
          // console.log('Actual final message after ticket creation:', finalMessage);
        }

        return {
          result: this.extractResultFromMessage(finalMessage),
        };
      }

      return {
        result: this.extractResultFromMessage(finalMessage),
      };
    }

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
      if (!listId || !name || !description) {
        console.error('Missing required parameters for ticket creation:', {
          listId,
          name,
          description,
        });
        return { error: 'Missing required parameters' };
      }
      const result = await this.mcpClient.callTool({
        name: TRELLO_CREATE_TICKET_TOOL,
        arguments: {
          listId,
          name,
          description,
        },
      });
      return result;
    } catch (error) {
      console.error('MCP tool call error:', error);
      return { error: error.message };
    }
  }
}

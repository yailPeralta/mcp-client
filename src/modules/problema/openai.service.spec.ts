import { Test, TestingModule } from '@nestjs/testing';
import { OpenaiService } from '../../services/llms/openai.service';
import { McpClientService } from '../../services/mcp-client.service';

const mockOpenAIInstance = {
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
};

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockOpenAIInstance),
}));

describe('OpenaiService', () => {
  let service: OpenaiService;
  let mockMcpClientService: jest.Mocked<McpClientService>;
  let mockClient: any;

  beforeEach(async () => {
    mockClient = {
      readResource: jest.fn(),
      callTool: jest.fn(),
    };

    mockMcpClientService = {
      getClient: jest.fn().mockReturnValue(mockClient),
    } as any;

    mockOpenAIInstance.chat.completions.create.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenaiService,
        {
          provide: McpClientService,
          useValue: mockMcpClientService,
        },
      ],
    }).compile();

    service = module.get<OpenaiService>(OpenaiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolverProblemaConLLM', () => {
    it('should return response content when no tool calls', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Problema resuelto sin herramientas',
              tool_calls: null,
            },
          },
        ],
      };

      mockOpenAIInstance.chat.completions.create.mockResolvedValueOnce(mockResponse);

      const result = await service.resolverProblemaConLLM('Problema de prueba');

      expect(result).toBe('Problema resuelto sin herramientas');
      expect(mockOpenAIInstance.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    it('should handle tool calls and return final response', async () => {
      const mockInitialResponse = {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call1',
                  type: 'function',
                  function: {
                    name: 'get_trello_lists',
                    arguments: '{}',
                  },
                },
              ],
            },
          },
        ],
      };

      const mockFinalResponse = {
        choices: [
          {
            message: {
              content: 'Problema procesado con herramientas',
            },
          },
        ],
      };

      mockOpenAIInstance.chat.completions.create
        .mockResolvedValueOnce(mockInitialResponse)
        .mockResolvedValueOnce(mockFinalResponse);

      mockClient.readResource.mockResolvedValue({
        contents: [{ text: '[{"id": "list1", "name": "Lista 1"}]' }],
      });

      const result = await service.resolverProblemaConLLM('Problema de prueba');

      expect(result).toBe('Problema procesado con herramientas');
      expect(mockOpenAIInstance.chat.completions.create).toHaveBeenCalledTimes(2);
      expect(mockClient.readResource).toHaveBeenCalledWith({
        uri: 'mcp://trello/lists',
      });
    });

    it('should handle tool calls without function property', async () => {
      const mockInitialResponse = {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call1',
                  type: 'custom',
                  // no function property
                },
              ],
            },
          },
        ],
      };

      const mockFinalResponse = {
        choices: [
          {
            message: {
              content: 'Problema procesado sin function',
            },
          },
        ],
      };

      mockOpenAIInstance.chat.completions.create
        .mockResolvedValueOnce(mockInitialResponse)
        .mockResolvedValueOnce(mockFinalResponse);

      const result = await service.resolverProblemaConLLM('Problema de prueba');

      expect(result).toBe('Problema procesado sin function');
      expect(mockOpenAIInstance.chat.completions.create).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple tool calls', async () => {
      const mockInitialResponse = {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call1',
                  type: 'function',
                  function: {
                    name: 'get_trello_lists',
                    arguments: '{}',
                  },
                },
                {
                  id: 'call2',
                  type: 'function',
                  function: {
                    name: 'get_known_problems',
                    arguments: '{}',
                  },
                },
              ],
            },
          },
        ],
      };

      const mockFinalResponse = {
        choices: [
          {
            message: {
              content: 'Múltiples herramientas procesadas',
            },
          },
        ],
      };

      mockOpenAIInstance.chat.completions.create
        .mockResolvedValueOnce(mockInitialResponse)
        .mockResolvedValueOnce(mockFinalResponse);

      mockClient.readResource
        .mockResolvedValueOnce({
          contents: [{ text: '[{"id": "list1", "name": "Lista 1"}]' }],
        })
        .mockResolvedValueOnce({
          contents: [{ text: '[{"id": "prob1", "title": "Problema conocido"}]' }],
        });

      const result = await service.resolverProblemaConLLM('Problema de prueba');

      expect(result).toBe('Múltiples herramientas procesadas');
      expect(mockClient.readResource).toHaveBeenCalledTimes(2);
    });

    it('should handle create_trello_ticket tool call', async () => {
      const mockInitialResponse = {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call1',
                  type: 'function',
                  function: {
                    name: 'create_trello_ticket',
                    arguments: JSON.stringify({
                      listId: 'list1',
                      name: 'Nuevo ticket',
                      description: 'Descripción del ticket',
                    }),
                  },
                },
              ],
            },
          },
        ],
      };

      const mockFinalResponse = {
        choices: [
          {
            message: {
              content: 'Ticket creado exitosamente',
            },
          },
        ],
      };

      mockOpenAIInstance.chat.completions.create
        .mockResolvedValueOnce(mockInitialResponse)
        .mockResolvedValueOnce(mockFinalResponse);

      mockClient.callTool.mockResolvedValue({ success: true });

      const result = await service.resolverProblemaConLLM('Problema de prueba');

      expect(result).toBe('Ticket creado exitosamente');
      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'trello-create-ticket-tool',
        arguments: {
          listId: 'list1',
          name: 'Nuevo ticket',
          description: 'Descripción del ticket',
        },
      });
    });

    it('should return default message when no content', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: null,
              tool_calls: null,
            },
          },
        ],
      };

      mockOpenAIInstance.chat.completions.create.mockResolvedValueOnce(mockResponse);

      const result = await service.resolverProblemaConLLM('Problema de prueba');

      expect(result).toBe('Problema procesado exitosamente');
    });
  });
});
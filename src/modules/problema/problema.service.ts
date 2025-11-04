import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenaiService } from '../../services/llms/openai.service';
import { AnthropicService } from 'src/services/llms/anthropic.service';

@Injectable()
export class ProblemaService {
  constructor(
    private readonly configService: ConfigService,
    private readonly openaiService: OpenaiService,
    private readonly anthropicService: AnthropicService,
  ) {}

  async resolverProblema(problema: string): Promise<{ result: string } | any> {
    try {
      const llmPriority = this.configService.get<string>('config.llm.priority');
      if (!llmPriority) {
        throw new Error('LLM_PRIORITY no está configurado');
      }
      const priorities = llmPriority.split(',').map(p => p.trim());

      const services = {
        openai: this.openaiService,
        anthropic: this.anthropicService,
      };

      for (const priority of priorities) {
        if (services[priority]) {
          const ping = await services[priority].ping();
          if (ping.alive) {
            return services[priority].resolverProblemaConLLM(problema);
          }
        }
      }

      throw new Error('Todos los servicios LLM están inactivos');
    } catch (error) {
      throw new Error(`Error al resolver problema: ${error.message}`);
    }
  }
}

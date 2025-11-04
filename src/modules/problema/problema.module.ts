import { Module } from '@nestjs/common';
import { ProblemaController } from './problema.controller';
import { ProblemaService } from './problema.service';
import { McpClientService } from '../../services/mcp-client.service';
import { OpenaiService } from '../../services/llms/openai.service';
import { AnthropicService } from 'src/services/llms/anthropic.service';

@Module({
  controllers: [ProblemaController],
  providers: [
    ProblemaService,
    McpClientService,
    OpenaiService,
    AnthropicService,
  ],
})
export class ProblemaModule {}

import { Controller, Post, Body, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ProblemaService } from './problema.service';

@Controller('problema')
export class ProblemaController {
  constructor(private readonly problemaService: ProblemaService) {}

  @Post()
  async resolverProblema(
    @Body('problema') problema: string,
    @Res() res: Response,
  ) {
    const result = await this.problemaService.resolverProblema(problema);

    res.status(200).json(result);
  }
}

import { Test, TestingModule } from '@nestjs/testing';
import { ProblemaController } from './problema.controller';

describe('ProblemaController', () => {
  let controller: ProblemaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProblemaController],
    }).compile();

    controller = module.get<ProblemaController>(ProblemaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

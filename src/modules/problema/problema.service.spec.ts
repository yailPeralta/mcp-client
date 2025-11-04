import { Test, TestingModule } from '@nestjs/testing';
import { ProblemaService } from './problema.service';

describe('ProblemaService', () => {
  let service: ProblemaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProblemaService],
    }).compile();

    service = module.get<ProblemaService>(ProblemaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ProblemaModule } from './modules/problema/problema.module';
import AppConfigModule from './common/config/env-validator.config';

@Module({
  imports: [ConfigModule.forRoot(AppConfigModule), ProblemaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

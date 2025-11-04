import { ConfigModuleOptions } from '@nestjs/config';
import * as Joi from 'joi';
import config from './config';

const AppConfigModule: ConfigModuleOptions = {
  envFilePath: '.env',
  ignoreEnvVars: true,
  isGlobal: true,
  load: [config],
  validationOptions: {
    abortEarly: true,
    allowUnknown: true,
  },
  validationSchema: Joi.object({
    PORT: Joi.number().port().required(),
    MCP_SERVER_URI: Joi.string().uri().required(),
    OPENAI_API_KEY: Joi.string().required(),
    ANTHROPIC_API_KEY: Joi.string().required(),
    LLM_PRIORITY: Joi.string().required(),
  }),
};

export default AppConfigModule;

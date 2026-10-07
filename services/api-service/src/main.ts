import {
  ConsoleLogger,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ModulesContainer, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import { Request, Response } from 'express';
import fs, { writeFileSync } from 'node:fs';

import { ApplicationModule } from '@api-service/src/app.module';
import {
  APP_FAVICON,
  APP_TITLE,
  APP_VERSION,
  IS_DEVELOPMENT,
  SWAGGER_CUSTOM_CSS,
  SWAGGER_CUSTOM_JS,
} from '@api-service/src/config';
import { env } from '@api-service/src/env';
import { INTERFACE_NAME_HEADER } from '@api-service/src/shared/enum/interface-names.enum';
import { HttpExceptionLoggingFilter } from '@api-service/src/shared/filters/http-exception-logging.filter';
import { AzureLogService } from '@api-service/src/shared/services/azure-log.service';
import { ValidationPipeOptions } from '@api-service/src/validation-options/validation-pipe-options.const';

import 'multer'; // This is import is required to prevent typing error on the MulterModule
// eslint-disable-next-line @typescript-eslint/no-require-imports -- This version of AppInsighst still only works with require
import appInsights = require('applicationinsights');

/**
 * A visualization of module dependencies, derived from Nest's DI container.
 * The file can be viewed with [Mermaid](https://mermaid.live) or the VSCode extension "bierner.markdown-mermaid"
 */
function generateModuleDependencyGraph(app: INestApplication): void {
  const genericModules = [
    // Sorted alphabetically
    'ApplicationModule',
    'AuthModule',
    'HealthModule',
    'InternalCoreModule',
    'MulterModule',
    'PassportModule',
    'SeedModule',
    'TerminusModule',
    'ThrottlerModule',
    'PrismaModule',
  ];
  const modulesContainer = app.get(ModulesContainer);
  const mermaidEdges: string[] = [];
  for (const module of modulesContainer.values()) {
    const from = module.metatype?.name;
    if (!from || genericModules.includes(from)) {
      continue;
    }
    for (const importedModule of module.imports) {
      const to = importedModule.metatype?.name;
      if (!to || genericModules.includes(to)) {
        continue;
      }
      mermaidEdges.push(`  ${from}-->${to}`);
    }
  }
  const mermaidGraph =
    '# Module Dependencies Graph\n\n```mermaid\ngraph LR\n' +
    mermaidEdges.sort().join('\n') +
    '\n```\n';

  fs.writeFile('module-dependencies.md', mermaidGraph, 'utf8', (err) => {
    if (err) console.warn(`Writing API-graph failed!`, err);
  });
}

function generateNrwOpenApiSwagger(app: INestApplication<any>): void {
  // The frontend needs an OpenAPI compatible Swagger export.
  const options = new DocumentBuilder()
    .setTitle(APP_TITLE)
    .setVersion(APP_VERSION)
    .build();
  // Remove `/api` prefix, we'll define that once in frontend environment
  // variable.
  const openApiDocument = SwaggerModule.createDocument(app, options, {
    ignoreGlobalPrefix: true,
  });
  const document = JSON.stringify(openApiDocument, null, 2);
  writeFileSync('nrw.openapi-schema.json', document);
}

function setupAppInsights(): void {
  if (!env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    return;
  }

  appInsights
    .setup(env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoCollectConsole(true, true)
    .start();

  const client = appInsights.defaultClient;

  // Telemetry processor to correlate requests with their origin interface
  client.addTelemetryProcessor((envelope, contextObjects) => {
    const telemetryType = envelope.data?.baseType;
    const baseData = envelope.data?.baseData;

    // Only touch request telemetry
    if (telemetryType === 'RequestData' && baseData) {
      const httpRequest = contextObjects?.http?.request;

      if (httpRequest?.headers) {
        const interfaceName = httpRequest.headers[INTERFACE_NAME_HEADER];

        if (interfaceName) {
          baseData.properties = baseData.properties || {};
          baseData.properties.interface = interfaceName;
        }
      }
    }

    // IMPORTANT: Return `true` in all cases to keep the telemetry
    return true;
  });
}

async function bootstrap(): Promise<void> {
  console.warn(`Bootstrapping ${APP_TITLE} - ${APP_VERSION}`);

  const app = await NestFactory.create(ApplicationModule, {
    // Write via `console` instead of `process.stdout`, so App Insights console auto-collection picks up Nest logs
    logger: new ConsoleLogger({
      forceConsole: true,
      // Colors are on for local dev, but disabled when running in Azure
      colors: IS_DEVELOPMENT,
    }),
  });

  // CORS is only enabled for local development; Because the Azure App Service applies its own CORS settings 'on the outside'
  app.enableCors({
    origin: IS_DEVELOPMENT,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Prepare redirects:
  const expressInstance = app.getHttpAdapter().getInstance();

  if (!!env.REDIRECT_PORTAL_URL_HOST) {
    expressInstance.get(`/`, (__req: Request, res: Response) => {
      res.redirect(env.REDIRECT_PORTAL_URL_HOST);
    });
    expressInstance.get(`/portal{*any}`, (req: Request, res: Response) => {
      const newPath = req.url.replace(`/portal`, '');
      res.redirect(env.REDIRECT_PORTAL_URL_HOST + newPath);
    });
  }

  expressInstance.disable('x-powered-by');

  app.setGlobalPrefix('api');

  const options = new DocumentBuilder()
    .setTitle(APP_TITLE)
    .setVersion(APP_VERSION)
    .addServer(env.EXTERNAL_API_SERVICE_URL)
    .build();

  const document = SwaggerModule.createDocument(app, options);
  // Add redirect for convenience and to keep 'legacy'-URL `/docs` working
  expressInstance.use(/^\/docs$/, (_req: unknown, res: Response) =>
    res.redirect('/docs/'),
  );
  SwaggerModule.setup('/docs/', app, document, {
    customSiteTitle: APP_TITLE,
    customfavIcon: APP_FAVICON,
    customCss: SWAGGER_CUSTOM_CSS,
    customJsStr: SWAGGER_CUSTOM_JS,
    swaggerOptions: {
      // See: https://github.com/swagger-api/swagger-ui/blob/master/docs/usage/configuration.md
      deepLinking: true,
      defaultModelExpandDepth: 10,
      defaultModelsExpandDepth: 1,
      displayOperationId: IS_DEVELOPMENT,
      displayRequestDuration: true,
      filter: false,
      operationsSorter: 'alpha',
      persistAuthorization: IS_DEVELOPMENT,
      queryConfigEnabled: IS_DEVELOPMENT,
      showCommonExtensions: true,
      showExtensions: true,
      tagsSorter: 'alpha',
      tryItOutEnabled: IS_DEVELOPMENT,
    },
  });

  app.useGlobalPipes(new ValidationPipe(ValidationPipeOptions));
  app.useGlobalFilters(new HttpExceptionLoggingFilter());
  app.use(bodyParser.json({ limit: '25mb' }));
  app.use(
    bodyParser.urlencoded({
      limit: '25mb',
      extended: true,
    }),
  );
  app.use(cookieParser());

  const server = await app.listen(env.PORT_API_SERVICE);
  server.setTimeout(10 * 60 * 1000);

  if (IS_DEVELOPMENT) {
    generateModuleDependencyGraph(app);
    generateNrwOpenApiSwagger(app);
  }

  // Set up generic error handling:
  process.on(
    'unhandledRejection',
    (reason: string, promise: Promise<unknown>) => {
      console.warn('Unhandled Rejection:', reason, promise);
      throw reason;
    },
  );

  process.on('uncaughtException', (error: Error) => {
    console.warn('Uncaught Exception:', error);

    const logService = new AzureLogService();
    if (logService) {
      logService.logError({ error, alert: true });
      logService.logError({
        error: new Error('Uncaught Exception: restarting'),
        alert: true,
      });
    }

    // eslint-disable-next-line n/no-process-exit -- Trigger a reboot, as the app is in an unknown state.
    process.exit(1);
  });
}

// App Insights patches `console` at setup, so it must run before anything is logged
setupAppInsights();
void bootstrap();

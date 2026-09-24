import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 请求体上限：Express 默认只有 100KB。回复 / 转发会把原邮件引用进正文，
  // 原邮件里的内嵌图片是 base64，正文动辄几百 KB 到几 MB，超过上限会直接
  // 失败（之前被异常过滤器报成 500"服务器内部错误"）。附件走单独的上传
  // 接口，不受这里影响。外层反向代理的请求体上限（如 nginx
  // client_max_body_size）要不小于这个值，备份导入还需要更大（建议 200M）。
  app.useBodyParser('json', { limit: '30mb' });
  app.useBodyParser('urlencoded', { limit: '30mb', extended: true });
  
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 3000);
  const apiPrefix = configService.get<string>('apiPrefix', 'api');

  // 🚨 FIX: BigInt JSON serialization
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };

  // Serve uploaded files statically (before API prefix)
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Global prefix
  app.setGlobalPrefix(apiPrefix);

  // CORS
  app.enableCors({
    origin: configService.get<string>('corsOrigin', '*'),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type,Authorization,Accept,X-Requested-With',
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global response transform interceptor
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('维界系统 API')
    .setDescription('维界系统（CRM）API 文档')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: '请输入JWT Token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('认证', 'Authentication endpoints')
    .addTag('用户', 'User management')
    .addTag('客户', 'Customer management')
    .addTag('联系人', 'Contact management')
    .addTag('线索', 'Lead management')
    .addTag('邮件', 'Email management')
    .addTag('报价单', 'Quotation management')
    .addTag('订单', 'Order management')
    .addTag('任务', 'Task management')
    .addTag('活动', 'Activity management')
    .addTag('文档', 'Document management')
    .addTag('仪表盘', 'Dashboard')
    .addTag('设置', 'Settings')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
    },
  });

  await app.listen(port);
  logger.log(`Application running on: http://localhost:${port}`);
  logger.log(`Swagger docs available at: http://localhost:${port}/api-docs`);
}

bootstrap();

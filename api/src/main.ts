import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length ? origins : true,
    credentials: true,
  });

  const port = Number.parseInt(process.env.APP_EXPOSE_PORT ?? '8012', 10);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  console.log(`spider-api listening on http://${host}:${port}`);
}

bootstrap();

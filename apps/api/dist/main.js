import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
async function bootstrap() {
    const app = await NestFactory.create(AppModule, new FastifyAdapter());
    app.setGlobalPrefix('api');
    await app.listen({
        port: Number(process.env.PORT ?? 3001),
        host: '0.0.0.0',
    });
}
bootstrap();
//# sourceMappingURL=main.js.map
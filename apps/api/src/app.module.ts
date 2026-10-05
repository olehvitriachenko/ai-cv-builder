import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.js';
import { PrismaModule } from './infrastructure/index.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CvModule } from './modules/cv/cv.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    CvModule,
  ],
})
export class AppModule {}

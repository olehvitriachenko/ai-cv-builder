import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './guards/auth.guard.js';
import { AuthService } from './services/auth.service.js';
import { PasswordService } from './services/password.service.js';
import { SessionService } from './services/session.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    PasswordService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { CvController } from './cv.controller.js';
import { CvService } from './cv.service.js';

@Module({
  controllers: [CvController],
  providers: [CvService],
})
export class CvModule {}

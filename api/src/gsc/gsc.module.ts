import { Module } from '@nestjs/common';
import { GscService } from './gsc.service';

@Module({
  providers: [GscService],
  exports: [GscService],
})
export class GscModule {}

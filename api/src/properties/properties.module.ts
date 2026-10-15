import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GscModule } from '../gsc/gsc.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { Property } from './entities/property.entity';
import { PropertiesService } from './properties.service';

@Module({
  imports: [TypeOrmModule.forFeature([Property]), GscModule, WorkspacesModule],
  providers: [PropertiesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}

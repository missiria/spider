import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceMember } from './entities/workspace-member.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspacesService } from './workspaces.service';

@Module({
  imports: [TypeOrmModule.forFeature([Workspace, WorkspaceMember])],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}

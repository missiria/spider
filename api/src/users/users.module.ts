import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { UserSession } from './entities/user-session.entity';
import { User } from './entities/user.entity';
import { SessionsService } from './sessions.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserSession]), WorkspacesModule],
  controllers: [UsersController],
  providers: [UsersService, SessionsService],
  exports: [UsersService, SessionsService],
})
export class UsersModule {}

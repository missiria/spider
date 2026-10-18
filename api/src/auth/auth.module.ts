import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationsModule } from '../integrations/integrations.module';
import { User } from '../users/entities/user.entity';
import { WorkspaceMember } from '../workspaces/entities/workspace-member.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { SignupService } from './signup.service';
import { SignupsController } from './signups.controller';
import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    UsersModule,
    IntegrationsModule,
    TypeOrmModule.forFeature([User, PasswordReset, Workspace, WorkspaceMember]),
    WorkspacesModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'default_dev_secret',
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') || '24h') as never,
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, SignupService],
  controllers: [AuthController, SignupsController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}

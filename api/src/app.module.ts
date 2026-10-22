import { AdminModule } from './admin/admin.module';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { ClientIpThrottlerGuard } from './auth/client-ip.throttler.guard';
import { RolesGuard } from './auth/roles.guard';
import { DefaultAdminSeeder } from './bootstrap/default-admin.seeder';
import { GscModule } from './gsc/gsc.module';
import { HealthController } from './health/health.controller';
import { Property } from './properties/entities/property.entity';
import { SyncRun } from './sync/entities/sync-run.entity';
import { IntegrationsModule } from './integrations/integrations.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { ReportsModule } from './reports/reports.module';
import { OverviewModule } from './overview/overview.module';
import { PropertiesModule } from './properties/properties.module';
import { SettingsController } from './settings/settings.controller';
import { SyncModule } from './sync/sync.module';
import { UsersModule } from './users/users.module';
import { ViewsModule } from './views/views.module';
import { requestContextMiddleware } from './workspaces/request-context';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // operator CLIs (src/cli) load the module graph without the cron workers
    ...(process.env.SPIDER_CLI === '1' ? [] : [ScheduleModule.forRoot()]),
    // global: 300 requests / minute / IP; login keeps its own 10 / minute (see AuthController)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number.parseInt(process.env.DB_PORT ?? '3306', 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
      synchronize: process.env.TYPEORM_SYNCHRONIZE === 'true',
      migrationsRun: process.env.TYPEORM_MIGRATIONS_RUN === 'true',
      autoLoadEntities: true,
      // DATE columns come back as 'YYYY-MM-DD' strings, not JS Dates in local time
      dateStrings: ['DATE'],
      retryAttempts: 10,
      retryDelay: 3000,
    }),
    TypeOrmModule.forFeature([Property, SyncRun]),
    UsersModule,
    AuthModule,
    WorkspacesModule,
    GscModule,
    PropertiesModule,
    SyncModule,
    OverviewModule,
    ViewsModule,
    OpportunitiesModule,
    IntegrationsModule,
    ReportsModule,
    AdminModule,
  ],
  controllers: [AppController, HealthController, SettingsController],
  providers: [
    { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    DefaultAdminSeeder,
  ],
})
export class AppModule implements NestModule {
  /** Opens the per-request tenant store before any guard runs (ADR-0007). */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestContextMiddleware).forRoutes('{*path}');
  }
}

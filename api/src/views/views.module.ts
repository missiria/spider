import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertiesModule } from '../properties/properties.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { SavedView } from './entities/saved-view.entity';
import { ViewsController } from './views.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SavedView]),
    WorkspacesModule,
    PropertiesModule,
  ],
  controllers: [ViewsController],
})
export class ViewsModule {}

import { Module } from '@nestjs/common';
import { CacheService } from '../common/cache/cache.service';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesRepository } from './deliveries.repository';
import { DeliveriesService } from './deliveries.service';
import { CachedRouteProvider } from './providers/cached.route.provider';
import { MockRouteProvider } from './providers/mock.route.provider';
import { ROUTE_PROVIDER } from './providers/route.provider';

@Module({
  controllers: [DeliveriesController],
  providers: [
    DeliveriesService,
    DeliveriesRepository,
    // MockRouteProvider is registered as a named provider so it can be injected
    // into the CachedRouteProvider factory and spied on in e2e tests.
    MockRouteProvider,
    {
      provide: ROUTE_PROVIDER,
      useFactory: (mock: MockRouteProvider, cache: CacheService) =>
        new CachedRouteProvider(mock, cache),
      inject: [MockRouteProvider, CacheService],
    },
  ],
})
export class DeliveriesModule {}

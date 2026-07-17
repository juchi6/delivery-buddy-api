import { CacheService } from '../../common/cache/cache.service';
import type { LatLng, RouteProvider, RouteResult } from './route.provider';

const ROUTE_CACHE_TTL_SECONDS = 30;

// Decorator that wraps any RouteProvider and caches results keyed by deliveryId.
// Consumers depend only on the RouteProvider interface token and are unaware of caching.
export class CachedRouteProvider implements RouteProvider {
  constructor(
    private readonly inner: RouteProvider,
    private readonly cache: CacheService,
  ) {}

  async getRoute(deliveryId: string, pickup: LatLng, destination: LatLng): Promise<RouteResult> {
    const key = `route:${deliveryId}`;
    const cached = await this.cache.get<RouteResult>(key);
    if (cached) return cached;

    const result = await this.inner.getRoute(deliveryId, pickup, destination);
    await this.cache.set(key, result, ROUTE_CACHE_TTL_SECONDS);
    return result;
  }
}

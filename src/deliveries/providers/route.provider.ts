export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteResult {
  etaMinutes: number;
  distanceKm: number;
  // Encoded polyline; MockRouteProvider returns a deterministic coordinate string.
  // A production implementation (Mapbox / Google Maps Directions API) would return
  // a proper Google-encoded polyline here.
  polyline: string;
  trafficAlert: string | null;
}

// DI token — consumers inject this token so they are unaware of which
// implementation (mock vs cached vs real) sits behind it.
export const ROUTE_PROVIDER = 'ROUTE_PROVIDER';

export interface RouteProvider {
  // deliveryId is included so caching decorators can build a stable cache key
  // without needing to hash raw coordinates.
  getRoute(deliveryId: string, pickup: LatLng, destination: LatLng): Promise<RouteResult>;
}

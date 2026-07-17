import { Injectable } from '@nestjs/common';
import type { LatLng, RouteProvider, RouteResult } from './route.provider';

// Production replacement: inject ConfigService, call Mapbox Directions API or
// Google Maps Directions API behind this same interface with the API key from config.
// The haversine formula below gives stable, plausible values without any paid API key.

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinHalfDLat = Math.sin(dLat / 2);
  const sinHalfDLng = Math.sin(dLng / 2);
  const h =
    sinHalfDLat * sinHalfDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinHalfDLng * sinHalfDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

@Injectable()
export class MockRouteProvider implements RouteProvider {
  getRoute(_deliveryId: string, pickup: LatLng, destination: LatLng): Promise<RouteResult> {
    const distanceKm = haversineKm(pickup, destination);
    const etaMinutes = Math.max(1, Math.ceil(distanceKm / 0.5)); // ~30 km/h average
    return Promise.resolve({
      etaMinutes,
      distanceKm: Math.round(distanceKm * 100) / 100,
      polyline: `mock:${pickup.lat.toFixed(4)},${pickup.lng.toFixed(4)}:${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`,
      trafficAlert: distanceKm > 5 ? 'Traffic detected — expect 2 min delay' : null,
    });
  }
}

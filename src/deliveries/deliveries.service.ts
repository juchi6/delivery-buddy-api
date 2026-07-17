import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryStatus } from '@prisma/client';
import { ROUTE_PROVIDER } from './providers/route.provider';
import type { RouteProvider } from './providers/route.provider';
import { DeliveriesRepository } from './deliveries.repository';
import type { DeliveryWithItems } from './deliveries.repository';
import type { DeliveryResponseDto } from './dto/delivery-response.dto';
import type { RouteResponseDto } from './dto/route-response.dto';
import type { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';

// One-step-at-a-time state machine for driver-initiated status changes.
// CANCELLED is intentionally excluded — it is a system action, not a driver action.
const NEXT_STATUS: Partial<Record<DeliveryStatus, DeliveryStatus>> = {
  [DeliveryStatus.PENDING]: DeliveryStatus.IN_PROGRESS,
  [DeliveryStatus.IN_PROGRESS]: DeliveryStatus.AT_DOOR,
  [DeliveryStatus.AT_DOOR]: DeliveryStatus.DELIVERED,
};

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly repo: DeliveriesRepository,
    @Inject(ROUTE_PROVIDER) private readonly routeProvider: RouteProvider,
  ) {}

  async getCurrentDelivery(driverId: string): Promise<DeliveryResponseDto> {
    const delivery = await this.repo.findCurrentDelivery(driverId);
    if (!delivery) throw new NotFoundException('No delivery in progress');
    return this.toDto(delivery);
  }

  async getNextDelivery(driverId: string): Promise<DeliveryResponseDto> {
    const delivery = await this.repo.findNextDelivery(driverId);
    if (!delivery) throw new NotFoundException('No pending delivery');
    return this.toDto(delivery);
  }

  async getDeliveryById(deliveryId: string, driverId: string): Promise<DeliveryResponseDto> {
    const delivery = await this.repo.findDeliveryById(deliveryId);
    // Return 404 for both not-found and wrong-driver — do not leak existence of other drivers' orders.
    if (!delivery || delivery.driverId !== driverId) {
      throw new NotFoundException('Delivery not found');
    }
    return this.toDto(delivery);
  }

  async updateStatus(
    deliveryId: string,
    driverId: string,
    dto: UpdateDeliveryStatusDto,
  ): Promise<DeliveryResponseDto> {
    const delivery = await this.repo.findDeliveryById(deliveryId);
    if (!delivery || delivery.driverId !== driverId) {
      throw new NotFoundException('Delivery not found');
    }

    const allowed = NEXT_STATUS[delivery.status];
    if (!allowed || allowed !== dto.status) {
      const hint = allowed ? `Allowed next status: ${allowed}` : 'No further transitions allowed (terminal state)';
      throw new BadRequestException(
        `Invalid status transition: ${delivery.status} → ${dto.status}. ${hint}`,
      );
    }

    return this.toDto(await this.repo.updateDeliveryStatus(deliveryId, dto.status));
  }

  async getRoute(deliveryId: string, driverId: string): Promise<RouteResponseDto> {
    const delivery = await this.repo.findDeliveryById(deliveryId);
    if (!delivery || delivery.driverId !== driverId) {
      throw new NotFoundException('Delivery not found');
    }

    const pickup = this.addressToLatLng(delivery.pickupAddress);
    const destination = this.addressToLatLng(delivery.destinationAddress);
    return this.routeProvider.getRoute(deliveryId, pickup, destination);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private toDto(d: DeliveryWithItems): DeliveryResponseDto {
    return {
      id: d.id,
      orderNumber: d.orderNumber,
      status: d.status,
      driverId: d.driverId,
      shiftId: d.shiftId,
      pickupName: d.pickupName,
      pickupAddress: d.pickupAddress,
      destinationCustomerName: d.destinationCustomerName,
      destinationAddress: d.destinationAddress,
      destinationPhone: d.destinationPhone,
      totalAmount: d.totalAmount,
      driverEarning: d.driverEarning,
      tipAmount: d.tipAmount,
      paymentMethod: d.paymentMethod,
      eta: d.eta,
      distanceRemainingKm: d.distanceRemainingKm,
      createdAt: d.createdAt,
      deliveredAt: d.deliveredAt,
      orderItems: d.orderItems.map((item) => ({
        id: item.id,
        name: item.name,
        basePrice: item.basePrice,
        modifiersDescription: item.modifiersDescription,
        extraPrice: item.extraPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
      })),
    };
  }

  // Deterministic pseudo-geocoder — production would call Mapbox / Google Maps Geocoding API
  // sourced from ConfigService.
  private addressToLatLng(address: string): { lat: number; lng: number } {
    let h = 0;
    for (let i = 0; i < address.length; i++) {
      h = ((h << 5) - h + address.charCodeAt(i)) | 0;
    }
    return {
      lat: 40.7 + (Math.abs(h) % 900) / 10000,
      lng: -74.0 + (Math.abs(h >> 12) % 900) / 10000,
    };
  }
}

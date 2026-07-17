import { Injectable } from '@nestjs/common';
import { DeliveryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Delivery with all order items — used for every response DTO.
export type DeliveryWithItems = Prisma.DeliveryGetPayload<{ include: { orderItems: true } }>;

@Injectable()
export class DeliveriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCurrentDelivery(driverId: string): Promise<DeliveryWithItems | null> {
    return this.prisma.delivery.findFirst({
      where: { driverId, status: DeliveryStatus.IN_PROGRESS },
      include: { orderItems: true },
    });
  }

  findNextDelivery(driverId: string): Promise<DeliveryWithItems | null> {
    return this.prisma.delivery.findFirst({
      where: { driverId, status: DeliveryStatus.PENDING },
      orderBy: { createdAt: 'asc' }, // oldest pending first
      include: { orderItems: true },
    });
  }

  findDeliveryById(id: string): Promise<DeliveryWithItems | null> {
    return this.prisma.delivery.findUnique({
      where: { id },
      include: { orderItems: true },
    });
  }

  updateDeliveryStatus(id: string, status: DeliveryStatus): Promise<DeliveryWithItems> {
    return this.prisma.delivery.update({
      where: { id },
      data: {
        status,
        // Stamp the exact completion time when the driver marks a delivery as done.
        ...(status === DeliveryStatus.DELIVERED ? { deliveredAt: new Date() } : {}),
      },
      include: { orderItems: true },
    });
  }
}

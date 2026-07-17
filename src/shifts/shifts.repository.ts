import { Injectable } from '@nestjs/common';
import { Prisma, Shift, ShiftStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Shift row with all linked deliveries — used only inside stopShift to compute totals.
export type ShiftWithDeliveries = Prisma.ShiftGetPayload<{ include: { deliveries: true } }>;

@Injectable()
export class ShiftsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveShift(driverId: string): Promise<Shift | null> {
    return this.prisma.shift.findFirst({
      where: { driverId, status: ShiftStatus.ACTIVE },
    });
  }

  createShift(driverId: string): Promise<Shift> {
    return this.prisma.shift.create({ data: { driverId } });
  }

  findShiftById(id: string): Promise<ShiftWithDeliveries | null> {
    return this.prisma.shift.findUnique({
      where: { id },
      include: { deliveries: true },
    });
  }

  updateShift(id: string, data: Prisma.ShiftUpdateInput): Promise<Shift> {
    return this.prisma.shift.update({ where: { id }, data });
  }

  findShiftHistory(driverId: string): Promise<Shift[]> {
    return this.prisma.shift.findMany({
      where: { driverId, status: ShiftStatus.COMPLETED },
      orderBy: { startedAt: 'desc' },
    });
  }
}

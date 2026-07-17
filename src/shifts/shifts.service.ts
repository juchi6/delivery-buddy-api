import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryStatus, Shift, ShiftStatus } from '@prisma/client';
import type { ShiftResponseDto } from './dto/shift-response.dto';
import { ShiftsRepository } from './shifts.repository';

@Injectable()
export class ShiftsService {
  constructor(private readonly repo: ShiftsRepository) {}

  async startShift(driverId: string): Promise<ShiftResponseDto> {
    // Only one shift may be ACTIVE per driver at a time.
    const active = await this.repo.findActiveShift(driverId);
    if (active) {
      throw new ConflictException('A shift is already active');
    }
    return this.toDto(await this.repo.createShift(driverId));
  }

  async stopShift(shiftId: string, driverId: string): Promise<ShiftResponseDto> {
    const shift = await this.repo.findShiftById(shiftId);

    // Return 404 for both "not found" and "belongs to another driver" —
    // leaking shift existence for another driver's ID would be a data exposure.
    if (!shift || shift.driverId !== driverId) {
      throw new NotFoundException('Shift not found');
    }

    if (shift.status === ShiftStatus.COMPLETED) {
      throw new ConflictException('Shift is already completed');
    }

    // Aggregate totals from DELIVERED deliveries only.
    // Non-delivered (IN_PROGRESS, AT_DOOR, CANCELLED) do not count toward earnings.
    // All totals will be 0 until the deliveries module is implemented.
    const delivered = shift.deliveries.filter(
      (d) => d.status === DeliveryStatus.DELIVERED,
    );
    const earnings = delivered.reduce((sum, d) => sum + d.driverEarning, 0);
    const tips = delivered.reduce((sum, d) => sum + d.tipAmount, 0);
    const deliveriesCompleted = delivered.length;

    return this.toDto(
      await this.repo.updateShift(shiftId, {
        status: ShiftStatus.COMPLETED,
        endedAt: new Date(),
        earnings,
        tips,
        deliveriesCompleted,
      }),
    );
  }

  async getCurrentShift(driverId: string): Promise<ShiftResponseDto> {
    const shift = await this.repo.findActiveShift(driverId);
    if (!shift) throw new NotFoundException('No active shift');
    return this.toDto(shift);
  }

  async getShiftHistory(driverId: string): Promise<ShiftResponseDto[]> {
    const shifts = await this.repo.findShiftHistory(driverId);
    return shifts.map((s) => this.toDto(s));
  }

  private toDto(shift: Shift): ShiftResponseDto {
    return {
      id: shift.id,
      driverId: shift.driverId,
      startedAt: shift.startedAt,
      endedAt: shift.endedAt,
      status: shift.status,
      earnings: shift.earnings,
      tips: shift.tips,
      deliveriesCompleted: shift.deliveriesCompleted,
    };
  }
}

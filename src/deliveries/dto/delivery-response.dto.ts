import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryStatus } from '@prisma/client';
import { OrderItemDto } from './order-item.dto';

export class DeliveryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() orderNumber: string;
  @ApiProperty({ enum: DeliveryStatus }) status: DeliveryStatus;
  @ApiProperty() driverId: string;
  @ApiPropertyOptional({ nullable: true }) shiftId: string | null;

  @ApiProperty() pickupName: string;
  @ApiProperty() pickupAddress: string;

  @ApiProperty() destinationCustomerName: string;
  @ApiProperty() destinationAddress: string;
  @ApiProperty() destinationPhone: string;

  @ApiProperty() totalAmount: number;
  @ApiProperty() driverEarning: number;
  @ApiProperty() tipAmount: number;
  @ApiProperty() paymentMethod: string;

  @ApiPropertyOptional({ nullable: true }) eta: number | null;
  @ApiPropertyOptional({ nullable: true }) distanceRemainingKm: number | null;

  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional({ nullable: true }) deliveredAt: Date | null;

  @ApiProperty({ type: [OrderItemDto] }) orderItems: OrderItemDto[];
}

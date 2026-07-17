import { ApiProperty } from '@nestjs/swagger';
import { DeliveryStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateDeliveryStatusDto {
  @ApiProperty({
    enum: DeliveryStatus,
    description: 'Legal driver-initiated transitions: PENDING → IN_PROGRESS → AT_DOOR → DELIVERED. Skipping states or reversing is rejected with 400.',
  })
  @IsEnum(DeliveryStatus)
  status: DeliveryStatus;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShiftStatus } from '@prisma/client';

export class ShiftResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() driverId: string;
  @ApiProperty() startedAt: Date;
  @ApiPropertyOptional({ nullable: true }) endedAt: Date | null;
  @ApiProperty({ enum: ShiftStatus }) status: ShiftStatus;
  @ApiProperty() earnings: number;
  @ApiProperty() tips: number;
  @ApiProperty() deliveriesCompleted: number;
}

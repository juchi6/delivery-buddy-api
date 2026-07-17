import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '@prisma/client';

export class TransactionDto {
  @ApiProperty() id: string;
  @ApiProperty() driverId: string;
  @ApiPropertyOptional({ nullable: true, description: 'Null for withdrawals' })
  deliveryId: string | null;
  @ApiProperty({ enum: TransactionType }) type: TransactionType;
  @ApiProperty() amount: number;
  @ApiProperty() occurredAt: Date;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrderItemDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() basePrice: number;
  @ApiPropertyOptional({ nullable: true }) modifiersDescription: string | null;
  @ApiProperty() extraPrice: number;
  @ApiProperty() quantity: number;
  @ApiProperty({ description: '(basePrice + extraPrice) × quantity — pre-computed in DB' })
  lineTotal: number;
}

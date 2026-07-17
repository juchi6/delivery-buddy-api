import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class WithdrawDto {
  @ApiProperty({
    description: 'Amount to withdraw — must be positive and must not exceed the current balance',
    minimum: 0.01,
    example: 25.00,
  })
  @IsNumber()
  @IsPositive()
  amount: number;
}

import { ApiProperty } from '@nestjs/swagger';
import { TransactionDto } from './transaction.dto';

export class WithdrawResponseDto {
  @ApiProperty({ description: 'Opaque reference from the payout provider (mock in this implementation)' })
  reference: string;

  @ApiProperty({ type: TransactionDto, description: 'The WITHDRAWAL transaction that was recorded' })
  transaction: TransactionDto;

  @ApiProperty({ description: 'Remaining balance after the withdrawal' })
  newBalance: number;
}

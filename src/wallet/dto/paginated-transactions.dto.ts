import { ApiProperty } from '@nestjs/swagger';
import { TransactionDto } from './transaction.dto';

export class PaginatedTransactionsDto {
  @ApiProperty({ type: [TransactionDto] }) data: TransactionDto[];
  @ApiProperty({ description: 'Total number of transactions for this driver across all pages' })
  total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}

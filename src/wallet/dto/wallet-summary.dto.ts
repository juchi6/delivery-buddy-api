import { ApiProperty } from '@nestjs/swagger';

export class WalletSummaryDto {
  @ApiProperty({ description: 'Spendable balance: totalEarnings + totalTips − totalWithdrawn' })
  balance: number;

  @ApiProperty({ description: 'Sum of all EARNING transaction amounts' })
  totalEarnings: number;

  @ApiProperty({ description: 'Sum of all TIP transaction amounts' })
  totalTips: number;

  @ApiProperty({ description: 'Sum of all WITHDRAWAL transaction amounts' })
  totalWithdrawn: number;

  @ApiProperty({ description: 'Driver gamification level (from driver profile)' })
  level: number;

  @ApiProperty({ description: 'Per-delivery commission rate, e.g. 0.15 = 15% (from driver profile)' })
  commissionRate: number;
}

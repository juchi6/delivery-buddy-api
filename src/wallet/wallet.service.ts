import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Transaction, TransactionType } from '@prisma/client';
import { PAYOUT_PROVIDER } from './providers/payout.provider';
import type { PayoutProvider } from './providers/payout.provider';
import type { PaginatedTransactionsDto } from './dto/paginated-transactions.dto';
import type { PaginationQueryDto } from './dto/pagination-query.dto';
import type { TransactionDto } from './dto/transaction.dto';
import type { WalletSummaryDto } from './dto/wallet-summary.dto';
import type { WithdrawDto } from './dto/withdraw.dto';
import type { WithdrawResponseDto } from './dto/withdraw-response.dto';
import { WalletRepository } from './wallet.repository';

@Injectable()
export class WalletService {
  constructor(
    private readonly repo: WalletRepository,
    @Inject(PAYOUT_PROVIDER) private readonly payoutProvider: PayoutProvider,
  ) {}

  async getWalletSummary(driverId: string): Promise<WalletSummaryDto> {
    const [groups, driver] = await Promise.all([
      this.repo.getTransactionSumsByType(driverId),
      this.repo.findDriverInfo(driverId),
    ]);

    let totalEarnings = 0;
    let totalTips = 0;
    let totalWithdrawn = 0;

    for (const g of groups) {
      if (g.type === TransactionType.EARNING) totalEarnings = g._sum.amount ?? 0;
      if (g.type === TransactionType.TIP) totalTips = g._sum.amount ?? 0;
      if (g.type === TransactionType.WITHDRAWAL) totalWithdrawn = g._sum.amount ?? 0;
    }

    // balance = earnings + tips - withdrawals (invariant maintained on every withdrawal)
    return {
      balance: totalEarnings + totalTips - totalWithdrawn,
      totalEarnings,
      totalTips,
      totalWithdrawn,
      level: driver?.level ?? 1,
      commissionRate: driver?.commissionRate ?? 0,
    };
  }

  async getTransactions(driverId: string, query: PaginationQueryDto): Promise<PaginatedTransactionsDto> {
    const { page, limit } = query;
    const { data, total } = await this.repo.findTransactions(driverId, page, limit);
    return { data: data.map((t) => this.toTransactionDto(t)), total, page, limit };
  }

  async withdraw(driverId: string, dto: WithdrawDto): Promise<WithdrawResponseDto> {
    const summary = await this.getWalletSummary(driverId);

    // Guard: never allow a withdrawal that would result in a negative balance.
    if (dto.amount > summary.balance) {
      throw new BadRequestException(
        `Insufficient balance. Requested: ${dto.amount}, available: ${summary.balance}`,
      );
    }

    const payout = await this.payoutProvider.withdraw(driverId, dto.amount);
    const transaction = await this.repo.createWithdrawal(driverId, dto.amount);

    return {
      reference: payout.reference,
      transaction: this.toTransactionDto(transaction),
      newBalance: summary.balance - dto.amount,
    };
  }

  private toTransactionDto(t: Transaction): TransactionDto {
    return {
      id: t.id,
      driverId: t.driverId,
      deliveryId: t.deliveryId,
      type: t.type,
      amount: t.amount,
      occurredAt: t.occurredAt,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { Transaction, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Returns one row per transaction type found, with the sum of amounts.
  // Types with no rows are absent from the result (caller initialises to 0).
  getTransactionSumsByType(driverId: string) {
    return this.prisma.transaction.groupBy({
      by: ['type'],
      where: { driverId },
      _sum: { amount: true },
    });
  }

  findDriverInfo(driverId: string) {
    return this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { level: true, commissionRate: true },
    });
  }

  async findTransactions(
    driverId: string,
    page: number,
    limit: number,
  ): Promise<{ data: Transaction[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { driverId },
        orderBy: { occurredAt: 'desc' }, // newest first
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where: { driverId } }),
    ]);
    return { data, total };
  }

  createWithdrawal(driverId: string, amount: number): Promise<Transaction> {
    return this.prisma.transaction.create({
      data: { driverId, type: TransactionType.WITHDRAWAL, amount },
    });
  }
}

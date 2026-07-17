import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionType } from '@prisma/client';
import { PAYOUT_PROVIDER } from './providers/payout.provider';
import { WalletRepository } from './wallet.repository';
import { WalletService } from './wallet.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeTransaction = (overrides: Record<string, unknown> = {}) => ({
  id: 'txn-1',
  driverId: 'driver-1',
  deliveryId: null,
  type: TransactionType.WITHDRAWAL,
  amount: 20,
  occurredAt: new Date('2024-01-01T10:00:00Z'),
  ...overrides,
});

const makeSumGroup = (type: TransactionType, amount: number) => ({
  type,
  _sum: { amount },
});

const DRIVER_INFO = { level: 2, commissionRate: 0.15 };

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRepo = {
  getTransactionSumsByType: jest.fn(),
  findDriverInfo: jest.fn(),
  findTransactions: jest.fn(),
  createWithdrawal: jest.fn(),
};

const mockPayoutProvider = { withdraw: jest.fn() };

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: WalletRepository, useValue: mockRepo },
        { provide: PAYOUT_PROVIDER, useValue: mockPayoutProvider },
      ],
    }).compile();

    service = module.get(WalletService);
  });

  // ── getWalletSummary ───────────────────────────────────────────────────────

  describe('getWalletSummary', () => {
    it('balance equals totalEarnings + totalTips − totalWithdrawn exactly (invariant)', async () => {
      mockRepo.getTransactionSumsByType.mockResolvedValue([
        makeSumGroup(TransactionType.EARNING, 80),
        makeSumGroup(TransactionType.TIP, 10),
        makeSumGroup(TransactionType.WITHDRAWAL, 30),
      ]);
      mockRepo.findDriverInfo.mockResolvedValue(DRIVER_INFO);

      const result = await service.getWalletSummary('driver-1');

      expect(result.totalEarnings).toBe(80);
      expect(result.totalTips).toBe(10);
      expect(result.totalWithdrawn).toBe(30);
      // The invariant: balance must always equal this exact formula
      expect(result.balance).toBe(result.totalEarnings + result.totalTips - result.totalWithdrawn);
      expect(result.balance).toBe(60);
    });

    it('returns zero balance when driver has no transactions', async () => {
      mockRepo.getTransactionSumsByType.mockResolvedValue([]); // no rows
      mockRepo.findDriverInfo.mockResolvedValue(DRIVER_INFO);

      const result = await service.getWalletSummary('driver-1');

      expect(result.balance).toBe(0);
      expect(result.totalEarnings).toBe(0);
      expect(result.totalTips).toBe(0);
      expect(result.totalWithdrawn).toBe(0);
    });

    it('includes level and commissionRate from the Driver table', async () => {
      mockRepo.getTransactionSumsByType.mockResolvedValue([]);
      mockRepo.findDriverInfo.mockResolvedValue({ level: 5, commissionRate: 0.2 });

      const result = await service.getWalletSummary('driver-1');

      expect(result.level).toBe(5);
      expect(result.commissionRate).toBe(0.2);
    });

    it('handles drivers with only one transaction type (e.g. only earnings, no tips or withdrawals)', async () => {
      mockRepo.getTransactionSumsByType.mockResolvedValue([
        makeSumGroup(TransactionType.EARNING, 50),
      ]);
      mockRepo.findDriverInfo.mockResolvedValue(DRIVER_INFO);

      const result = await service.getWalletSummary('driver-1');

      expect(result.balance).toBe(50);
      expect(result.totalTips).toBe(0);
      expect(result.totalWithdrawn).toBe(0);
    });
  });

  // ── getTransactions ────────────────────────────────────────────────────────

  describe('getTransactions', () => {
    it('returns paginated transactions mapped to DTOs with correct page/limit/total', async () => {
      const transactions = [
        makeTransaction({ id: 'txn-2', type: TransactionType.EARNING, amount: 50 }),
        makeTransaction({ id: 'txn-1', type: TransactionType.TIP, amount: 10 }),
      ];
      mockRepo.findTransactions.mockResolvedValue({ data: transactions, total: 5 });

      const result = await service.getTransactions('driver-1', { page: 2, limit: 2 });

      expect(mockRepo.findTransactions).toHaveBeenCalledWith('driver-1', 2, 2);
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(2);
      expect(result.data[0].id).toBe('txn-2');
    });

    it('returns empty data array when page exceeds available results', async () => {
      mockRepo.findTransactions.mockResolvedValue({ data: [], total: 3 });

      const result = await service.getTransactions('driver-1', { page: 10, limit: 20 });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(3);
    });
  });

  // ── withdraw ───────────────────────────────────────────────────────────────

  describe('withdraw', () => {
    it('creates a withdrawal transaction and returns the correct newBalance', async () => {
      // Balance: 80 + 10 - 20 = 70
      mockRepo.getTransactionSumsByType.mockResolvedValue([
        makeSumGroup(TransactionType.EARNING, 80),
        makeSumGroup(TransactionType.TIP, 10),
        makeSumGroup(TransactionType.WITHDRAWAL, 20),
      ]);
      mockRepo.findDriverInfo.mockResolvedValue(DRIVER_INFO);
      mockPayoutProvider.withdraw.mockResolvedValue({ success: true, reference: 'ref-abc' });
      const newTxn = makeTransaction({ id: 'txn-new', type: TransactionType.WITHDRAWAL, amount: 50 });
      mockRepo.createWithdrawal.mockResolvedValue(newTxn);

      const result = await service.withdraw('driver-1', { amount: 50 });

      expect(mockPayoutProvider.withdraw).toHaveBeenCalledWith('driver-1', 50);
      expect(mockRepo.createWithdrawal).toHaveBeenCalledWith('driver-1', 50);
      expect(result.reference).toBe('ref-abc');
      expect(result.transaction.type).toBe(TransactionType.WITHDRAWAL);
      expect(result.newBalance).toBe(20); // 70 - 50
    });

    it('calls payoutProvider.withdraw with the correct driverId and amount', async () => {
      mockRepo.getTransactionSumsByType.mockResolvedValue([
        makeSumGroup(TransactionType.EARNING, 100),
      ]);
      mockRepo.findDriverInfo.mockResolvedValue(DRIVER_INFO);
      mockPayoutProvider.withdraw.mockResolvedValue({ success: true, reference: 'ref-xyz' });
      mockRepo.createWithdrawal.mockResolvedValue(makeTransaction({ amount: 30 }));

      await service.withdraw('driver-42', { amount: 30 });

      expect(mockPayoutProvider.withdraw).toHaveBeenCalledWith('driver-42', 30);
    });

    it('withdrawing the entire balance leaves newBalance of 0', async () => {
      mockRepo.getTransactionSumsByType.mockResolvedValue([
        makeSumGroup(TransactionType.EARNING, 50),
      ]);
      mockRepo.findDriverInfo.mockResolvedValue(DRIVER_INFO);
      mockPayoutProvider.withdraw.mockResolvedValue({ success: true, reference: 'ref-drain' });
      mockRepo.createWithdrawal.mockResolvedValue(makeTransaction({ amount: 50 }));

      const result = await service.withdraw('driver-1', { amount: 50 });

      expect(result.newBalance).toBe(0);
    });

    it('throws BadRequestException when requested amount exceeds current balance', async () => {
      mockRepo.getTransactionSumsByType.mockResolvedValue([
        makeSumGroup(TransactionType.EARNING, 40),
      ]);
      mockRepo.findDriverInfo.mockResolvedValue(DRIVER_INFO);

      await expect(service.withdraw('driver-1', { amount: 40.01 })).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPayoutProvider.withdraw).not.toHaveBeenCalled();
      expect(mockRepo.createWithdrawal).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when balance is 0 and any withdrawal is attempted', async () => {
      mockRepo.getTransactionSumsByType.mockResolvedValue([]);
      mockRepo.findDriverInfo.mockResolvedValue(DRIVER_INFO);

      await expect(service.withdraw('driver-1', { amount: 0.01 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});

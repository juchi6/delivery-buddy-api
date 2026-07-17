import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryStatus, ShiftStatus } from '@prisma/client';
import { ShiftsRepository } from './shifts.repository';
import { ShiftsService } from './shifts.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeShift = (overrides: Record<string, unknown> = {}) => ({
  id: 'shift-1',
  driverId: 'driver-1',
  startedAt: new Date('2024-01-01T08:00:00Z'),
  endedAt: null,
  status: ShiftStatus.ACTIVE,
  earnings: 0,
  tips: 0,
  deliveriesCompleted: 0,
  deliveries: [],
  ...overrides,
});

const makeDelivery = (overrides: Record<string, unknown> = {}) => ({
  id: 'delivery-1',
  status: DeliveryStatus.DELIVERED,
  driverEarning: 10,
  tipAmount: 2,
  ...overrides,
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRepo = {
  findActiveShift: jest.fn(),
  createShift: jest.fn(),
  findShiftById: jest.fn(),
  updateShift: jest.fn(),
  findShiftHistory: jest.fn(),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ShiftsService', () => {
  let service: ShiftsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftsService,
        { provide: ShiftsRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get(ShiftsService);
  });

  // ── startShift ─────────────────────────────────────────────────────────────

  describe('startShift', () => {
    it('creates and returns a new shift when no active shift exists', async () => {
      mockRepo.findActiveShift.mockResolvedValue(null);
      const newShift = makeShift();
      mockRepo.createShift.mockResolvedValue(newShift);

      const result = await service.startShift('driver-1');

      expect(mockRepo.findActiveShift).toHaveBeenCalledWith('driver-1');
      expect(mockRepo.createShift).toHaveBeenCalledWith('driver-1');
      expect(result.id).toBe('shift-1');
      expect(result.status).toBe(ShiftStatus.ACTIVE);
    });

    it('throws ConflictException when a shift is already active', async () => {
      mockRepo.findActiveShift.mockResolvedValue(makeShift());

      await expect(service.startShift('driver-1')).rejects.toThrow(ConflictException);
      expect(mockRepo.createShift).not.toHaveBeenCalled();
    });
  });

  // ── stopShift ──────────────────────────────────────────────────────────────

  describe('stopShift', () => {
    it('stops the shift and correctly sums earnings/tips/deliveriesCompleted from DELIVERED deliveries', async () => {
      const deliveries = [
        makeDelivery({ driverEarning: 10, tipAmount: 2 }),
        makeDelivery({ id: 'delivery-2', driverEarning: 15, tipAmount: 0 }),
      ];
      mockRepo.findShiftById.mockResolvedValue(makeShift({ deliveries }));
      const completed = makeShift({
        status: ShiftStatus.COMPLETED,
        endedAt: new Date(),
        earnings: 25,
        tips: 2,
        deliveriesCompleted: 2,
      });
      mockRepo.updateShift.mockResolvedValue(completed);

      const result = await service.stopShift('shift-1', 'driver-1');

      expect(mockRepo.updateShift).toHaveBeenCalledWith(
        'shift-1',
        expect.objectContaining({
          status: ShiftStatus.COMPLETED,
          earnings: 25,
          tips: 2,
          deliveriesCompleted: 2,
        }),
      );
      expect(result.status).toBe(ShiftStatus.COMPLETED);
    });

    it('totals are all 0 when the shift has no linked deliveries', async () => {
      mockRepo.findShiftById.mockResolvedValue(makeShift({ deliveries: [] }));
      mockRepo.updateShift.mockResolvedValue(
        makeShift({ status: ShiftStatus.COMPLETED, endedAt: new Date() }),
      );

      await service.stopShift('shift-1', 'driver-1');

      expect(mockRepo.updateShift).toHaveBeenCalledWith(
        'shift-1',
        expect.objectContaining({ earnings: 0, tips: 0, deliveriesCompleted: 0 }),
      );
    });

    it('only counts DELIVERED deliveries — IN_PROGRESS, AT_DOOR, and CANCELLED are excluded', async () => {
      const deliveries = [
        makeDelivery({ status: DeliveryStatus.DELIVERED, driverEarning: 10, tipAmount: 1 }),
        makeDelivery({ id: 'd2', status: DeliveryStatus.IN_PROGRESS, driverEarning: 20, tipAmount: 5 }),
        makeDelivery({ id: 'd3', status: DeliveryStatus.CANCELLED, driverEarning: 8, tipAmount: 0 }),
        makeDelivery({ id: 'd4', status: DeliveryStatus.AT_DOOR, driverEarning: 12, tipAmount: 3 }),
      ];
      mockRepo.findShiftById.mockResolvedValue(makeShift({ deliveries }));
      mockRepo.updateShift.mockResolvedValue(makeShift({ status: ShiftStatus.COMPLETED }));

      await service.stopShift('shift-1', 'driver-1');

      expect(mockRepo.updateShift).toHaveBeenCalledWith(
        'shift-1',
        expect.objectContaining({ earnings: 10, tips: 1, deliveriesCompleted: 1 }),
      );
    });

    it('throws NotFoundException when the shift does not exist', async () => {
      mockRepo.findShiftById.mockResolvedValue(null);

      await expect(service.stopShift('nonexistent', 'driver-1')).rejects.toThrow(NotFoundException);
      expect(mockRepo.updateShift).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the shift belongs to a different driver (not leaking existence)', async () => {
      mockRepo.findShiftById.mockResolvedValue(makeShift({ driverId: 'other-driver' }));

      await expect(service.stopShift('shift-1', 'driver-1')).rejects.toThrow(NotFoundException);
      expect(mockRepo.updateShift).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the shift is already completed', async () => {
      mockRepo.findShiftById.mockResolvedValue(
        makeShift({ driverId: 'driver-1', status: ShiftStatus.COMPLETED }),
      );

      await expect(service.stopShift('shift-1', 'driver-1')).rejects.toThrow(ConflictException);
    });
  });

  // ── getCurrentShift ────────────────────────────────────────────────────────

  describe('getCurrentShift', () => {
    it('returns the active shift when one exists', async () => {
      const shift = makeShift();
      mockRepo.findActiveShift.mockResolvedValue(shift);

      const result = await service.getCurrentShift('driver-1');

      expect(result.id).toBe('shift-1');
      expect(result.status).toBe(ShiftStatus.ACTIVE);
    });

    it('throws NotFoundException when no active shift exists', async () => {
      mockRepo.findActiveShift.mockResolvedValue(null);

      await expect(service.getCurrentShift('driver-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getShiftHistory ────────────────────────────────────────────────────────

  describe('getShiftHistory', () => {
    it('returns all completed shifts ordered by the repository (newest first)', async () => {
      const history = [
        makeShift({ id: 'shift-2', status: ShiftStatus.COMPLETED }),
        makeShift({ id: 'shift-1', status: ShiftStatus.COMPLETED }),
      ];
      mockRepo.findShiftHistory.mockResolvedValue(history);

      const result = await service.getShiftHistory('driver-1');

      expect(mockRepo.findShiftHistory).toHaveBeenCalledWith('driver-1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('shift-2');
    });

    it('returns an empty array when the driver has no completed shifts', async () => {
      mockRepo.findShiftHistory.mockResolvedValue([]);

      const result = await service.getShiftHistory('driver-1');

      expect(result).toEqual([]);
    });
  });
});

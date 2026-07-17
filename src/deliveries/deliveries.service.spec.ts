import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryStatus } from '@prisma/client';
import { DeliveriesRepository } from './deliveries.repository';
import { DeliveriesService } from './deliveries.service';
import { ROUTE_PROVIDER } from './providers/route.provider';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-1',
  deliveryId: 'delivery-1',
  name: 'Ham and Cheese Pizza 11 inch',
  basePrice: 12,
  modifiersDescription: '11 inch, extra cheese',
  extraPrice: 2,
  quantity: 1,
  lineTotal: 14, // (12 + 2) × 1
  ...overrides,
});

const makeDelivery = (overrides: Record<string, unknown> = {}) => ({
  id: 'delivery-1',
  orderNumber: 'ORD-001',
  status: DeliveryStatus.PENDING,
  driverId: 'driver-1',
  shiftId: null,
  pickupName: 'Restaurant A',
  pickupAddress: '123 Main St, New York, NY',
  destinationCustomerName: 'John Customer',
  destinationAddress: '456 Oak Ave, Brooklyn, NY',
  destinationPhone: '+1234567890',
  totalAmount: 25,
  driverEarning: 8,
  tipAmount: 2,
  paymentMethod: 'Card',
  eta: null,
  distanceRemainingKm: null,
  createdAt: new Date('2024-01-01T08:00:00Z'),
  deliveredAt: null,
  orderItems: [makeItem()],
  ...overrides,
});

const MOCK_ROUTE = {
  etaMinutes: 12,
  distanceKm: 6.0,
  polyline: 'mock:40.7000,-74.0000:40.7500,-73.9800',
  trafficAlert: 'Traffic detected — expect 2 min delay',
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRepo = {
  findCurrentDelivery: jest.fn(),
  findNextDelivery: jest.fn(),
  findDeliveryById: jest.fn(),
  updateDeliveryStatus: jest.fn(),
};

const mockRouteProvider = { getRoute: jest.fn() };

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('DeliveriesService', () => {
  let service: DeliveriesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveriesService,
        { provide: DeliveriesRepository, useValue: mockRepo },
        { provide: ROUTE_PROVIDER, useValue: mockRouteProvider },
      ],
    }).compile();

    service = module.get(DeliveriesService);
  });

  // ── getCurrentDelivery ─────────────────────────────────────────────────────

  describe('getCurrentDelivery', () => {
    it('returns the IN_PROGRESS delivery mapped to DTO', async () => {
      mockRepo.findCurrentDelivery.mockResolvedValue(
        makeDelivery({ status: DeliveryStatus.IN_PROGRESS }),
      );

      const result = await service.getCurrentDelivery('driver-1');

      expect(result.status).toBe(DeliveryStatus.IN_PROGRESS);
      expect(result.orderItems).toHaveLength(1);
      expect(result.orderItems[0].lineTotal).toBe(14);
    });

    it('throws NotFoundException when no delivery is IN_PROGRESS', async () => {
      mockRepo.findCurrentDelivery.mockResolvedValue(null);

      await expect(service.getCurrentDelivery('driver-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getNextDelivery ────────────────────────────────────────────────────────

  describe('getNextDelivery', () => {
    it('returns the oldest PENDING delivery mapped to DTO', async () => {
      mockRepo.findNextDelivery.mockResolvedValue(makeDelivery());

      const result = await service.getNextDelivery('driver-1');

      expect(result.status).toBe(DeliveryStatus.PENDING);
    });

    it('throws NotFoundException when no PENDING delivery exists', async () => {
      mockRepo.findNextDelivery.mockResolvedValue(null);

      await expect(service.getNextDelivery('driver-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getDeliveryById ────────────────────────────────────────────────────────

  describe('getDeliveryById', () => {
    it('returns the delivery with items when it belongs to the requesting driver', async () => {
      mockRepo.findDeliveryById.mockResolvedValue(makeDelivery());

      const result = await service.getDeliveryById('delivery-1', 'driver-1');

      expect(result.id).toBe('delivery-1');
      expect(result.orderItems[0].lineTotal).toBe(14);
    });

    it('throws NotFoundException when delivery does not exist', async () => {
      mockRepo.findDeliveryById.mockResolvedValue(null);

      await expect(service.getDeliveryById('ghost', 'driver-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when delivery belongs to another driver (not ForbiddenException)', async () => {
      mockRepo.findDeliveryById.mockResolvedValue(makeDelivery({ driverId: 'other-driver' }));

      await expect(service.getDeliveryById('delivery-1', 'driver-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateStatus ───────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('PENDING → IN_PROGRESS is a valid transition', async () => {
      mockRepo.findDeliveryById.mockResolvedValue(makeDelivery({ status: DeliveryStatus.PENDING }));
      mockRepo.updateDeliveryStatus.mockResolvedValue(
        makeDelivery({ status: DeliveryStatus.IN_PROGRESS }),
      );

      const result = await service.updateStatus('delivery-1', 'driver-1', {
        status: DeliveryStatus.IN_PROGRESS,
      });

      expect(mockRepo.updateDeliveryStatus).toHaveBeenCalledWith('delivery-1', DeliveryStatus.IN_PROGRESS);
      expect(result.status).toBe(DeliveryStatus.IN_PROGRESS);
    });

    it('IN_PROGRESS → AT_DOOR is a valid transition', async () => {
      mockRepo.findDeliveryById.mockResolvedValue(
        makeDelivery({ status: DeliveryStatus.IN_PROGRESS }),
      );
      mockRepo.updateDeliveryStatus.mockResolvedValue(
        makeDelivery({ status: DeliveryStatus.AT_DOOR }),
      );

      const result = await service.updateStatus('delivery-1', 'driver-1', {
        status: DeliveryStatus.AT_DOOR,
      });

      expect(result.status).toBe(DeliveryStatus.AT_DOOR);
    });

    it('AT_DOOR → DELIVERED is a valid transition', async () => {
      mockRepo.findDeliveryById.mockResolvedValue(
        makeDelivery({ status: DeliveryStatus.AT_DOOR }),
      );
      mockRepo.updateDeliveryStatus.mockResolvedValue(
        makeDelivery({ status: DeliveryStatus.DELIVERED, deliveredAt: new Date() }),
      );

      const result = await service.updateStatus('delivery-1', 'driver-1', {
        status: DeliveryStatus.DELIVERED,
      });

      expect(result.status).toBe(DeliveryStatus.DELIVERED);
    });

    it('throws BadRequestException for PENDING → DELIVERED (skipping a state)', async () => {
      mockRepo.findDeliveryById.mockResolvedValue(makeDelivery({ status: DeliveryStatus.PENDING }));

      await expect(
        service.updateStatus('delivery-1', 'driver-1', { status: DeliveryStatus.DELIVERED }),
      ).rejects.toThrow(BadRequestException);

      expect(mockRepo.updateDeliveryStatus).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for IN_PROGRESS → PENDING (backwards transition)', async () => {
      mockRepo.findDeliveryById.mockResolvedValue(
        makeDelivery({ status: DeliveryStatus.IN_PROGRESS }),
      );

      await expect(
        service.updateStatus('delivery-1', 'driver-1', { status: DeliveryStatus.PENDING }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when delivery is in a terminal state (DELIVERED)', async () => {
      mockRepo.findDeliveryById.mockResolvedValue(
        makeDelivery({ status: DeliveryStatus.DELIVERED }),
      );

      await expect(
        service.updateStatus('delivery-1', 'driver-1', { status: DeliveryStatus.IN_PROGRESS }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when delivery is CANCELLED (terminal)', async () => {
      mockRepo.findDeliveryById.mockResolvedValue(
        makeDelivery({ status: DeliveryStatus.CANCELLED }),
      );

      await expect(
        service.updateStatus('delivery-1', 'driver-1', { status: DeliveryStatus.IN_PROGRESS }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when delivery belongs to another driver', async () => {
      mockRepo.findDeliveryById.mockResolvedValue(makeDelivery({ driverId: 'other-driver' }));

      await expect(
        service.updateStatus('delivery-1', 'driver-1', { status: DeliveryStatus.IN_PROGRESS }),
      ).rejects.toThrow(NotFoundException);

      expect(mockRepo.updateDeliveryStatus).not.toHaveBeenCalled();
    });
  });

  // ── getRoute ───────────────────────────────────────────────────────────────

  describe('getRoute', () => {
    it('calls routeProvider with deliveryId and derived coordinates, returns route data', async () => {
      mockRepo.findDeliveryById.mockResolvedValue(makeDelivery());
      mockRouteProvider.getRoute.mockResolvedValue(MOCK_ROUTE);

      const result = await service.getRoute('delivery-1', 'driver-1');

      expect(mockRouteProvider.getRoute).toHaveBeenCalledWith(
        'delivery-1',
        expect.objectContaining({ lat: expect.any(Number), lng: expect.any(Number) }),
        expect.objectContaining({ lat: expect.any(Number), lng: expect.any(Number) }),
      );
      expect(result.etaMinutes).toBe(12);
      expect(result.trafficAlert).toBe('Traffic detected — expect 2 min delay');
    });

    it('throws NotFoundException when delivery belongs to another driver', async () => {
      mockRepo.findDeliveryById.mockResolvedValue(makeDelivery({ driverId: 'other-driver' }));

      await expect(service.getRoute('delivery-1', 'driver-1')).rejects.toThrow(NotFoundException);
      expect(mockRouteProvider.getRoute).not.toHaveBeenCalled();
    });
  });
});

import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeNotification = (overrides: Record<string, unknown> = {}) => ({
  id: 'notif-1',
  driverId: 'driver-1',
  type: 'new_delivery',
  body: 'You have a new delivery',
  isRead: false,
  createdAt: new Date('2024-01-01T10:00:00Z'),
  ...overrides,
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRepo = {
  findNotifications: jest.fn(),
  findNotificationById: jest.fn(),
  markAsRead: jest.fn(),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationsRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  // ── getNotifications ───────────────────────────────────────────────────────

  describe('getNotifications', () => {
    it('returns paginated notifications with correct metadata', async () => {
      const notifications = [
        makeNotification({ id: 'notif-3', createdAt: new Date('2024-01-03T10:00:00Z') }),
        makeNotification({ id: 'notif-2', createdAt: new Date('2024-01-02T10:00:00Z') }),
      ];
      mockRepo.findNotifications.mockResolvedValue({ data: notifications, total: 5 });

      const result = await service.getNotifications('driver-1', { page: 1, limit: 2 });

      expect(mockRepo.findNotifications).toHaveBeenCalledWith('driver-1', 1, 2);
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
    });

    it('returns empty data array when driver has no notifications', async () => {
      mockRepo.findNotifications.mockResolvedValue({ data: [], total: 0 });

      const result = await service.getNotifications('driver-1', { page: 1, limit: 20 });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('maps all notification fields to the DTO correctly', async () => {
      const now = new Date();
      mockRepo.findNotifications.mockResolvedValue({
        data: [makeNotification({ isRead: true, createdAt: now, type: 'shift_summary', body: 'Shift done' })],
        total: 1,
      });

      const result = await service.getNotifications('driver-1', { page: 1, limit: 20 });
      const dto = result.data[0];

      expect(dto.isRead).toBe(true);
      expect(dto.type).toBe('shift_summary');
      expect(dto.body).toBe('Shift done');
      expect(dto.createdAt).toEqual(now);
    });

    it('respects page 2 offset — passes correct page to repository', async () => {
      mockRepo.findNotifications.mockResolvedValue({ data: [], total: 3 });

      await service.getNotifications('driver-1', { page: 2, limit: 2 });

      expect(mockRepo.findNotifications).toHaveBeenCalledWith('driver-1', 2, 2);
    });
  });

  // ── markAsRead ─────────────────────────────────────────────────────────────

  describe('markAsRead', () => {
    it('marks notification as read and returns updated DTO', async () => {
      mockRepo.findNotificationById.mockResolvedValue(makeNotification({ isRead: false }));
      mockRepo.markAsRead.mockResolvedValue(makeNotification({ isRead: true }));

      const result = await service.markAsRead('notif-1', 'driver-1');

      expect(mockRepo.markAsRead).toHaveBeenCalledWith('notif-1');
      expect(result.isRead).toBe(true);
    });

    it('calling markAsRead on an already-read notification is idempotent', async () => {
      mockRepo.findNotificationById.mockResolvedValue(makeNotification({ isRead: true }));
      mockRepo.markAsRead.mockResolvedValue(makeNotification({ isRead: true }));

      const result = await service.markAsRead('notif-1', 'driver-1');

      expect(result.isRead).toBe(true);
    });

    it('throws NotFoundException when notification does not exist', async () => {
      mockRepo.findNotificationById.mockResolvedValue(null);

      await expect(service.markAsRead('notif-999', 'driver-1')).rejects.toThrow(NotFoundException);
      expect(mockRepo.markAsRead).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when notification belongs to another driver — no existence leaking', async () => {
      mockRepo.findNotificationById.mockResolvedValue(
        makeNotification({ driverId: 'driver-other' }),
      );

      await expect(service.markAsRead('notif-1', 'driver-1')).rejects.toThrow(NotFoundException);
      expect(mockRepo.markAsRead).not.toHaveBeenCalled();
    });
  });
});

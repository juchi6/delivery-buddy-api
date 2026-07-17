import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MessageSenderType } from '@prisma/client';
import { ChatRepository } from './chat.repository';
import { ChatService } from './chat.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg-1',
  deliveryId: 'del-1',
  senderId: 'driver-1',
  senderType: MessageSenderType.DRIVER,
  body: 'Hello!',
  attachmentUrl: null,
  sentAt: new Date('2024-01-01T10:00:00Z'),
  seenAt: null,
  ...overrides,
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRepo = {
  findDeliveryOwner: jest.fn(),
  findMessagesByDeliveryId: jest.fn(),
  createMessage: jest.fn(),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: ChatRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get(ChatService);
  });

  // ── getMessages ────────────────────────────────────────────────────────────

  describe('getMessages', () => {
    it('returns messages in the order provided by the repository', async () => {
      mockRepo.findDeliveryOwner.mockResolvedValue({ driverId: 'driver-1' });
      const msgs = [
        makeMessage({ id: 'msg-1', sentAt: new Date('2024-01-01T10:00:00Z') }),
        makeMessage({ id: 'msg-2', sentAt: new Date('2024-01-01T10:01:00Z') }),
      ];
      mockRepo.findMessagesByDeliveryId.mockResolvedValue(msgs);

      const result = await service.getMessages('del-1', 'driver-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('msg-1');
      expect(result[1].id).toBe('msg-2');
      expect(mockRepo.findDeliveryOwner).toHaveBeenCalledWith('del-1');
      expect(mockRepo.findMessagesByDeliveryId).toHaveBeenCalledWith('del-1');
    });

    it('returns an empty array when the delivery has no messages yet', async () => {
      mockRepo.findDeliveryOwner.mockResolvedValue({ driverId: 'driver-1' });
      mockRepo.findMessagesByDeliveryId.mockResolvedValue([]);

      const result = await service.getMessages('del-1', 'driver-1');

      expect(result).toEqual([]);
    });

    it('maps all message fields to the DTO correctly', async () => {
      const seenAt = new Date('2024-01-01T11:00:00Z');
      mockRepo.findDeliveryOwner.mockResolvedValue({ driverId: 'driver-1' });
      mockRepo.findMessagesByDeliveryId.mockResolvedValue([
        makeMessage({ attachmentUrl: 'http://cdn.example.com/photo.png', seenAt }),
      ]);

      const [dto] = await service.getMessages('del-1', 'driver-1');

      expect(dto.attachmentUrl).toBe('http://cdn.example.com/photo.png');
      expect(dto.seenAt).toEqual(seenAt);
      expect(dto.senderType).toBe(MessageSenderType.DRIVER);
      expect(dto.senderId).toBe('driver-1');
    });

    it('throws NotFoundException when delivery does not exist', async () => {
      mockRepo.findDeliveryOwner.mockResolvedValue(null);

      await expect(service.getMessages('del-999', 'driver-1')).rejects.toThrow(NotFoundException);
      expect(mockRepo.findMessagesByDeliveryId).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when delivery belongs to another driver — no existence leaking', async () => {
      mockRepo.findDeliveryOwner.mockResolvedValue({ driverId: 'driver-other' });

      await expect(service.getMessages('del-1', 'driver-1')).rejects.toThrow(NotFoundException);
      expect(mockRepo.findMessagesByDeliveryId).not.toHaveBeenCalled();
    });
  });

  // ── sendMessage ────────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('creates message with driverId as senderId and forces senderType to DRIVER', async () => {
      mockRepo.findDeliveryOwner.mockResolvedValue({ driverId: 'driver-1' });
      const created = makeMessage({ id: 'msg-new', body: 'On my way!' });
      mockRepo.createMessage.mockResolvedValue(created);

      const result = await service.sendMessage('del-1', 'driver-1', { body: 'On my way!' });

      expect(mockRepo.createMessage).toHaveBeenCalledWith('del-1', 'driver-1', 'On my way!', undefined);
      expect(result.id).toBe('msg-new');
      expect(result.senderId).toBe('driver-1');
      expect(result.senderType).toBe(MessageSenderType.DRIVER);
    });

    it('passes optional attachmentUrl through to the repository', async () => {
      mockRepo.findDeliveryOwner.mockResolvedValue({ driverId: 'driver-1' });
      mockRepo.createMessage.mockResolvedValue(
        makeMessage({ attachmentUrl: 'http://cdn.example.com/photo.png' }),
      );

      await service.sendMessage('del-1', 'driver-1', {
        body: 'See photo',
        attachmentUrl: 'http://cdn.example.com/photo.png',
      });

      expect(mockRepo.createMessage).toHaveBeenCalledWith(
        'del-1',
        'driver-1',
        'See photo',
        'http://cdn.example.com/photo.png',
      );
    });

    it('returns the created message mapped to a DTO', async () => {
      const now = new Date();
      mockRepo.findDeliveryOwner.mockResolvedValue({ driverId: 'driver-1' });
      mockRepo.createMessage.mockResolvedValue(makeMessage({ sentAt: now, body: 'Test' }));

      const result = await service.sendMessage('del-1', 'driver-1', { body: 'Test' });

      expect(result.sentAt).toEqual(now);
      expect(result.body).toBe('Test');
    });

    it('throws NotFoundException when delivery does not exist', async () => {
      mockRepo.findDeliveryOwner.mockResolvedValue(null);

      await expect(
        service.sendMessage('del-999', 'driver-1', { body: 'Hello' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockRepo.createMessage).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when delivery belongs to another driver — no existence leaking', async () => {
      mockRepo.findDeliveryOwner.mockResolvedValue({ driverId: 'driver-other' });

      await expect(
        service.sendMessage('del-1', 'driver-1', { body: 'Hello' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockRepo.createMessage).not.toHaveBeenCalled();
    });
  });
});

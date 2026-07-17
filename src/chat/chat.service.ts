import { Injectable, NotFoundException } from '@nestjs/common';
import type { Message } from '@prisma/client';
import { ChatRepository } from './chat.repository';
import type { MessageDto } from './dto/message.dto';
import type { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class ChatService {
  constructor(private readonly repo: ChatRepository) {}

  async getMessages(deliveryId: string, driverId: string): Promise<MessageDto[]> {
    const delivery = await this.repo.findDeliveryOwner(deliveryId);
    // Return 404 for both not-found and wrong-driver — do not leak existence of other drivers' threads.
    if (!delivery || delivery.driverId !== driverId) {
      throw new NotFoundException('Delivery not found');
    }
    const messages = await this.repo.findMessagesByDeliveryId(deliveryId);
    return messages.map((m) => this.toDto(m));
  }

  async sendMessage(
    deliveryId: string,
    driverId: string,
    dto: SendMessageDto,
  ): Promise<MessageDto> {
    const delivery = await this.repo.findDeliveryOwner(deliveryId);
    if (!delivery || delivery.driverId !== driverId) {
      throw new NotFoundException('Delivery not found');
    }
    const message = await this.repo.createMessage(deliveryId, driverId, dto.body, dto.attachmentUrl);
    return this.toDto(message);
  }

  private toDto(m: Message): MessageDto {
    return {
      id: m.id,
      deliveryId: m.deliveryId,
      senderId: m.senderId,
      senderType: m.senderType,
      body: m.body,
      attachmentUrl: m.attachmentUrl,
      sentAt: m.sentAt,
      seenAt: m.seenAt,
    };
  }
}

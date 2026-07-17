import { Injectable } from '@nestjs/common';
import { Message, MessageSenderType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  findDeliveryOwner(deliveryId: string): Promise<{ driverId: string } | null> {
    return this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { driverId: true },
    });
  }

  findMessagesByDeliveryId(deliveryId: string): Promise<Message[]> {
    return this.prisma.message.findMany({
      where: { deliveryId },
      orderBy: { sentAt: 'asc' },
    });
  }

  createMessage(
    deliveryId: string,
    senderId: string,
    body: string,
    attachmentUrl?: string,
  ): Promise<Message> {
    return this.prisma.message.create({
      data: {
        deliveryId,
        senderId,
        senderType: MessageSenderType.DRIVER,
        body,
        attachmentUrl: attachmentUrl ?? null,
      },
    });
  }
}

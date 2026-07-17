import { Injectable, NotFoundException } from '@nestjs/common';
import type { Notification } from '@prisma/client';
import type { NotificationDto } from './dto/notification.dto';
import type { PaginatedNotificationsDto } from './dto/paginated-notifications.dto';
import type { PaginationQueryDto } from './dto/pagination-query.dto';
import { NotificationsRepository } from './notifications.repository';

@Injectable()
export class NotificationsService {
  constructor(private readonly repo: NotificationsRepository) {}

  async getNotifications(
    driverId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedNotificationsDto> {
    const { page, limit } = query;
    const { data, total } = await this.repo.findNotifications(driverId, page, limit);
    return { data: data.map(this.toDto), total, page, limit };
  }

  async markAsRead(id: string, driverId: string): Promise<NotificationDto> {
    const notification = await this.repo.findNotificationById(id);
    // Return 404 for both not-found and wrong-driver — do not leak existence of other drivers' notifications.
    if (!notification || notification.driverId !== driverId) {
      throw new NotFoundException('Notification not found');
    }
    return this.toDto(await this.repo.markAsRead(id));
  }

  private toDto(n: Notification): NotificationDto {
    return {
      id: n.id,
      driverId: n.driverId,
      type: n.type,
      body: n.body,
      isRead: n.isRead,
      createdAt: n.createdAt,
    };
  }
}

import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentDriver } from '../common/decorators/current-driver.decorator';
import type { JwtPayload } from '../common/decorators/current-driver.decorator';
import { NotificationDto } from './dto/notification.dto';
import { PaginatedNotificationsDto } from './dto/paginated-notifications.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('me')
  @ApiOperation({ summary: 'List all notifications for the authenticated driver, newest first (paginated)' })
  @ApiResponse({ status: 200, type: PaginatedNotificationsDto })
  getNotifications(
    @CurrentDriver() driver: JwtPayload,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedNotificationsDto> {
    return this.notificationsService.getNotifications(driver.sub, query);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a notification as read (404 for another driver\'s notification)' })
  @ApiResponse({ status: 200, type: NotificationDto })
  @ApiResponse({ status: 404, description: 'Notification not found or belongs to another driver' })
  markAsRead(
    @Param('id') id: string,
    @CurrentDriver() driver: JwtPayload,
  ): Promise<NotificationDto> {
    return this.notificationsService.markAsRead(id, driver.sub);
  }
}

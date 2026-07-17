import { ApiProperty } from '@nestjs/swagger';
import { NotificationDto } from './notification.dto';

export class PaginatedNotificationsDto {
  @ApiProperty({ type: [NotificationDto] })
  data: NotificationDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

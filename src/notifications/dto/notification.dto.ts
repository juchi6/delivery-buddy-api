import { ApiProperty } from '@nestjs/swagger';

export class NotificationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  driverId: string;

  @ApiProperty({ description: 'Free-form type tag, e.g. "new_delivery", "shift_summary"' })
  type: string;

  @ApiProperty()
  body: string;

  @ApiProperty()
  isRead: boolean;

  @ApiProperty()
  createdAt: Date;
}

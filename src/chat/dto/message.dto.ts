import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageSenderType } from '@prisma/client';

export class MessageDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  deliveryId: string;

  @ApiProperty({ description: 'ID of the sender — driverId for DRIVER messages' })
  senderId: string;

  @ApiProperty({ enum: MessageSenderType })
  senderType: MessageSenderType;

  @ApiProperty()
  body: string;

  @ApiPropertyOptional({ nullable: true })
  attachmentUrl: string | null;

  @ApiProperty()
  sentAt: Date;

  @ApiPropertyOptional({ nullable: true, description: 'Null until the recipient has read the message' })
  seenAt: Date | null;
}

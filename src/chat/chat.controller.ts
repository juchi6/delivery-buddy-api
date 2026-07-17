import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentDriver } from '../common/decorators/current-driver.decorator';
import type { JwtPayload } from '../common/decorators/current-driver.decorator';
import { ChatService } from './chat.service';
import { MessageDto } from './dto/message.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('deliveries')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get(':id/messages')
  @ApiOperation({ summary: "List all messages for a delivery thread in chronological order (404 for another driver's delivery)" })
  @ApiResponse({ status: 200, type: [MessageDto] })
  @ApiResponse({ status: 404, description: "Delivery not found or belongs to another driver" })
  getMessages(
    @Param('id') deliveryId: string,
    @CurrentDriver() driver: JwtPayload,
  ): Promise<MessageDto[]> {
    return this.chatService.getMessages(deliveryId, driver.sub);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Post a message to a delivery thread as the authenticated driver (404 for another driver's delivery)" })
  @ApiResponse({ status: 201, type: MessageDto })
  @ApiResponse({ status: 400, description: 'Validation error (empty body, body too long, invalid attachmentUrl)' })
  @ApiResponse({ status: 404, description: "Delivery not found or belongs to another driver" })
  sendMessage(
    @Param('id') deliveryId: string,
    @Body() dto: SendMessageDto,
    @CurrentDriver() driver: JwtPayload,
  ): Promise<MessageDto> {
    return this.chatService.sendMessage(deliveryId, driver.sub, dto);
  }
}

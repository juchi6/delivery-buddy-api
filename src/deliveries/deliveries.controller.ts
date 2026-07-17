import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentDriver } from '../common/decorators/current-driver.decorator';
import type { JwtPayload } from '../common/decorators/current-driver.decorator';
import { DeliveryResponseDto } from './dto/delivery-response.dto';
import { RouteResponseDto } from './dto/route-response.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { DeliveriesService } from './deliveries.service';

// IMPORTANT: me/* routes must be declared before :id routes so NestJS does not
// swallow 'me' as a path parameter value. (me/current and me/next have two
// path segments so there is no actual ambiguity with :id, but ordering is kept
// explicit as defensive practice.)

@ApiTags('deliveries')
@ApiBearerAuth()
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Get('me/current')
  @ApiOperation({ summary: 'Get the currently in-progress delivery (404 if none)' })
  @ApiResponse({ status: 200, type: DeliveryResponseDto })
  @ApiResponse({ status: 404, description: 'No delivery in progress' })
  getCurrentDelivery(@CurrentDriver() driver: JwtPayload): Promise<DeliveryResponseDto> {
    return this.deliveriesService.getCurrentDelivery(driver.sub);
  }

  @Get('me/next')
  @ApiOperation({ summary: 'Get the next pending delivery in queue (404 if none)' })
  @ApiResponse({ status: 200, type: DeliveryResponseDto })
  @ApiResponse({ status: 404, description: 'No pending delivery' })
  getNextDelivery(@CurrentDriver() driver: JwtPayload): Promise<DeliveryResponseDto> {
    return this.deliveriesService.getNextDelivery(driver.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get delivery detail with order items (404 for another driver\'s delivery)' })
  @ApiResponse({ status: 200, type: DeliveryResponseDto })
  @ApiResponse({ status: 404, description: 'Delivery not found or belongs to another driver' })
  getDeliveryById(
    @Param('id') id: string,
    @CurrentDriver() driver: JwtPayload,
  ): Promise<DeliveryResponseDto> {
    return this.deliveriesService.getDeliveryById(id, driver.sub);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Advance delivery status — PENDING → IN_PROGRESS → AT_DOOR → DELIVERED (sequential only)' })
  @ApiResponse({ status: 200, type: DeliveryResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid or non-sequential status transition' })
  @ApiResponse({ status: 404, description: 'Delivery not found or belongs to another driver' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryStatusDto,
    @CurrentDriver() driver: JwtPayload,
  ): Promise<DeliveryResponseDto> {
    return this.deliveriesService.updateStatus(id, driver.sub, dto);
  }

  @Get(':id/route')
  @ApiOperation({ summary: 'Get ETA / distance / traffic for a delivery (result cached 30 s)' })
  @ApiResponse({ status: 200, type: RouteResponseDto })
  @ApiResponse({ status: 404, description: 'Delivery not found or belongs to another driver' })
  getRoute(
    @Param('id') id: string,
    @CurrentDriver() driver: JwtPayload,
  ): Promise<RouteResponseDto> {
    return this.deliveriesService.getRoute(id, driver.sub);
  }
}

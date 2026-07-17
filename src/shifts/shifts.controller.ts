import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentDriver } from '../common/decorators/current-driver.decorator';
import type { JwtPayload } from '../common/decorators/current-driver.decorator';
import { ShiftResponseDto } from './dto/shift-response.dto';
import { ShiftsService } from './shifts.service';

@ApiTags('shifts')
@ApiBearerAuth()
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start a new shift (fails with 409 if one is already active)' })
  @ApiResponse({ status: 201, type: ShiftResponseDto })
  @ApiResponse({ status: 409, description: 'A shift is already active' })
  startShift(@CurrentDriver() driver: JwtPayload): Promise<ShiftResponseDto> {
    return this.shiftsService.startShift(driver.sub);
  }

  @Post(':id/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop an active shift — computes final earnings/tips/deliveriesCompleted from linked deliveries' })
  @ApiResponse({ status: 200, type: ShiftResponseDto })
  @ApiResponse({ status: 404, description: 'Shift not found or belongs to a different driver' })
  @ApiResponse({ status: 409, description: 'Shift is already completed' })
  stopShift(
    @Param('id') id: string,
    @CurrentDriver() driver: JwtPayload,
  ): Promise<ShiftResponseDto> {
    return this.shiftsService.stopShift(id, driver.sub);
  }

  @Get('me/current')
  @ApiOperation({ summary: 'Get the currently active shift (404 if no shift is active)' })
  @ApiResponse({ status: 200, type: ShiftResponseDto })
  @ApiResponse({ status: 404, description: 'No active shift' })
  getCurrentShift(@CurrentDriver() driver: JwtPayload): Promise<ShiftResponseDto> {
    return this.shiftsService.getCurrentShift(driver.sub);
  }

  @Get('me/history')
  @ApiOperation({ summary: 'Get all completed shifts for the authenticated driver, newest first' })
  @ApiResponse({ status: 200, type: [ShiftResponseDto] })
  getShiftHistory(@CurrentDriver() driver: JwtPayload): Promise<ShiftResponseDto[]> {
    return this.shiftsService.getShiftHistory(driver.sub);
  }
}

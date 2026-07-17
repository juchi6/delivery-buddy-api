import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { DriverResponseDto, OnboardingStatusDto } from './dto/driver-response.dto';
import { OnboardingDto } from './dto/onboarding.dto';
import { TeamDto } from './dto/team.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriversService } from './drivers.service';

// ─── Stub response shapes (out-of-scope endpoints, per Section 2.6) ──────────

const NOT_CONFIGURED = { configured: false, message: 'Not yet configured — see requirements spec Section 2.6' };
const FUEL_STUB = { configured: false, message: 'Fuel management is out of scope for full implementation — open item per requirements spec Section 2.6' };

// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('drivers')
@ApiBearerAuth()
@Controller()
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  // ── Teams ──────────────────────────────────────────────────────────────────

  @Get('teams')
  @ApiOperation({ summary: 'List selectable teams (result is cached for 1 hour)' })
  @ApiResponse({ status: 200, type: [TeamDto] })
  getTeams(): Promise<TeamDto[]> {
    return this.driversService.getTeams();
  }

  // ── Onboarding ─────────────────────────────────────────────────────────────

  @Patch('drivers/me/onboarding')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit or update onboarding fields (partial — any subset accepted)',
  })
  @ApiResponse({ status: 200, type: DriverResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error on a provided field' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  @ApiResponse({ status: 409, description: 'Work ID already in use' })
  updateOnboarding(
    @CurrentDriver() driver: JwtPayload,
    @Body() dto: OnboardingDto,
  ): Promise<DriverResponseDto> {
    return this.driversService.updateOnboarding(driver.sub, dto);
  }

  @Get('drivers/me/onboarding-status')
  @ApiOperation({ summary: 'Returns which required onboarding fields are still missing' })
  @ApiResponse({ status: 200, type: OnboardingStatusDto })
  getOnboardingStatus(
    @CurrentDriver() driver: JwtPayload,
  ): Promise<OnboardingStatusDto> {
    return this.driversService.getOnboardingStatus(driver.sub);
  }

  // ── Profile ────────────────────────────────────────────────────────────────

  @Get('drivers/me')
  @ApiOperation({ summary: 'Get the authenticated driver\'s full profile' })
  @ApiResponse({ status: 200, type: DriverResponseDto })
  getProfile(@CurrentDriver() driver: JwtPayload): Promise<DriverResponseDto> {
    return this.driversService.getProfile(driver.sub);
  }

  @Patch('drivers/me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update editable profile fields (firstName, lastName, avatarUrl)' })
  @ApiResponse({ status: 200, type: DriverResponseDto })
  updateProfile(
    @CurrentDriver() driver: JwtPayload,
    @Body() dto: UpdateDriverDto,
  ): Promise<DriverResponseDto> {
    return this.driversService.updateProfile(driver.sub, dto);
  }

  // ── Stub endpoints (Section 2.6 — not fully implemented) ──────────────────

  @Get('drivers/me/billing-method')
  @ApiOperation({ summary: 'Get payout method (stub — not yet implemented)' })
  @ApiResponse({ status: 200 })
  getBillingMethod(): typeof NOT_CONFIGURED {
    return NOT_CONFIGURED;
  }

  @Patch('drivers/me/billing-method')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set payout method (stub — not yet implemented)' })
  @ApiResponse({ status: 200 })
  updateBillingMethod(): typeof NOT_CONFIGURED {
    return NOT_CONFIGURED;
  }

  @Get('drivers/me/notification-settings')
  @ApiOperation({ summary: 'Get notification preferences (stub — not yet implemented)' })
  @ApiResponse({ status: 200 })
  getNotificationSettings(): typeof NOT_CONFIGURED {
    return NOT_CONFIGURED;
  }

  @Patch('drivers/me/notification-settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update notification preferences (stub — not yet implemented)' })
  @ApiResponse({ status: 200 })
  updateNotificationSettings(): typeof NOT_CONFIGURED {
    return NOT_CONFIGURED;
  }

  @Get('drivers/me/fuel-settings')
  @ApiOperation({
    summary: 'Fuel management (out of scope — open item per Section 2.6)',
  })
  @ApiResponse({ status: 200 })
  getFuelSettings(): typeof FUEL_STUB {
    return FUEL_STUB;
  }
}

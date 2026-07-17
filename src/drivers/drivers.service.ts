import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CacheService } from '../common/cache/cache.service';
import type { OnboardingDto } from './dto/onboarding.dto';
import type { UpdateDriverDto } from './dto/update-driver.dto';
import type { DriverResponseDto, OnboardingStatusDto } from './dto/driver-response.dto';
import type { TeamDto } from './dto/team.dto';
import { DriversRepository, DriverWithTeam } from './drivers.repository';

const TEAMS_CACHE_KEY = 'team:list';
const TEAMS_TTL_SECONDS = 3600;

const REQUIRED_ONBOARDING_FIELDS = [
  'workId',
  'firstName',
  'lastName',
  'teamId',
  'transportationType',
  'vehicleNumber',
] as const;

type OnboardingField = (typeof REQUIRED_ONBOARDING_FIELDS)[number];

function isFieldComplete(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return true;
}

@Injectable()
export class DriversService {
  constructor(
    private readonly repo: DriversRepository,
    private readonly cache: CacheService,
  ) {}

  // ── Teams ──────────────────────────────────────────────────────────────────

  async getTeams(): Promise<TeamDto[]> {
    const cached = await this.cache.get<TeamDto[]>(TEAMS_CACHE_KEY);
    if (cached) return cached;

    const teams = await this.repo.findAllTeams();
    const result: TeamDto[] = teams.map((t) => ({ id: t.id, name: t.name }));
    await this.cache.set(TEAMS_CACHE_KEY, result, TEAMS_TTL_SECONDS);
    return result;
  }

  // ── Onboarding ─────────────────────────────────────────────────────────────

  async updateOnboarding(driverId: string, dto: OnboardingDto): Promise<DriverResponseDto> {
    const driver = await this.repo.findById(driverId);
    if (!driver) throw new NotFoundException('Driver not found');

    if (dto.workId !== undefined && dto.workId !== driver.workId) {
      const conflict = await this.repo.findByWorkId(dto.workId, driverId);
      if (conflict) throw new ConflictException('Work ID is already in use by another driver');
    }

    if (dto.teamId !== undefined) {
      const team = await this.repo.findTeamById(dto.teamId);
      if (!team) throw new NotFoundException(`Team "${dto.teamId}" not found`);
    }

    // Build sparse update — only include fields that were actually sent
    const data: Record<string, unknown> = {};
    if (dto.workId !== undefined) data.workId = dto.workId;
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.teamId !== undefined) data.teamId = dto.teamId;
    if (dto.transportationType !== undefined) data.transportationType = dto.transportationType;
    if (dto.vehicleNumber !== undefined) data.vehicleNumber = dto.vehicleNumber;

    if (Object.keys(data).length === 0) {
      // No-op: nothing to update — return current state
      return this.toDto(driver);
    }

    const updated = await this.repo.updateDriver(driverId, data);
    return this.toDto(updated);
  }

  async getOnboardingStatus(driverId: string): Promise<OnboardingStatusDto> {
    const driver = await this.repo.findById(driverId);
    if (!driver) throw new NotFoundException('Driver not found');

    const missingFields: string[] = [];
    const completedFields: string[] = [];

    for (const field of REQUIRED_ONBOARDING_FIELDS) {
      const value = driver[field as OnboardingField];
      if (isFieldComplete(value)) {
        completedFields.push(field);
      } else {
        missingFields.push(field);
      }
    }

    return {
      isComplete: missingFields.length === 0,
      missingFields,
      completedFields,
    };
  }

  // ── Profile ────────────────────────────────────────────────────────────────

  async getProfile(driverId: string): Promise<DriverResponseDto> {
    const driver = await this.repo.findById(driverId);
    if (!driver) throw new NotFoundException('Driver not found');
    return this.toDto(driver);
  }

  async updateProfile(driverId: string, dto: UpdateDriverDto): Promise<DriverResponseDto> {
    const driver = await this.repo.findById(driverId);
    if (!driver) throw new NotFoundException('Driver not found');

    const data: Record<string, unknown> = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;

    if (Object.keys(data).length === 0) return this.toDto(driver);

    const updated = await this.repo.updateDriver(driverId, data);
    return this.toDto(updated);
  }

  // ── Mapper ─────────────────────────────────────────────────────────────────

  private toDto(driver: DriverWithTeam): DriverResponseDto {
    return {
      id: driver.id,
      email: driver.email,
      firstName: driver.firstName,
      lastName: driver.lastName,
      workId: driver.workId,
      level: driver.level,
      commissionRate: driver.commissionRate,
      status: driver.status,
      avatarUrl: driver.avatarUrl,
      teamId: driver.teamId,
      transportationType: driver.transportationType,
      vehicleNumber: driver.vehicleNumber,
      team: driver.team ? { id: driver.team.id, name: driver.team.name } : null,
      createdAt: driver.createdAt,
      updatedAt: driver.updatedAt,
    };
  }
}

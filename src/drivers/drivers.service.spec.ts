import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DriverStatus, TransportationType } from '@prisma/client';
import { CacheService } from '../common/cache/cache.service';
import { DriversRepository } from './drivers.repository';
import { DriversService } from './drivers.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeDriver = (overrides: Record<string, unknown> = {}) => ({
  id: 'driver-1',
  workId: 'WK-001',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@test.com',
  passwordHash: 'hash',
  teamId: null,
  transportationType: null,
  vehicleNumber: null,
  level: 1,
  commissionRate: 0,
  avatarUrl: null,
  status: DriverStatus.OFFLINE,
  createdAt: new Date(),
  updatedAt: new Date(),
  team: null,
  ...overrides,
});

const TEAM = { id: 'team-1', name: 'Alpha Team', createdAt: new Date() };

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRepo = {
  findById: jest.fn(),
  findByWorkId: jest.fn(),
  updateDriver: jest.fn(),
  findAllTeams: jest.fn(),
  findTeamById: jest.fn(),
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('DriversService', () => {
  let service: DriversService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriversService,
        { provide: DriversRepository, useValue: mockRepo },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get(DriversService);
  });

  // ── getTeams ───────────────────────────────────────────────────────────────

  describe('getTeams', () => {
    it('returns cached teams and does NOT query the database on a cache hit', async () => {
      const cached = [{ id: 'team-1', name: 'Alpha' }];
      mockCache.get.mockResolvedValue(cached);

      const result = await service.getTeams();

      expect(result).toEqual(cached);
      expect(mockRepo.findAllTeams).not.toHaveBeenCalled();
    });

    it('queries the database and populates the cache on a miss', async () => {
      mockCache.get.mockResolvedValue(null);
      mockRepo.findAllTeams.mockResolvedValue([TEAM]);
      mockCache.set.mockResolvedValue(undefined);

      const result = await service.getTeams();

      expect(mockRepo.findAllTeams).toHaveBeenCalledTimes(1);
      expect(mockCache.set).toHaveBeenCalledWith(
        'team:list',
        [{ id: TEAM.id, name: TEAM.name }],
        3600,
      );
      expect(result).toEqual([{ id: TEAM.id, name: TEAM.name }]);
    });

    it('falls through to the database when the cache returns null (Redis outage → CacheService returns null → same as a miss)', async () => {
      // CacheService.get() already swallows Redis errors and returns null,
      // so DriversService only ever sees null — it cannot tell a miss from an outage.
      // This test documents that null from the cache always results in a DB read.
      mockCache.get.mockResolvedValue(null);
      mockRepo.findAllTeams.mockResolvedValue([TEAM]);
      mockCache.set.mockResolvedValue(undefined);

      const result = await service.getTeams();

      expect(mockRepo.findAllTeams).toHaveBeenCalledTimes(1);
      expect(result).toEqual([{ id: TEAM.id, name: TEAM.name }]);
    });
  });

  // ── updateOnboarding ───────────────────────────────────────────────────────

  describe('updateOnboarding', () => {
    it('updates only the provided fields and returns the updated driver', async () => {
      mockRepo.findById.mockResolvedValue(makeDriver());
      mockRepo.findTeamById.mockResolvedValue(TEAM);
      const updated = makeDriver({ teamId: TEAM.id, team: TEAM, transportationType: TransportationType.BICYCLE });
      mockRepo.updateDriver.mockResolvedValue(updated);

      const result = await service.updateOnboarding('driver-1', {
        teamId: TEAM.id,
        transportationType: TransportationType.BICYCLE,
      });

      expect(mockRepo.updateDriver).toHaveBeenCalledWith('driver-1', {
        teamId: TEAM.id,
        transportationType: TransportationType.BICYCLE,
      });
      expect(result.teamId).toBe(TEAM.id);
    });

    it('is a no-op and returns current state when the DTO is empty', async () => {
      const driver = makeDriver();
      mockRepo.findById.mockResolvedValue(driver);

      await service.updateOnboarding('driver-1', {});

      expect(mockRepo.updateDriver).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when driver does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.updateOnboarding('ghost', {})).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the new workId is taken by another driver', async () => {
      mockRepo.findById.mockResolvedValue(makeDriver());
      mockRepo.findByWorkId.mockResolvedValue(makeDriver({ id: 'other-driver' }));

      await expect(
        service.updateOnboarding('driver-1', { workId: 'WK-TAKEN' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when teamId does not exist', async () => {
      mockRepo.findById.mockResolvedValue(makeDriver());
      mockRepo.findTeamById.mockResolvedValue(null);

      await expect(
        service.updateOnboarding('driver-1', { teamId: 'nonexistent-team' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getOnboardingStatus ────────────────────────────────────────────────────

  describe('getOnboardingStatus', () => {
    it('reports all fields as missing for a freshly signed-up driver with no onboarding data', async () => {
      // After signup: firstName/lastName/workId are set, teamId/transportationType/vehicleNumber are null
      const driver = makeDriver({ teamId: null, transportationType: null, vehicleNumber: null });
      mockRepo.findById.mockResolvedValue(driver);

      const status = await service.getOnboardingStatus('driver-1');

      expect(status.isComplete).toBe(false);
      expect(status.missingFields).toContain('teamId');
      expect(status.missingFields).toContain('transportationType');
      expect(status.missingFields).toContain('vehicleNumber');
      expect(status.completedFields).toContain('workId');
      expect(status.completedFields).toContain('firstName');
      expect(status.completedFields).toContain('lastName');
    });

    it('reports isComplete = true when all required fields are filled', async () => {
      const driver = makeDriver({
        teamId: TEAM.id,
        transportationType: TransportationType.CAR,
        vehicleNumber: 'ABC-1234',
      });
      mockRepo.findById.mockResolvedValue(driver);

      const status = await service.getOnboardingStatus('driver-1');

      expect(status.isComplete).toBe(true);
      expect(status.missingFields).toHaveLength(0);
    });

    it('throws NotFoundException for an unknown driver', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.getOnboardingStatus('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getProfile ─────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('returns the full driver profile DTO without passwordHash', async () => {
      mockRepo.findById.mockResolvedValue(makeDriver());

      const profile = await service.getProfile('driver-1');

      expect(profile.id).toBe('driver-1');
      expect(profile.email).toBe('jane@test.com');
      expect(profile).not.toHaveProperty('passwordHash');
    });

    it('throws NotFoundException for an unknown driver', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.getProfile('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateProfile ──────────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('updates only the provided editable fields', async () => {
      mockRepo.findById.mockResolvedValue(makeDriver());
      mockRepo.updateDriver.mockResolvedValue(makeDriver({ firstName: 'Updated' }));

      const result = await service.updateProfile('driver-1', { firstName: 'Updated' });

      expect(mockRepo.updateDriver).toHaveBeenCalledWith('driver-1', { firstName: 'Updated' });
      expect(result.firstName).toBe('Updated');
    });

    it('is a no-op for an empty update DTO', async () => {
      mockRepo.findById.mockResolvedValue(makeDriver());

      await service.updateProfile('driver-1', {});

      expect(mockRepo.updateDriver).not.toHaveBeenCalled();
    });
  });
});

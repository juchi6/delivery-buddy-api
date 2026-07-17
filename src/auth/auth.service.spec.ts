import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { CacheService } from '../common/cache/cache.service';

// Replace the native bcrypt module with auto-mocks so properties are configurable
jest.mock('bcrypt');

// ─── Stable fixture data ───────────────────────────────────────────────────────

const DRIVER = {
  id: 'driver-1',
  workId: 'WK-0001',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@test.com',
  passwordHash: '$2b$10$hashedpassword',
  teamId: null,
  transportationType: null,
  vehicleNumber: null,
  level: 1,
  commissionRate: 0,
  avatarUrl: null,
  status: 'OFFLINE' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SIGNUP_DTO = {
  workId: 'WK-0001',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@test.com',
  password: 'Password123!',
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRepo = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '15m' } }),
      ],
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: mockRepo },
        { provide: CacheService, useValue: mockCache },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              const map: Record<string, string> = {
                JWT_SECRET: 'test-secret',
                JWT_ACCESS_EXPIRES_IN: '15m',
                JWT_REFRESH_EXPIRES_IN: '7d',
              };
              if (!(key in map)) throw new Error(`Config key "${key}" not found`);
              return map[key];
            },
            get: (key: string, fallback?: string) => {
              const map: Record<string, string> = {
                JWT_ACCESS_EXPIRES_IN: '15m',
                JWT_REFRESH_EXPIRES_IN: '7d',
              };
              return map[key] ?? fallback;
            },
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    jwtService = module.get(JwtService);
  });

  // ── signup ──────────────────────────────────────────────────────────────────

  describe('signup', () => {
    it('creates a driver and returns tokens + profile on valid data', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(DRIVER);
      mockCache.set.mockResolvedValue(undefined);

      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');

      const result = await service.signup(SIGNUP_DTO);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.driver.email).toBe(DRIVER.email);
      expect(result.driver).not.toHaveProperty('passwordHash');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: SIGNUP_DTO.email }),
      );
    });

    it('throws ConflictException when email is already registered', async () => {
      mockRepo.findByEmail.mockResolvedValue(DRIVER);

      await expect(service.signup(SIGNUP_DTO)).rejects.toThrow(ConflictException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  // ── login ───────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      mockRepo.findByEmail.mockResolvedValue(DRIVER);
      mockCache.set.mockResolvedValue(undefined);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ email: DRIVER.email, password: 'correct' });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('throws UnauthorizedException when driver email is not found', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@test.com', password: 'anything' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when password does not match', async () => {
      mockRepo.findByEmail.mockResolvedValue(DRIVER);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: DRIVER.email, password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── refresh ─────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    const buildRefreshToken = (overrides: Record<string, unknown> = {}) =>
      jwtService.sign(
        { sub: DRIVER.id, jti: 'jti-abc', type: 'refresh', ...overrides },
        { secret: 'test-secret', expiresIn: '7d' },
      );

    it('rotates tokens when the refresh token is valid and in Redis', async () => {
      const refreshToken = buildRefreshToken();
      mockCache.get.mockResolvedValue('1');
      mockCache.invalidate.mockResolvedValue(undefined);
      mockCache.set.mockResolvedValue(undefined);
      mockRepo.findById.mockResolvedValue(DRIVER);

      const result = await service.refresh({ refreshToken });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // Old jti should be invalidated
      expect(mockCache.invalidate).toHaveBeenCalledWith(
        expect.stringContaining('jti-abc'),
      );
    });

    it('throws UnauthorizedException for a tampered / invalid JWT', async () => {
      await expect(
        service.refresh({ refreshToken: 'this.is.invalid' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the token is expired', async () => {
      // Sign with an already-elapsed expiry
      const expired = jwtService.sign(
        { sub: DRIVER.id, jti: 'old-jti', type: 'refresh' },
        { secret: 'test-secret', expiresIn: '0s' },
      );

      // Wait 1 ms so the token is definitely past its expiry
      await new Promise((r) => setTimeout(r, 10));

      await expect(service.refresh({ refreshToken: expired })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the jti is not in Redis (revoked)', async () => {
      const refreshToken = buildRefreshToken({ jti: 'revoked-jti' });
      mockCache.get.mockResolvedValue(null); // not in Redis

      await expect(service.refresh({ refreshToken })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when token type is not "refresh"', async () => {
      // Access token passed where a refresh token is expected
      const accessToken = jwtService.sign(
        { sub: DRIVER.id, email: DRIVER.email },
        { secret: 'test-secret', expiresIn: '15m' },
      );

      await expect(service.refresh({ refreshToken: accessToken })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── logout ──────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('invalidates the refresh token jti in Redis', async () => {
      mockCache.invalidate.mockResolvedValue(undefined);
      const refreshToken = jwtService.sign(
        { sub: DRIVER.id, jti: 'logout-jti', type: 'refresh' },
        { secret: 'test-secret', expiresIn: '7d' },
      );

      await service.logout({ refreshToken });

      expect(mockCache.invalidate).toHaveBeenCalledWith(
        `rt:${DRIVER.id}:logout-jti`,
      );
    });

    it('does not throw when given an already-expired refresh token', async () => {
      const expired = jwtService.sign(
        { sub: DRIVER.id, jti: 'exp-jti', type: 'refresh' },
        { secret: 'test-secret', expiresIn: '0s' },
      );
      await new Promise((r) => setTimeout(r, 10));

      await expect(service.logout({ refreshToken: expired })).resolves.toBeUndefined();
    });
  });
});

import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Driver } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { CacheService } from '../common/cache/cache.service';
import { AuthRepository } from './auth.repository';
import type { AuthResponseDto, DriverProfileDto, TokensDto } from './dto/auth-response.dto';
import type { LoginDto } from './dto/login.dto';
import type { RefreshDto } from './dto/refresh.dto';
import type { SignupDto } from './dto/signup.dto';

interface RefreshPayload {
  sub: string;
  jti: string;
  type: string;
  iat?: number;
  exp?: number;
}

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days — matches JWT_REFRESH_EXPIRES_IN default
const BCRYPT_ROUNDS = 10;

/** Converts simple duration strings ('15m', '7d', '3600s', '1h') to seconds. */
function durationToSeconds(val: string): number {
  const n = parseInt(val, 10);
  const unit = val.replace(/[0-9]/g, '').trim();
  const table: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (table[unit] ?? 1);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
  ) {}

  async signup(dto: SignupDto): Promise<AuthResponseDto> {
    const existing = await this.repo.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const driver = await this.repo.create({
      workId: dto.workId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash,
    });

    return this.issueTokens(driver);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const driver = await this.repo.findByEmail(dto.email);
    if (!driver) throw new UnauthorizedException('Invalid credentials');

    const matches = await bcrypt.compare(dto.password, driver.passwordHash);
    if (!matches) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokens(driver);
  }

  async refresh(dto: RefreshDto): Promise<TokensDto> {
    let payload: RefreshPayload;
    try {
      payload = this.jwtService.verify<RefreshPayload>(dto.refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token type');
    }

    const key = `rt:${payload.sub}:${payload.jti}`;
    const stored = await this.cache.get<string>(key);
    if (!stored) throw new UnauthorizedException('Refresh token revoked or expired');

    // Rotate: invalidate old token before issuing new one
    await this.cache.invalidate(key);

    const driver = await this.repo.findById(payload.sub);
    if (!driver) throw new UnauthorizedException('Driver account not found');

    const { accessToken, refreshToken } = await this.issueTokens(driver);
    return { accessToken, refreshToken };
  }

  async logout(dto: RefreshDto): Promise<void> {
    let payload: RefreshPayload;
    try {
      payload = this.jwtService.verify<RefreshPayload>(dto.refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      // If the token is already expired/invalid there is nothing to revoke —
      // treat as a successful logout rather than exposing token validity.
      return;
    }

    if (payload.type === 'refresh') {
      await this.cache.invalidate(`rt:${payload.sub}:${payload.jti}`);
    }
  }

  private async issueTokens(driver: Driver): Promise<AuthResponseDto> {
    const jti = randomUUID();
    const secret = this.config.getOrThrow<string>('JWT_SECRET');

    const accessToken = this.jwtService.sign(
      { sub: driver.id, email: driver.email },
      { secret, expiresIn: durationToSeconds(this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m')) },
    );

    const refreshToken = this.jwtService.sign(
      { sub: driver.id, jti, type: 'refresh' },
      { secret, expiresIn: durationToSeconds(this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d')) },
    );

    await this.cache.set(`rt:${driver.id}:${jti}`, '1', REFRESH_TTL_SECONDS);

    return {
      accessToken,
      refreshToken,
      driver: this.toProfile(driver),
    };
  }

  private toProfile(driver: Driver): DriverProfileDto {
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
    };
  }
}

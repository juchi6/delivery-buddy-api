import { ApiProperty } from '@nestjs/swagger';
import { DriverStatus } from '@prisma/client';

export class DriverProfileDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty() workId: string;
  @ApiProperty() level: number;
  @ApiProperty() commissionRate: number;
  @ApiProperty({ enum: DriverStatus }) status: DriverStatus;
  @ApiProperty({ nullable: true }) avatarUrl: string | null;
}

export class TokensDto {
  @ApiProperty() accessToken: string;
  @ApiProperty() refreshToken: string;
}

export class AuthResponseDto extends TokensDto {
  @ApiProperty({ type: DriverProfileDto }) driver: DriverProfileDto;
}

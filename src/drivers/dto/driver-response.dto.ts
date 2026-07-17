import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DriverStatus, TransportationType } from '@prisma/client';
import { TeamDto } from './team.dto';

export class OnboardingStatusDto {
  @ApiProperty() isComplete: boolean;
  @ApiProperty({ type: [String] }) missingFields: string[];
  @ApiProperty({ type: [String] }) completedFields: string[];
}

export class DriverResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty() workId: string;
  @ApiProperty() level: number;
  @ApiProperty() commissionRate: number;
  @ApiProperty({ enum: DriverStatus }) status: DriverStatus;
  @ApiPropertyOptional({ nullable: true }) avatarUrl: string | null;
  @ApiPropertyOptional({ nullable: true }) teamId: string | null;
  @ApiPropertyOptional({ enum: TransportationType, nullable: true }) transportationType: TransportationType | null;
  @ApiPropertyOptional({ nullable: true }) vehicleNumber: string | null;
  @ApiPropertyOptional({ type: TeamDto, nullable: true }) team: TeamDto | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

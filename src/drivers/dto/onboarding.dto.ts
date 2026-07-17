import { ApiPropertyOptional } from '@nestjs/swagger';
import { TransportationType } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class OnboardingDto {
  @ApiPropertyOptional({ example: 'WK-0042' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  workId?: string;

  @ApiPropertyOptional({ example: 'Jane' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  lastName?: string;

  @ApiPropertyOptional({ description: 'ID of the selected team from GET /teams' })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ enum: TransportationType })
  @IsOptional()
  @IsEnum(TransportationType)
  transportationType?: TransportationType;

  @ApiPropertyOptional({ example: 'ABC-1234' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  vehicleNumber?: string;
}

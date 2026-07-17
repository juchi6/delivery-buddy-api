import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RouteResponseDto {
  @ApiProperty({ description: 'Estimated time of arrival in minutes' }) etaMinutes: number;
  @ApiProperty({ description: 'Straight-line distance in kilometres (haversine formula in mock)' })
  distanceKm: number;
  @ApiProperty({ description: 'Encoded polyline; mock returns a deterministic coordinate string' })
  polyline: string;
  @ApiPropertyOptional({ nullable: true }) trafficAlert: string | null;
}

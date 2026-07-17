import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'The refresh token issued at login or last refresh' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

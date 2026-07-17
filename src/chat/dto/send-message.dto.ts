import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body: string;

  @ApiPropertyOptional({ description: 'Optional URL of an image or file attachment' })
  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false })
  attachmentUrl?: string;
}

import { ApiProperty } from '@nestjs/swagger';

export class TeamDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

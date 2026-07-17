import { ApiProperty } from '@nestjs/swagger';

// No fields required to start a shift — the driver is identified from the JWT.
// Kept as an explicit class so the Swagger schema is named and serializable.
export class StartShiftDto {}

export class StopShiftDto {
  @ApiProperty({ description: 'Shift ID from path parameter' })
  id: string;
}

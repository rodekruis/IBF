import { ApiProperty } from '@nestjs/swagger';

import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { WrapperType } from '@api-service/src/wrapper.type';

export class SeedConfigurationDto {
  @ApiProperty({ example: SeedScript.initialState })
  readonly name: WrapperType<SeedScript>;

  @ApiProperty({ default: false })
  readonly seedAdminOnly?: boolean;
}

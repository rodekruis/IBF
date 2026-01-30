import { ApiProperty } from '@nestjs/swagger';

import { SeedScript } from '@API-service/src/scripts/enum/seed-script.enum';
import { WrapperType } from '@API-service/src/wrapper.type';

export class SeedConfigurationDto {
  @ApiProperty({ example: SeedScript.productionInitialState })
  readonly name: WrapperType<SeedScript>;

  @ApiProperty({ default: false })
  readonly seedAdminOnly?: boolean;
}

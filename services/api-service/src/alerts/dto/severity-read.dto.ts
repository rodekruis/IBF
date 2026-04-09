import { IntersectionType } from '@nestjs/swagger';

import { SeverityDto } from '@api-service/src/alerts/dto/severity.dto';
import { BaseDto } from '@api-service/src/shared/dto/base.dto';

export class SeverityReadDto extends IntersectionType(BaseDto, SeverityDto) {}

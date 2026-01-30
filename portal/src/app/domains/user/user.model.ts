import { UserRO } from '@API-service/src/user/user.interface';

import { Dto } from '~/utils/dto-type';

export type User = Dto<UserRO>['user'];

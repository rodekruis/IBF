import { DataSource, DataSourceOptions } from 'typeorm';

import { ORMConfig } from '@API-service/src/ormconfig';
export const AppDataSource = new DataSource(ORMConfig as DataSourceOptions);

import { DataSource, DataSourceOptions } from 'typeorm';

import { ORMConfig } from '@api-service/src/ormconfig';
export const AppDataSource = new DataSource(ORMConfig as DataSourceOptions);

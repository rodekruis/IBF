/* eslint-disable n/no-process-env -- env-vars should be readable also not at runtime */

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

const baseUrl =
  'postgresql://' +
  process.env.POSTGRES_USER +
  ':' +
  process.env.POSTGRES_PASSWORD +
  '@' +
  process.env.POSTGRES_CONTAINER_NAME +
  ':' +
  process.env.POSTGRES_PORT +
  '/';

const schemaName = 'api-service';
export const DATABASE_URL =
  `${baseUrl}${process.env.POSTGRES_DBNAME}?schema=${schemaName}` +
  (IS_DEVELOPMENT ? '' : '&sslmode=verify-full');

// This is needed for diffing the migrations with Prisma
const shadowDbName = 'ibf-shadow-db';
const SHADOW_DATABASE_URL = `${baseUrl}${shadowDbName}?schema=${schemaName}`;

export default {
  schema: './schema.prisma',
  migrations: {
    path: './migrations',
  },
  datasource: {
    url: DATABASE_URL,
    shadowDatabaseUrl: SHADOW_DATABASE_URL,
  },
};

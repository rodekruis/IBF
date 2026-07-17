/* eslint-disable n/no-process-env -- env-vars should be readable also not at runtime */

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

const postgresUser = encodeURIComponent(process.env.POSTGRES_USER ?? '');
const postgresPassword = encodeURIComponent(
  process.env.POSTGRES_PASSWORD ?? '',
);
const postgresDatabaseName = encodeURIComponent(
  process.env.POSTGRES_DBNAME ?? '',
);

const baseUrl =
  'postgresql://' +
  postgresUser +
  ':' +
  postgresPassword +
  '@' +
  process.env.POSTGRES_CONTAINER_NAME +
  ':' +
  process.env.POSTGRES_PORT;

const schemaName = 'api-service';
const composedUrl =
  `${baseUrl}/${postgresDatabaseName}?schema=${schemaName}` +
  (IS_DEVELOPMENT ? '' : '&sslmode=verify-full');

export const DATABASE_URL = process.env.DATABASE_URL ?? composedUrl;

// This is needed for diffing the migrations with Prisma
const shadowDbName = 'ibf-shadow-db';
const encodedShadowDbName = encodeURIComponent(shadowDbName);
const SHADOW_DATABASE_URL = `${baseUrl}/${encodedShadowDbName}?schema=${schemaName}`;

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

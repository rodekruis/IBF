/* eslint-disable n/no-process-env -- env-vars should be readable also not at runtime */

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

// ##TODO: add ssl + test
export const DATABASE_URL =
  'postgresql://' +
  process.env.POSTGRES_USER +
  ':' +
  process.env.POSTGRES_PASSWORD +
  '@' +
  process.env.POSTGRES_HOST +
  ':' +
  process.env.POSTGRES_PORT +
  '/' +
  process.env.POSTGRES_DBNAME +
  '?schema=api-service' +
  (IS_DEVELOPMENT ? '' : '&sslmode=require');

export default {
  schema: './schema.prisma',
  migrations: {
    path: './migrations',
  },
  datasource: {
    url: DATABASE_URL,
  },
};

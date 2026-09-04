import { env } from '@ibf-e2e/env';
import { HttpMethod } from '@ibf-e2e/nrw/helpers/enums';

export async function apiRequest({
  method,
  path,
  searchParams,
  body,
  action,
}: {
  method: HttpMethod;
  path: string;
  searchParams?: URLSearchParams;
  body?: Record<string, unknown>;
  action: string;
}): Promise<Response> {
  const url = new URL(`${env.API_SERVICE_URL}${path}`);
  if (searchParams) {
    url.search = searchParams.toString();
  }

  const sendsRequestBody = method !== HttpMethod.get;

  const response = await fetch(url, {
    method,
    headers: sendsRequestBody ? { 'Content-Type': 'application/json' } : {},
    body: sendsRequestBody
      ? JSON.stringify({ secret: env.RESET_SECRET, ...body })
      : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`${action} (${String(response.status)}): ${errorBody}`);
  }

  return response;
}

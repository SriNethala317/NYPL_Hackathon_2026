import type { Server } from 'node:http';
import { DEMO_NYC_STUDENT_PROFILE } from './fixtures/demo-nyc-student';

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  // Keep this deterministic and offline; production discovery still defaults to live catalog with fixture fallback.
  process.env.LIVE_BENEFITS_CATALOG = 'false';
  const { createApp } = await import('@/app');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('HTTP test server did not receive a TCP port.');
  return { server, baseUrl: `http://127.0.0.1:${address.port}/api/v1` };
}

async function request(baseUrl: string, path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function run(): Promise<void> {
  const { server, baseUrl } = await startServer();
  try {
    const health = await request(baseUrl, '/health');
    if (health.status !== 200 || health.body.success !== true) throw new Error('Health endpoint failed.');

    const discovery = await request(baseUrl, '/benefits/discover', { profile: DEMO_NYC_STUDENT_PROFILE });
    const discoveryData = discovery.body.data as { recommendations?: unknown[] } | undefined;
    if (discovery.status !== 200 || !discoveryData?.recommendations?.length) throw new Error('Discovery endpoint failed.');

    const validation = await request(baseUrl, '/benefits/fair_fares/validate', { profile: DEMO_NYC_STUDENT_PROFILE });
    const validationData = validation.body.data as { result?: Record<string, unknown> } | undefined;
    if (validation.status !== 200 || validationData?.result?.programId !== 'fair_fares') throw new Error('Validation endpoint failed.');

    const form = await request(baseUrl, '/forms/fair_fares/payload', {
      profile: DEMO_NYC_STUDENT_PROFILE,
      eligibilityResult: validationData.result,
    });
    const formData = form.body.data as { payload?: Record<string, unknown> } | undefined;
    if (form.status !== 200 || formData?.payload?.readyForPreview !== true) throw new Error('Form payload endpoint failed.');
    console.log('HTTP API scenario: PASS');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

run().catch((error) => { console.error(error); process.exit(1); });

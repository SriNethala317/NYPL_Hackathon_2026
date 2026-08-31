import { describeInvokeError } from '@/features/extraction';

/**
 * A failed extraction has to say which thing failed.
 *
 * These cases are transcribed from real responses, because the bug they exist to prevent was
 * caused by guessing. `supabase-js` reports every non-2xx as one sentence — "Edge Function
 * returned a non-2xx status code" — and the app showed that sentence verbatim, so a function that
 * had never been deployed was indistinguishable from a function that rejected the photograph.
 *
 * The two body shapes below come from two different services. The Supabase gateway answers a
 * missing function with `{ code, message }`; the function itself answers with `{ error }`. Reading
 * only one of them is what hid the deployment failure.
 */

/** Builds the error object `functions.invoke()` actually rejects with. */
function invokeError(status: number, body: unknown): Error {
  const error = new Error('Edge Function returned a non-2xx status code');
  (error as { context?: Response }).context = new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
  return error;
}

describe('describeInvokeError', () => {
  it('names deployment as the cause of the gateway 404', async () => {
    // Verbatim from POSTing to a project where the function does not exist.
    const detail = await describeInvokeError(
      invokeError(404, { code: 'NOT_FOUND', message: 'Requested function was not found' }),
    );

    expect(detail).toMatch(/not deployed/i);
    expect(detail).toContain('supabase functions deploy extract-w2');
    // The generic sentence is the thing being replaced; it must not survive.
    expect(detail).not.toMatch(/non-2xx/);
  });

  it('passes the function’s own message through', async () => {
    const detail = await describeInvokeError(
      invokeError(500, { error: 'GEMINI_API_KEY is not set on this function.' }),
    );

    expect(detail).toBe('GEMINI_API_KEY is not set on this function.');
  });

  it('reports a missing session rather than a status code', async () => {
    const detail = await describeInvokeError(invokeError(401, { error: 'Sign in first.' }));

    expect(detail).toBe('Sign in first.');
  });

  it('keeps the status when the body is not JSON', async () => {
    const error = new Error('Edge Function returned a non-2xx status code');
    (error as { context?: Response }).context = new Response('<html>502 Bad Gateway</html>', {
      status: 502,
    });

    expect(await describeInvokeError(error)).toContain('502');
  });

  it('says the request never arrived when there is no response at all', async () => {
    // A FunctionsFetchError carries no `context`: DNS failed, or the phone has no network.
    const detail = await describeInvokeError(new Error('Failed to send a request to the Edge Function'));

    expect(detail).toMatch(/did not reach Supabase/i);
  });

  it('does not consume the body, so the response stays readable', async () => {
    // `describeInvokeError` clones before reading. Reading the original would leave any other
    // handler with a used stream, which throws rather than returning nothing.
    const error = invokeError(400, { error: 'No image supplied.' });
    await describeInvokeError(error);

    const response = (error as { context?: Response }).context as Response;
    expect(response.bodyUsed).toBe(false);
  });
});

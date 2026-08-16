import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error('API request failed:', error instanceof Error ? error.message : error);
  response.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected backend error occurred.' } });
};

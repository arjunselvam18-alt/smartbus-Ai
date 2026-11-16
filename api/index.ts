import type { IncomingMessage, ServerResponse } from 'http';
import app from '../server.js';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    // Reconstruct original /api/* path when invoked via vercel.json rewrite (/api/index?__api_path=...)
    const parsed = new URL(req.url || '/api', 'http://localhost');
    const rewrittenPath = parsed.searchParams.get('__api_path');
    if (rewrittenPath !== null) {
      parsed.searchParams.delete('__api_path');
      const cleanPath = rewrittenPath.replace(/^\/+/, '');
      const qs = parsed.searchParams.toString();
      req.url = `/api/${cleanPath}${qs ? `?${qs}` : ''}`;
    } else if (!parsed.pathname.startsWith('/api')) {
      req.url = `/api${parsed.pathname.startsWith('/') ? '' : '/'}${parsed.pathname}${parsed.search}`;
    }

    // Prevent body-parser from hanging if serverless runtime pre-consumed the request stream
    const anyReq = req as any;
    if (req.readableEnded && anyReq.body !== undefined && anyReq._body === undefined) {
      anyReq._body = true;
    }

    return app(anyReq, res as any);
  } catch (err: any) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error: err?.message || 'Internal serverless API invocation error.',
        })
      );
    }
  }
}

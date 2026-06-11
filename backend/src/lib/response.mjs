const CORS_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,authorization',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
};

export function ok(body, extraHeaders = {}) {
  return {
    statusCode: 200,
    headers: { ...CORS_HEADERS, ...extraHeaders },
    body: JSON.stringify(body)
  };
}

export function created(body) {
  return { statusCode: 201, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

export function noContent() {
  return { statusCode: 204, headers: CORS_HEADERS, body: '' };
}

export function badRequest(message, details) {
  return {
    statusCode: 400,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'BadRequest', message, details })
  };
}

export function unauthorized(message = 'Missing or invalid authentication') {
  return {
    statusCode: 401,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'Unauthorized', message })
  };
}

export function forbidden(message = 'Insufficient permissions') {
  return {
    statusCode: 403,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'Forbidden', message })
  };
}

export function notFound(resource = 'Resource') {
  return {
    statusCode: 404,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'NotFound', message: `${resource} not found` })
  };
}

export function conflict(message) {
  return {
    statusCode: 409,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'Conflict', message })
  };
}

export function serverError(message = 'Internal server error', requestId) {
  return {
    statusCode: 500,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'InternalServerError', message, requestId })
  };
}

export function parseBody(event) {
  if (!event?.body) return {};
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    return JSON.parse(raw || '{}');
  } catch {
    throw new Error('Invalid JSON body');
  }
}

export function wrap(handler) {
  return async (event, context) => {
    try {
      return await handler(event, context);
    } catch (err) {
      console.error('Unhandled handler error', { requestId: context?.awsRequestId, error: err?.message, stack: err?.stack });
      if (err?.expose) {
        return {
          statusCode: err.statusCode || 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: err.name || 'Error', message: err.message })
        };
      }
      return serverError('Internal server error', context?.awsRequestId);
    }
  };
}

export class HttpError extends Error {
  constructor(message, statusCode = 400, name = 'HttpError') {
    super(message);
    this.name = name;
    this.statusCode = statusCode;
    this.expose = true;
  }
}

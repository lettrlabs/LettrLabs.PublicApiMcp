import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export class LettrLabsApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    public readonly requestId: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'LettrLabsApiError';
  }
}

/**
 * Map an arbitrary error from the LettrLabs API client into a structured MCP
 * tool error. Avoids leaking stack traces or internal hostnames to the caller.
 */
export function toMcpError(err: unknown): McpError {
  if (err instanceof McpError) {
    return err;
  }
  if (err instanceof LettrLabsApiError) {
    const code =
      err.status === 401 || err.status === 403
        ? ErrorCode.InvalidRequest
        : err.status >= 500
          ? ErrorCode.InternalError
          : ErrorCode.InvalidParams;
    return new McpError(code, err.message, {
      status: err.status,
      requestId: err.requestId,
    });
  }
  if (err instanceof Error) {
    return new McpError(ErrorCode.InternalError, err.message);
  }
  return new McpError(ErrorCode.InternalError, 'Unknown error from LettrLabs API');
}

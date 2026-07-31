import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import { LettrLabsApiError, formatApiErrorMessage, toMcpError } from '../../src/lib/errors.js';

const err = (status: number, body: unknown, message = `LettrLabs API returned ${status}`): LettrLabsApiError =>
  new LettrLabsApiError(status, body, 'req-1', message);

describe('toMcpError — reasonCode + error body surfacing (R1/R2/R7)', () => {
  it('U-1: surfaces a top-level reasonCode and the body message to the agent', () => {
    const mcp = toMcpError(err(400, { reasonCode: 'TEMPLATE_IN_USE', errors: ['This template is in use.'] }));
    expect(mcp.message).toContain('TEMPLATE_IN_USE');
    expect(mcp.message).toContain('This template is in use.');
    // Structured body is also carried in data for clients that read it.
    expect((mcp.data as { body: unknown }).body).toEqual({
      reasonCode: 'TEMPLATE_IN_USE',
      errors: ['This template is in use.'],
    });
  });

  it('U-2: a 400 refusal carries its reasonCode and maps to InvalidParams (a diagnosable refusal)', () => {
    const mcp = toMcpError(err(400, { reasonCode: 'ORDER_NOT_DELETABLE_STATUS' }));
    expect(mcp.code).toBe(ErrorCode.InvalidParams);
    expect(mcp.message).toContain('ORDER_NOT_DELETABLE_STATUS');
  });

  it('U-3: a declared 500 fault maps to InternalError with server-error framing, distinct from a refusal', () => {
    const mcp = toMcpError(err(500, { message: 'An unexpected error occurred.' }));
    expect(mcp.code).toBe(ErrorCode.InternalError);
    expect(mcp.message).toMatch(/server error/i);
    expect(mcp.message).not.toMatch(/reasonCode/);
    // The 5xx body's free text is not folded into the message.
    expect(mcp.message).not.toContain('unexpected error');
  });

  it('U-3b: a 5xx body\'s internal detail is never surfaced (message or data)', () => {
    const leaky = {
      message: 'System.NullReferenceException at Foo.Bar() in C:\\app\\Foo.cs:line 42',
      errors: ['sql: SELECT * FROM Secrets'],
    };
    const mcp = toMcpError(err(503, leaky));
    expect(mcp.message).toContain('LettrLabs API server error');
    expect(mcp.message).not.toMatch(/Exception|SELECT|\.cs/);
    // The raw body is not attached to the MCP error data on 5xx.
    expect((mcp.data as { body?: unknown }).body).toBeUndefined();
  });

  it('U-3c: a 5xx keeps a declared machine reasonCode but drops its free text', () => {
    const mcp = toMcpError(err(500, { reasonCode: 'UNEXPECTED_ERROR', message: 'raw internal detail' }));
    expect(mcp.message).toContain('UNEXPECTED_ERROR');
    expect(mcp.message).not.toContain('raw internal detail');
  });

  it('U-4: a 401 surfaces as an authentication failure', () => {
    // client.ts sets message = the body when the body is a bare string.
    const mcp = toMcpError(err(401, 'Invalid API key', 'Invalid API key'));
    expect(mcp.code).toBe(ErrorCode.InvalidRequest);
    expect(mcp.message).toMatch(/authentication failed/i);
    expect(mcp.message).toContain('Invalid API key');
  });

  it('U-5: a bodiless 403 surfaces as an entitlement/permission failure', () => {
    const mcp = toMcpError(err(403, '', 'LettrLabs API returned 403 Forbidden'));
    expect(mcp.code).toBe(ErrorCode.InvalidRequest);
    expect(mcp.message).toMatch(/entitlement|permission/i);
  });

  it('surfaces per-recipient reasonCodes from an integration 422 body', () => {
    const mcp = toMcpError(
      err(422, {
        results: [{ reasonCode: 'DUPLICATE_RECIPIENT' }, { reasonCode: 'ADDRESS_NOT_VALID' }],
      }),
    );
    expect(mcp.message).toContain('DUPLICATE_RECIPIENT');
    expect(mcp.message).toContain('ADDRESS_NOT_VALID');
  });
});

describe('formatApiErrorMessage — fallbacks', () => {
  it('returns the fallback unchanged for a bare-string body', () => {
    expect(formatApiErrorMessage('plain error text', 'FALLBACK')).toBe('FALLBACK');
  });

  it('returns the fallback for a JSON body with no recognized error fields', () => {
    expect(formatApiErrorMessage({ unrelated: true }, 'FALLBACK')).toBe('FALLBACK');
  });

  it('returns the fallback for a null body', () => {
    expect(formatApiErrorMessage(null, 'FALLBACK')).toBe('FALLBACK');
  });
});

describe('toMcpError — non-LettrLabs errors are unchanged', () => {
  it('passes an McpError through', () => {
    const original = new McpError(ErrorCode.InvalidParams, 'x');
    expect(toMcpError(original)).toBe(original);
  });

  it('wraps a plain Error as InternalError', () => {
    expect(toMcpError(new Error('boom')).code).toBe(ErrorCode.InternalError);
  });
});

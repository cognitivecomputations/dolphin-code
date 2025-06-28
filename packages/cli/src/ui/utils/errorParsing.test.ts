/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parseError } from './errorParsing.js';
import { AuthType, StructuredError } from '@google/dolphin-cli-core'; // Corrected import

describe('parseError', () => {
  it('should return a generic message for unknown error types', () => {
    const error = new Error('Some random error');
    // AuthType.USE_GEMINI now implies using DOLPHIN_CLI_API_KEY for Google Gemini API
    const result = parseError(error, AuthType.USE_GEMINI);
    expect(result).toContain('An unexpected error occurred: Some random error');
  });

  it('should return specific message for GOOGLE_AUTH_ERROR during LOGIN_WITH_GOOGLE_PERSONAL', () => {
    const structuredError: StructuredError = {
      type: 'GOOGLE_AUTH_ERROR',
      message: 'Auth failed',
      details: { code: 403 },
    };
    const result = parseError(structuredError, AuthType.LOGIN_WITH_GOOGLE_PERSONAL);
    expect(result).toContain('Google Authentication Error: Auth failed (403)');
    expect(result).toContain('Troubleshooting:');
  });

  it('should return specific message for DOLPHIN_CLI_API_KEY_ERROR', () => {
    const structuredError: StructuredError = {
      type: 'DOLPHIN_CLI_API_KEY_ERROR',
      message: 'Invalid API Key',
    };
    const result = parseError(structuredError, AuthType.USE_GEMINI); // USE_GEMINI is the relevant AuthType
    expect(result).toContain('dolphin-cli API Key Error: Invalid API Key');
    expect(result).toContain('Troubleshooting:');
    expect(result).toContain('DOLPHIN_CLI_API_KEY');
  });

  it('should return specific message for VERTEX_AI_ERROR', () => {
    const structuredError: StructuredError = {
      type: 'VERTEX_AI_ERROR',
      message: 'Vertex permission denied',
      details: { "status": "PERMISSION_DENIED"}
    };
    const result = parseError(structuredError, AuthType.USE_VERTEX_AI);
    expect(result).toContain('Vertex AI Error: Vertex permission denied');
    expect(result).toContain('Troubleshooting:');
    expect(result).toContain('GOOGLE_CLOUD_PROJECT');
  });

  it('should handle plain string errors', () => {
    const error = 'This is a string error.';
    const result = parseError(error, AuthType.USE_GEMINI);
    expect(result).toContain('An unexpected error occurred: This is a string error.');
  });

  it('should include troubleshooting for API_REQUEST_FAILED', () => {
    const structuredError: StructuredError = {
      type: 'API_REQUEST_FAILED',
      message: 'Model unavailable',
      details: { httpStatus: 503 }
    };
    const result = parseError(structuredError, AuthType.USE_GEMINI);
    expect(result).toContain('API Request Failed: Model unavailable (503)');
    expect(result).toContain('Troubleshooting:');
  });

   it('should provide specific advice if project ID is missing for LOGIN_WITH_GOOGLE_PERSONAL and it is a known requirement', () => {
    const structuredError: StructuredError = {
      type: 'GOOGLE_AUTH_ERROR',
      message: 'Project ID required for Google Workspace account.',
      details: { reason: "PROJECT_ID_REQUIRED_FOR_WORKSPACE"}
    };
    const result = parseError(structuredError, AuthType.LOGIN_WITH_GOOGLE_PERSONAL);
    expect(result).toContain('Project ID required for Google Workspace account.');
    expect(result).toContain('Please set the GOOGLE_CLOUD_PROJECT environment variable');
  });

});

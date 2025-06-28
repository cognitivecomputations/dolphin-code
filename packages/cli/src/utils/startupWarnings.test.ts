/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getStartupWarnings } from './startupWarnings.js';
import * as core from '@google/dolphin-cli-core'; // Corrected import

vi.mock('@google/dolphin-cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/dolphin-cli-core')>();
  return {
    ...actual,
    getErrorMessage: vi.fn((e) => e instanceof Error ? e.message : String(e)),
    // DOLPHIN_CLI_API_KEY and DOLPHIN_CLI_SANDBOX are constants, they'll be available via actual
  };
});

describe('getStartupWarnings', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return no warnings if everything is okay with DOLPHIN_CLI_API_KEY', async () => {
    process.env.DOLPHIN_CLI_API_KEY = 'test-key';
    const warnings = await getStartupWarnings();
    expect(warnings).toEqual([]);
  });

  it('should return no warnings if GOOGLE_APPLICATION_CREDENTIALS is set (implies ADC)', async () => {
    delete process.env.DOLPHIN_CLI_API_KEY;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/fake/path/creds.json';
    process.env.GOOGLE_CLOUD_PROJECT = 'gcp-project';
    const warnings = await getStartupWarnings();
    expect(warnings.find(w => w.includes('DOLPHIN_CLI_API_KEY'))).toBeUndefined();
  });


  it('should warn if no primary API key (DOLPHIN_CLI_API_KEY or GOOGLE_API_KEY for Vertex) or ADC is apparent', async () => {
    delete process.env.DOLPHIN_CLI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.GOOGLE_CLOUD_PROJECT;

    const warnings = await getStartupWarnings();
    expect(warnings.some(w => w.includes('DOLPHIN_CLI_API_KEY (for Google AI Studio keys) or GOOGLE_API_KEY (for Vertex AI express mode) environment variable is not set, and Application Default Credentials don\'t appear to be configured.'))).toBe(true);
  });

  it('should warn if old GEMINI_API_KEY is set and new DOLPHIN_CLI_API_KEY is not', async () => {
    process.env.GEMINI_API_KEY = 'old-key';
    delete process.env.DOLPHIN_CLI_API_KEY;
    const warnings = await getStartupWarnings();
    expect(warnings.some(w => w.includes('GEMINI_API_KEY is set. This variable is deprecated. Please use DOLPHIN_CLI_API_KEY'))).toBe(true);
  });

  it('should warn if both old GEMINI_API_KEY and new DOLPHIN_CLI_API_KEY are set', async () => {
    process.env.GEMINI_API_KEY = 'old-key';
    process.env.DOLPHIN_CLI_API_KEY = 'new-key';
    const warnings = await getStartupWarnings();
    expect(warnings.some(w => w.includes('Both GEMINI_API_KEY and DOLPHIN_CLI_API_KEY are set'))).toBe(true);
  });

   it('should warn if old GEMINI_SANDBOX is set', async () => {
    process.env.GEMINI_SANDBOX = 'true';
    const warnings = await getStartupWarnings();
    expect(warnings.some(w => w.includes('GEMINI_SANDBOX is set. Please use DOLPHIN_CLI_SANDBOX'))).toBe(true);
  });

  it('should warn if DOLPHIN_CLI_SANDBOX is set to docker and docker command is not found', async () => {
    process.env.DOLPHIN_CLI_SANDBOX = 'docker';
    const commandExists = await vi.importActual<typeof import('command-exists')>('command-exists');
    vi.spyOn(commandExists, 'default').mockImplementation(async (cmd: string) => {
        if (cmd === 'docker') throw new Error('not found');
        return ''; // or true for other commands if any are checked
    });
    const warnings = await getStartupWarnings();
    expect(warnings.some(w => w.includes('Docker command not found'))).toBe(true);
  });


});

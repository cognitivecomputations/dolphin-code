/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import commandExists from 'command-exists';
import { getErrorMessage, AuthType } from '@google/dolphin-cli-core'; // Corrected import
// Assuming DOLPHIN_CLI_API_KEY and DOLPHIN_CLI_SANDBOX will be exported from core or defined here if only client-side
const DOLPHIN_CLI_API_KEY_ENV_VAR = 'DOLPHIN_CLI_API_KEY';
const DOLPHIN_CLI_SANDBOX_ENV_VAR = 'DOLPHIN_CLI_SANDBOX';
const DOLPHIN_CLI_MODEL_ENV_VAR = 'DOLPHIN_CLI_MODEL';

// Old names for deprecation warnings
const OLD_GEMINI_API_KEY_ENV_VAR = 'GEMINI_API_KEY';
const OLD_GEMINI_MODEL_ENV_VAR = 'GEMINI_MODEL';
const OLD_GEMINI_SANDBOX_ENV_VAR = 'GEMINI_SANDBOX';


function hasPotentiallyConfiguredADC(): boolean {
  return !!process.env.GOOGLE_APPLICATION_CREDENTIALS || !!process.env.GOOGLE_CLOUD_PROJECT;
}

export async function getStartupWarnings(selectedAuthType?: AuthType): Promise<string[]> {
  const warnings: string[] = [];

  // Check for API Key if it's the selected/implied auth type or no auth type is yet determined
  const needsApiKeyCheck = !selectedAuthType || selectedAuthType === AuthType.USE_GEMINI;

  if (needsApiKeyCheck &&
      !process.env[DOLPHIN_CLI_API_KEY_ENV_VAR] &&
      !process.env.GOOGLE_API_KEY && // For Vertex Express or other Google Cloud APIs via key
      !hasPotentiallyConfiguredADC()) {
    warnings.push(
      `Warning: ${DOLPHIN_CLI_API_KEY_ENV_VAR} (for Google AI Studio keys) or GOOGLE_API_KEY (for Vertex AI express mode) environment variable is not set, and Application Default Credentials don't appear to be configured. Authentication may fail unless you log in interactively or have another auth method selected.`,
    );
  }

  // Check for old environment variables
  if (process.env[OLD_GEMINI_API_KEY_ENV_VAR]) {
    warnings.push(
      `Warning: ${OLD_GEMINI_API_KEY_ENV_VAR} is set. This variable is deprecated. Please use ${DOLPHIN_CLI_API_KEY_ENV_VAR} for Google AI Studio keys. If both are set, ${DOLPHIN_CLI_API_KEY_ENV_VAR} will be preferred.`,
    );
  }
  if (process.env[OLD_GEMINI_MODEL_ENV_VAR]) {
    warnings.push(
      `Warning: ${OLD_GEMINI_MODEL_ENV_VAR} is set. This variable is deprecated. Please use ${DOLPHIN_CLI_MODEL_ENV_VAR}. If both are set, ${DOLPHIN_CLI_MODEL_ENV_VAR} will be preferred.`,
    );
  }
  if (process.env[OLD_GEMINI_SANDBOX_ENV_VAR]) {
    warnings.push(
      `Warning: ${OLD_GEMINI_SANDBOX_ENV_VAR} is set. This variable is deprecated. Please use ${DOLPHIN_CLI_SANDBOX_ENV_VAR}. If both are set, ${DOLPHIN_CLI_SANDBOX_ENV_VAR} will be preferred.`,
    );
  }

  const sandboxEnvValue = process.env[DOLPHIN_CLI_SANDBOX_ENV_VAR];
  if (sandboxEnvValue === 'docker') {
    try {
      await commandExists('docker');
    } catch (e) {
      warnings.push(
        `Warning: Docker command not found, but ${DOLPHIN_CLI_SANDBOX_ENV_VAR} is set to "docker". Sandboxing may not work as intended. Error: ${getErrorMessage(e)}`,
      );
    }
  } else if (sandboxEnvValue === 'podman') {
     try {
      await commandExists('podman');
    } catch (e) {
      warnings.push(
        `Warning: Podman command not found, but ${DOLPHIN_CLI_SANDBOX_ENV_VAR} is set to "podman". Sandboxing may not work. Error: ${getErrorMessage(e)}`,
      );
    }
  }
  // Note: sandbox-exec is macOS specific and its existence check is more complex.
  // It's generally assumed to be available on macOS if specified.

  return warnings;
}

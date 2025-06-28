/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, StructuredError } from '@google/dolphin-cli-core'; // Corrected import

export function parseError(error: unknown, currentAuthType?: AuthType): string {
  let message = 'An unexpected error occurred.';
  let troubleshooting = '';

  if (typeof error === 'string') {
    message = `An unexpected error occurred: ${error}`;
  } else if (error instanceof Error) {
    message = `An unexpected error occurred: ${error.message}`;
    if ((error as any).type === 'UNKNOWN_TOOL') {
        message = `Error: Tool not found - ${(error as any).details?.toolName || 'unknown tool'}. Please ensure it's configured correctly.`;
    }

    const structuredError = error as StructuredError;
    if (structuredError.type) {
      switch (structuredError.type) {
        case 'GOOGLE_AUTH_ERROR':
          message = `Google Authentication Error: ${structuredError.message}`;
          if (structuredError.details?.code) message += ` (${structuredError.details.code})`;
          troubleshooting = `Troubleshooting:\n`;
          troubleshooting += `- Ensure you are logged in with the correct Google account ('gcloud auth login').\n`;
          troubleshooting += `- Check your internet connection.\n`;
          if (currentAuthType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL && structuredError.details?.reason === "PROJECT_ID_REQUIRED_FOR_WORKSPACE") {
            troubleshooting += `- For Google Workspace accounts, a Google Cloud Project is required. Please set the GOOGLE_CLOUD_PROJECT environment variable.\n`;
          } else {
            troubleshooting += `- Verify API access and permissions for your account/project.\n`;
          }
          break;
        case 'DOLPHIN_CLI_API_KEY_ERROR':
          message = `dolphin-cli API Key Error: ${structuredError.message}`;
          troubleshooting = `Troubleshooting:\n`;
          troubleshooting += `- Ensure the DOLPHIN_CLI_API_KEY environment variable is set correctly.\n`;
          troubleshooting += `- Verify your API key for the Google Gemini API is valid and has not expired. You can generate a new one from Google AI Studio.\n`;
          break;
        case 'VERTEX_AI_ERROR':
          message = `Vertex AI Error: ${structuredError.message}`;
          if (structuredError.details?.status) message += ` (Status: ${structuredError.details.status})`;
          troubleshooting = `Troubleshooting:\n`;
          troubleshooting += `- Ensure the GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables are set correctly if not using Vertex AI express mode.\n`;
          troubleshooting += `- If using express mode, ensure GOOGLE_API_KEY is set for Vertex.\n`;
          troubleshooting += `- Verify the Vertex AI API is enabled in your Google Cloud project.\n`;
          troubleshooting += `- Check IAM permissions for the Vertex AI service.\n`;
          break;
        case 'API_REQUEST_FAILED':
          message = `API Request Failed: ${structuredError.message}`;
          if (structuredError.details?.httpStatus) message += ` (${structuredError.details.httpStatus})`;
           troubleshooting = `Troubleshooting:\n`;
          troubleshooting += `- Check your internet connection.\n`;
          troubleshooting += `- The Google Gemini service might be temporarily unavailable. Try again later.\n`;
          if (structuredError.details?.httpStatus === 429) {
            troubleshooting += `- You may have hit a rate limit. Please check usage quotas for the Google Gemini API.\n`;
          }
          break;
        case 'CONFIG_ERROR':
            message = `Configuration Error: ${structuredError.message}`;
            if (structuredError.details?.path) message += ` (File: ${structuredError.details.path})`;
            troubleshooting = `Troubleshooting:\n`;
            troubleshooting += `- Please check your '.dolphin-cli/settings.json' files (both in your project and home directory).\n`;
            if (structuredError.details?.key) troubleshooting += `- Specifically, look at the '${structuredError.details.key}' setting.\n`;
            break;
        case 'TOOL_EXECUTION_ERROR':
            message = `Tool Execution Error: Failed to run tool '${structuredError.details?.toolName || 'unknown'}'. ${structuredError.message}`;
            if (structuredError.details?.exitCode) message += ` (Exit code: ${structuredError.details.exitCode})`;
            if (structuredError.details?.stderr) troubleshooting += `Stderr: ${structuredError.details.stderr}\n`;
            troubleshooting += `Troubleshooting:\n`;
            troubleshooting += `- Ensure the tool and its dependencies are correctly installed and configured.\n`;
            if (structuredError.details?.toolName === 'run_shell_command') {
                 troubleshooting += `- Verify the shell command itself is valid and has necessary permissions.\n`;
            }
            break;
        default:
          message = `Error (${structuredError.type}): ${structuredError.message}`;
          if (structuredError.details) {
            message += ` Details: ${JSON.stringify(structuredError.details)}`;
          }
          break;
      }
    }
  }

  return troubleshooting ? `${message}\n\n${troubleshooting}` : message;
}

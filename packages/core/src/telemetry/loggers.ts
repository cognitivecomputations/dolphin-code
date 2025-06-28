/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger as OtelLogger, logs } from '@opentelemetry/api-logs';
import { Config } from '../config/config.js';
import {
  TELEMETRY_CONFIG_EVENT,
  TELEMETRY_USER_PROMPT_EVENT,
  TELEMETRY_TOOL_CALL_EVENT,
  TELEMETRY_API_REQUEST_EVENT,
  TELEMETRY_API_RESPONSE_EVENT,
  TELEMETRY_API_ERROR_EVENT,
  // If there are specific event names for dolphin-cli, they should be defined here or imported
  // e.g., DOLPHIN_CLI_CONFIG_EVENT, DOLPHIN_CLI_USER_PROMPT_EVENT etc.
  // For now, we'll assume the existing constants are generic enough, or we'll rename them.
  // Let's assume the constants are renamed to reflect dolphin-cli
} from './constants.js'; // constants.ts might also need updates if event names are specific
import {
  ApiErrorBody,
  ApiRequestBody,
  ApiResponseBody,
  ConfigBody,
  TelemetryEventBody,
  ToolCallBody,
  UserPromptBody,
} from './types.js';

// Renaming event constants for clarity with dolphin-cli
const DOLPHIN_CLI_CONFIG_EVENT = 'dolphin_cli.config';
const DOLPHIN_CLI_USER_PROMPT_EVENT = 'dolphin_cli.user_prompt';
const DOLPHIN_CLI_TOOL_CALL_EVENT = 'dolphin_cli.tool_call';
const DOLPHIN_CLI_API_REQUEST_EVENT = 'dolphin_cli.api_request'; // For Google Gemini API
const DOLPHIN_CLI_API_RESPONSE_EVENT = 'dolphin_cli.api_response'; // For Google Gemini API
const DOLPHIN_CLI_API_ERROR_EVENT = 'dolphin_cli.api_error';     // For Google Gemini API


export function logConfig(config: Config, eventBody: ConfigBody) {
  const logger = getOtelLogger(config);
  if (!logger) return;

  logger.emit({
    body: JSON.stringify(eventBody),
    attributes: {
      'event.name': DOLPHIN_CLI_CONFIG_EVENT, // Updated event name
      'event.timestamp': new Date().toISOString(),
    },
  });
}

export function logUserPrompt(config: Config, eventBody: UserPromptBody) {
  const logger = getOtelLogger(config);
  if (!logger) return;

  const body = config.getTelemetryConfig()?.logPrompts
    ? JSON.stringify(eventBody)
    : JSON.stringify({
        ...eventBody,
        prompt: undefined,
      });

  logger.emit({
    body,
    attributes: {
      'event.name': DOLPHIN_CLI_USER_PROMPT_EVENT, // Updated event name
      'event.timestamp': new Date().toISOString(),
    },
  });
}

export function logToolCall(config: Config, eventBody: ToolCallBody) {
  const logger = getOtelLogger(config);
  if (!logger) return;

  logger.emit({
    body: JSON.stringify(eventBody),
    attributes: {
      'event.name': DOLPHIN_CLI_TOOL_CALL_EVENT, // Updated event name
      'event.timestamp': new Date().toISOString(),
    },
  });
}

export function logApiRequest(config: Config, eventBody: ApiRequestBody) {
  const logger = getOtelLogger(config);
  if (!logger) return;

  const body = config.getTelemetryConfig()?.logPrompts
    ? JSON.stringify(eventBody)
    : JSON.stringify({
        ...eventBody,
        request_text: undefined,
      });

  logger.emit({
    body,
    attributes: {
      'event.name': DOLPHIN_CLI_API_REQUEST_EVENT, // Updated event name
      'event.timestamp': new Date().toISOString(),
    },
  });
}

export function logApiResponse(config: Config, eventBody: ApiResponseBody) {
  const logger = getOtelLogger(config);
  if (!logger) return;

  const body = config.getTelemetryConfig()?.logPrompts
    ? JSON.stringify(eventBody)
    : JSON.stringify({
        ...eventBody,
        response_text: undefined,
      });

  logger.emit({
    body,
    attributes: {
      'event.name': DOLPHIN_CLI_API_RESPONSE_EVENT, // Updated event name
      'event.timestamp': new Date().toISOString(),
    },
  });
}

export function logApiError(config: Config, eventBody: ApiErrorBody) {
  const logger = getOtelLogger(config);
  if (!logger) return;

  logger.emit({
    body: JSON.stringify(eventBody),
    attributes: {
      'event.name': DOLPHIN_CLI_API_ERROR_EVENT, // Updated event name
      'event.timestamp': new Date().toISOString(),
    },
  });
}


function getOtelLogger(config: Config): OtelLogger | undefined {
  if (!config.getTelemetryConfig()?.enabled) {
    return undefined;
  }
  return logs.getLogger('dolphin-cli-logger', config.getSessionId()); // Updated logger name
}

export function logGenericEvent(
  config: Config,
  eventName: string, // Should be specific like 'dolphin_cli.something'
  eventBody: TelemetryEventBody,
) {
  const logger = getOtelLogger(config);
  if (!logger) return;

  logger.emit({
    body: JSON.stringify(eventBody),
    attributes: {
      'event.name': eventName,
      'event.timestamp': new Date().toISOString(),
    },
  });
}

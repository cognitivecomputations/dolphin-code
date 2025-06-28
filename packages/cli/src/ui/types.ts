/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ToolCall,
  ToolResult,
  TurnStats,
  ThoughtSummary,
} from '@google/dolphin-cli-core'; // Corrected import

export enum MessageType {
  USER = 'user',
  GEMINI = 'gemini', // Represents responses from the Google Gemini model via dolphin-cli
  TOOL_CODE = 'tool_code',
  TOOL_RESULT = 'tool_result',
  INFO = 'info',
  ERROR = 'error',
  ABOUT = 'about',
  STATS = 'stats',
  QUIT = 'quit',
  COMPRESSION = 'compression',
}

// Base for simple text messages
export interface Message {
  type: MessageType.USER | MessageType.INFO | MessageType.ERROR;
  text: string;
  timestamp: Date;
}

// For Google Gemini model's text responses, channeled through dolphin-cli
export interface GeminiOutput {
  type: MessageType.GEMINI;
  text: string;
  timestamp: Date;
}

// For tool calls initiated by the Google Gemini model (via dolphin-cli)
export interface ToolCallMessage {
  type: MessageType.TOOL_CODE;
  toolCall: ToolCall;
  id: string;
  timestamp: Date;
}

// For results returned from tool execution
export interface ToolResultMessage {
  type: MessageType.TOOL_RESULT;
  toolCall: ToolCall;
  result: ToolResult;
  id: string;
  timestamp: Date;
}

export interface ErrorOutput {
  type: MessageType.ERROR;
  text: string;
  timestamp: Date;
}

export interface About {
  type: MessageType.ABOUT;
  cliVersion: string;
  osVersion: string;
  sandboxEnv: string;
  modelVersion: string; // This would be the Google Gemini model version
  timestamp: Date;
}

export interface Stats {
  type: MessageType.STATS;
  stats: TurnStats;
  lastTurnStats?: TurnStats | null;
  duration: string;
  timestamp: Date;
}

export interface Quit {
  type: MessageType.QUIT;
  stats: TurnStats;
  duration: string;
  timestamp: Date;
}

export interface CompressionState {
    isPending: boolean;
    originalTokenCount: number | null;
    newTokenCount: number | null;
}
export interface Compression {
    type: MessageType.COMPRESSION;
    compression: CompressionState;
    timestamp?: Date;
}


export type HistoryItem = (
  | Message
  | GeminiOutput
  | ToolCallMessage
  | ToolResultMessage
  | ErrorOutput
  | About
  | Stats
  | Quit
  | Compression
) & { id: number };


export type HistoryItemWithoutId = Omit<HistoryItem, 'id'>;

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo } from 'react';
import { type PartListUnion } from '@google/genai';
import open from 'open';
import process from 'node:process';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import { useStateAndRef } from './useStateAndRef.js';
import {
  Config,
  GitService,
  Logger,
  MCPDiscoveryState,
  MCPServerStatus,
  getMCPDiscoveryState,
  getMCPServerStatus,
  // Other relevant core imports
} from '@google/dolphin-cli-core'; // Updated import
import { useSessionStats } from '../contexts/SessionContext.js';
import {
  Message,
  MessageType,
  HistoryItemWithoutId,
  HistoryItem,
} from '../types.js';
import { promises as fs } from 'fs';
import path from 'path';
import { createShowMemoryAction } from './useShowMemoryCommand.js';
import { GIT_COMMIT_INFO } from '../../generated/git-commit.js';
import { formatDuration, formatMemoryUsage } from '../utils/formatters.js';
import { getCliVersion } from '../../utils/version.js';
import { LoadedSettings } from '../../config/settings.js';

export interface SlashCommandActionReturn {
  shouldScheduleTool?: boolean;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  message?: string;
}

export interface SlashCommand {
  name: string;
  altName?: string;
  description?: string;
  completion?: () => Promise<string[]>;
  action: (
    mainCommand: string,
    subCommand?: string,
    args?: string,
  ) =>
    | void
    | SlashCommandActionReturn
    | Promise<void | SlashCommandActionReturn>;
}

export const useSlashCommandProcessor = (
  config: Config | null,
  settings: LoadedSettings,
  history: HistoryItem[],
  addItem: UseHistoryManagerReturn['addItem'],
  clearItems: UseHistoryManagerReturn['clearItems'],
  loadHistory: UseHistoryManagerReturn['loadHistory'],
  refreshStatic: () => void,
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>,
  onDebugMessage: (message: string) => void,
  openThemeDialog: () => void,
  openAuthDialog: () => void,
  openEditorDialog: () => void,
  performMemoryRefresh: () => Promise<void>,
  toggleCorgiMode: () => void, // Assuming this is for an easter egg, leaving as is.
  showToolDescriptions: boolean = false,
  setQuittingMessages: (message: HistoryItem[]) => void,
) => {
  const session = useSessionStats();
  const gitService = useMemo(() => {
    if (!config?.getProjectRoot()) {
      return;
    }
    return new GitService(config.getProjectRoot());
  }, [config]);

  const pendingHistoryItems: HistoryItemWithoutId[] = [];
  const [pendingCompressionItemRef, setPendingCompressionItem] =
    useStateAndRef<HistoryItemWithoutId | null>(null);
  if (pendingCompressionItemRef.current != null) {
    pendingHistoryItems.push(pendingCompressionItemRef.current);
  }

  const addMessage = useCallback(
    (message: Message) => {
      let historyItemContent: HistoryItemWithoutId;
      if (message.type === MessageType.ABOUT) {
        historyItemContent = {
          type: 'about',
          cliVersion: message.cliVersion,
          osVersion: message.osVersion,
          sandboxEnv: message.sandboxEnv,
          modelVersion: message.modelVersion,
        };
      } else if (message.type === MessageType.STATS) {
        historyItemContent = {
          type: 'stats',
          stats: message.stats,
          lastTurnStats: message.lastTurnStats,
          duration: message.duration,
        };
      } else if (message.type === MessageType.QUIT) {
        historyItemContent = {
          type: 'quit',
          stats: message.stats,
          duration: message.duration,
        };
      } else if (message.type === MessageType.COMPRESSION) {
        historyItemContent = {
          type: 'compression',
          compression: message.compression,
        };
      } else {
        historyItemContent = {
          type: message.type as
            | MessageType.INFO
            | MessageType.ERROR
            | MessageType.USER,
          text: message.content,
        };
      }
      addItem(historyItemContent, message.timestamp.getTime());
    },
    [addItem],
  );

  const showMemoryAction = useCallback(async () => {
    const actionFn = createShowMemoryAction(config, settings, addMessage);
    await actionFn();
  }, [config, settings, addMessage]);

  const addMemoryAction = useCallback(
    (
      _mainCommand: string,
      _subCommand?: string,
      args?: string,
    ): SlashCommandActionReturn | void => {
      if (!args || args.trim() === '') {
        addMessage({
          type: MessageType.ERROR,
          content: 'Usage: /memory add <text to remember>',
          timestamp: new Date(),
        });
        return;
      }
      addMessage({
        type: MessageType.INFO,
        content: `Attempting to save to memory: "${args.trim()}"`,
        timestamp: new Date(),
      });
      return {
        shouldScheduleTool: true,
        toolName: 'save_memory',
        toolArgs: { fact: args.trim() },
      };
    },
    [addMessage],
  );

  const savedChatTags = useCallback(async () => {
    const tempDir = config?.getProjectTempDir(); // Uses .dolphin-cli/tmp
    if (!tempDir) {
      return [];
    }
    const checkpointDir = path.join(tempDir, 'checkpoints');
    try {
      await fs.mkdir(checkpointDir, { recursive: true }); // Ensure it exists
      const files = await fs.readdir(checkpointDir);
      return files
        .filter(
          (file) => file.startsWith('checkpoint-') && file.endsWith('.json'),
        )
        .map((file) => file.replace('checkpoint-', '').replace('.json', ''));
    } catch (_err) {
      return [];
    }
  }, [config]);

  const slashCommands: SlashCommand[] = useMemo(() => {
    const commands: SlashCommand[] = [
      {
        name: 'help',
        altName: '?',
        description: 'for help on dolphin-cli',
        action: (_mainCommand, _subCommand, _args) => {
          onDebugMessage('Opening help.');
          setShowHelp(true);
        },
      },
      {
        name: 'docs',
        description: 'open full dolphin-cli documentation in your browser',
        action: async (_mainCommand, _subCommand, _args) => {
          // This URL should be updated if the documentation site URL changes.
          const docsUrl = 'https://github.com/google/dolphin-cli/tree/main/docs';
          if (process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec') {
            addMessage({
              type: MessageType.INFO,
              content: `Please open the following URL in your browser to view the documentation:\n${docsUrl}`,
              timestamp: new Date(),
            });
          } else {
            addMessage({
              type: MessageType.INFO,
              content: `Opening documentation in your browser: ${docsUrl}`,
              timestamp: new Date(),
            });
            await open(docsUrl);
          }
        },
      },
      {
        name: 'clear',
        description: 'clear the screen and conversation history',
        action: async (_mainCommand, _subCommand, _args) => {
          onDebugMessage('Clearing terminal and resetting chat.');
          clearItems();
          await config?.getGeminiClient()?.resetChat();
          console.clear(); // This directly clears the terminal
          refreshStatic();
        },
      },
      {
        name: 'theme',
        description: 'change the theme',
        action: (_mainCommand, _subCommand, _args) => {
          openThemeDialog();
        },
      },
      {
        name: 'auth',
        description: 'change the auth method',
        action: (_mainCommand, _subCommand, _args) => {
          openAuthDialog();
        },
      },
      {
        name: 'editor',
        description: 'set external editor preference',
        action: (_mainCommand, _subCommand, _args) => {
          openEditorDialog();
        },
      },
      {
        name: 'stats',
        altName: 'usage',
        description: 'check session stats',
        action: (_mainCommand, _subCommand, _args) => {
          const now = new Date();
          const { sessionStartTime, cumulative, currentTurn } = session.stats;
          const wallDuration = now.getTime() - sessionStartTime.getTime();

          addMessage({
            type: MessageType.STATS,
            stats: cumulative,
            lastTurnStats: currentTurn,
            duration: formatDuration(wallDuration),
            timestamp: new Date(),
          });
        },
      },
      {
        name: 'mcp',
        description: 'list configured MCP servers and tools',
        action: async (_mainCommand, _subCommand, _args) => {
          let useShowDescriptions = showToolDescriptions;
          if (_subCommand === 'desc' || _subCommand === 'descriptions' || _args === 'desc' || _args === 'descriptions') {
            useShowDescriptions = true;
          } else if (_subCommand === 'nodesc' || _subCommand === 'nodescriptions' || _args === 'nodesc' || _args === 'nodescriptions') {
            useShowDescriptions = false;
          }
          let useShowSchema = _subCommand === 'schema' || _args === 'schema';

          const toolRegistry = await config?.getToolRegistry();
          if (!toolRegistry) {
            addMessage({ type: MessageType.ERROR, content: 'Could not retrieve tool registry.', timestamp: new Date() });
            return;
          }

          const mcpServers = config?.getMcpServers() || {};
          const serverNames = Object.keys(mcpServers);

          if (serverNames.length === 0) {
            const docsUrl = 'https://github.com/google/dolphin-cli/blob/main/docs/tools/mcp-server.md'; // Update URL
            const openMsg = `No MCP servers configured. ${process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec' ? 'Please open the following URL in your browser to view documentation:\n' : 'Opening documentation in your browser: '}${docsUrl}`;
            addMessage({ type: MessageType.INFO, content: openMsg, timestamp: new Date() });
            if (!(process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec')) await open(docsUrl);
            return;
          }

          const connectingServers = serverNames.filter(name => getMCPServerStatus(name) === MCPServerStatus.CONNECTING);
          const discoveryState = getMCPDiscoveryState();
          let message = '';
          if (discoveryState === MCPDiscoveryState.IN_PROGRESS || connectingServers.length > 0) {
            message += `\u001b[33m⏳ MCP servers are starting up (${connectingServers.length} initializing)...\u001b[0m\n`;
            message += `\u001b[90mNote: First startup may take longer. Tool availability will update automatically.\u001b[0m\n\n`;
          }
          message += 'Configured MCP servers:\n\n';
          for (const serverName of serverNames) {
            const serverTools = toolRegistry.getToolsByServer(serverName);
            const status = getMCPServerStatus(serverName);
            let statusIndicator = status === MCPServerStatus.CONNECTED ? '🟢' : status === MCPServerStatus.CONNECTING ? '🔄' : '🔴';
            let statusText = status === MCPServerStatus.CONNECTED ? 'Ready' : status === MCPServerStatus.CONNECTING ? 'Starting...' : 'Disconnected';
            message += `${statusIndicator} \u001b[1m${serverName}\u001b[0m - ${statusText}`;
            if (status === MCPServerStatus.CONNECTED) message += ` (${serverTools.length} tools)`;
            else if (status === MCPServerStatus.CONNECTING) message += ` (tools will appear when ready)`;
            else message += ` (${serverTools.length} tools cached)`;

            const server = mcpServers[serverName];
            if ((useShowDescriptions || useShowSchema) && server?.description) {
              message += `:\n${server.description.trim().split('\n').map(l => `    \u001b[32m${l}\u001b[0m`).join('\n')}\n`;
            } else message += '\n';

            if (serverTools.length > 0) {
              serverTools.forEach(tool => {
                message += `  - \u001b[36m${tool.name}\u001b[0m`;
                if ((useShowDescriptions || useShowSchema) && tool.description) {
                  message += `:\n${tool.description.trim().split('\n').map(l => `      \u001b[32m${l}\u001b[0m`).join('\n')}\n`;
                } else message += '\n';
                if (useShowSchema) {
                  message += `    \u001b[36mParameters:\u001b[0m\n${JSON.stringify(tool.schema.parameters, null, 2).trim().split('\n').map(l => `      \u001b[32m${l}\u001b[0m`).join('\n')}\n`;
                }
              });
            } else message += '  No tools available\n';
            message += '\n';
          }
          message += '\u001b[0m'; // Reset formatting
          addMessage({ type: MessageType.INFO, content: message, timestamp: new Date() });
        },
      },
      {
        name: 'memory',
        description: 'manage memory. Usage: /memory <show|refresh|add> [text for add]',
        action: (mainCommand, subCommand, args) => {
          switch (subCommand) {
            case 'show': showMemoryAction(); return;
            case 'refresh': performMemoryRefresh(); return;
            case 'add': return addMemoryAction(mainCommand, subCommand, args);
            default: addMessage({ type: MessageType.ERROR, content: `Unknown /memory command: ${subCommand}. Available: show, refresh, add`, timestamp: new Date() }); return;
          }
        },
      },
      {
        name: 'tools',
        description: 'list available dolphin-cli tools',
        action: async (_mainCommand, _subCommand, _args) => {
          let useShowDescriptions = showToolDescriptions;
          if (_subCommand === 'desc' || _subCommand === 'descriptions' || _args === 'desc' || _args === 'descriptions') useShowDescriptions = true;
          else if (_subCommand === 'nodesc' || _subCommand === 'nodescriptions' || _args === 'nodesc' || _args === 'nodescriptions') useShowDescriptions = false;

          const toolRegistry = await config?.getToolRegistry();
          const tools = toolRegistry?.getAllTools();
          if (!tools) {
            addMessage({ type: MessageType.ERROR, content: 'Could not retrieve tools.', timestamp: new Date() });
            return;
          }
          const cliTools = tools.filter(tool => !('serverName' in tool));
          let message = 'Available dolphin-cli tools:\n\n';
          if (cliTools.length > 0) {
            cliTools.forEach(tool => {
              message += `  - \u001b[36m${tool.displayName} (${tool.name})\u001b[0m`;
              if (useShowDescriptions && tool.description) {
                message += `:\n${tool.description.trim().split('\n').map(l => `      \u001b[32m${l}\u001b[0m`).join('\n')}\n`;
              } else message += '\n';
            });
          } else message += '  No tools available\n';
          message += '\u001b[0m';
          addMessage({ type: MessageType.INFO, content: message + '\n', timestamp: new Date() });
        },
      },
      { name: 'corgi', action: toggleCorgiMode }, // Assuming corgi mode is an easter egg
      {
        name: 'about',
        description: 'show version info',
        action: async () => {
          const osVersion = process.platform;
          let sandboxEnv = 'no sandbox';
          if (process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec') {
            sandboxEnv = process.env.SANDBOX.replace(/^dolphin-cli-(?:code-)?/, ''); // Updated prefix
          } else if (process.env.SANDBOX === 'sandbox-exec') {
            sandboxEnv = `sandbox-exec (${process.env.SEATBELT_PROFILE || 'unknown'})`;
          }
          const modelVersion = config?.getModel() || 'Unknown';
          const cliVersion = await getCliVersion();
          addMessage({ type: MessageType.ABOUT, timestamp: new Date(), cliVersion, osVersion, sandboxEnv, modelVersion });
        },
      },
      {
        name: 'bug',
        description: 'submit a bug report',
        action: async (_mainCommand, _subCommand, args) => {
          let bugDescription = (_subCommand || '' + (args ? ` ${args}` : '')).trim();
          const osVersion = `${process.platform} ${process.version}`;
          let sandboxEnv = 'no sandbox';
           if (process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec') {
            sandboxEnv = process.env.SANDBOX.replace(/^dolphin-cli-(?:code-)?/, '');
          } else if (process.env.SANDBOX === 'sandbox-exec') {
            sandboxEnv = `sandbox-exec (${process.env.SEATBELT_PROFILE || 'unknown'})`;
          }
          const modelVersion = config?.getModel() || 'Unknown';
          const cliVersion = await getCliVersion();
          const memoryUsage = formatMemoryUsage(process.memoryUsage().rss);
          const info = `\n*   **CLI Version:** ${cliVersion}\n*   **Git Commit:** ${GIT_COMMIT_INFO}\n*   **Operating System:** ${osVersion}\n*   **Sandbox Environment:** ${sandboxEnv}\n*   **Model Version:** ${modelVersion}\n*   **Memory Usage:** ${memoryUsage}\n`;
          let bugReportUrl = config?.getBugCommand()?.urlTemplate || 'https://github.com/google/dolphin-cli/issues/new?template=bug_report.yml&title={title}&info={info}'; // Updated URL
          bugReportUrl = bugReportUrl.replace('{title}', encodeURIComponent(bugDescription)).replace('{info}', encodeURIComponent(info));
          addMessage({ type: MessageType.INFO, content: `To submit your bug report, please open the following URL in your browser:\n${bugReportUrl}`, timestamp: new Date() });
          if (!(process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec')) await open(bugReportUrl).catch(e => addMessage({type: MessageType.ERROR, content: `Could not open URL: ${e.message}`, timestamp: new Date()}));
        },
      },
      {
        name: 'chat',
        description: 'Manage conversation history. Usage: /chat <list|save|resume> [tag]',
        action: async (_mainCommand, subCommand, args) => {
          const tag = (args || '').trim();
          const logger = new Logger(config?.getSessionId() || '');
          await logger.initialize(config || undefined); // Pass config or undefined
          const chat = await config?.getGeminiClient()?.getChat();
          if (!chat) {
            addMessage({ type: MessageType.ERROR, content: 'No chat client available.', timestamp: new Date() });
            return;
          }
          switch (subCommand) {
            case 'save':
              await logger.saveCheckpoint(chat.getHistory() || [], tag);
              addMessage({ type: MessageType.INFO, content: `Conversation checkpoint saved${tag ? ' with tag: ' + tag : ''}.`, timestamp: new Date() });
              break;
            case 'resume': case 'restore': case 'load':
              const conversation = await logger.loadCheckpoint(tag);
              if (conversation.length === 0) {
                addMessage({ type: MessageType.INFO, content: `No saved checkpoint found${tag ? ' with tag: ' + tag : ''}.`, timestamp: new Date() });
                return;
              }
              clearItems();
              chat.clearHistory(); // Clear core history
              const loadedHistoryItems: HistoryItem[] = conversation.map((item, index) => ({
                type: item.role === 'user' ? MessageType.USER : MessageType.GEMINI,
                text: item.parts?.filter(p => p.text).map(p => p.text).join('') || '',
                id: Date.now() + index, // Ensure unique ID for React keys
                // Convert other parts if necessary (tool calls, etc.)
              }));
              loadHistory(loadedHistoryItems); // Load into UI history
              // Also need to repopulate client's internal history for context
              conversation.forEach(coreItem => chat.addHistory(coreItem));
              console.clear(); refreshStatic();
              break;
            case 'list':
              addMessage({ type: MessageType.INFO, content: `List of saved conversations: ${(await savedChatTags()).join(', ')}`, timestamp: new Date() });
              break;
            default:
              addMessage({ type: MessageType.ERROR, content: `Unknown /chat command: ${subCommand}. Available: list, save, resume`, timestamp: new Date() });
          }
        },
        completion: async () => (await savedChatTags()).map(tag => `resume ${tag}`),
      },
      {
        name: 'quit',
        altName: 'exit',
        description: 'exit the cli',
        action: async (mainCommand) => {
          const now = new Date();
          const { sessionStartTime, cumulative } = session.stats;
          const wallDuration = now.getTime() - sessionStartTime.getTime();
          setQuittingMessages([
            { type: MessageType.USER, text: `/${mainCommand}`, id: now.getTime() -1 },
            { type: MessageType.QUIT, stats: cumulative, duration: formatDuration(wallDuration), id: now.getTime() },
          ]);
          setTimeout(() => process.exit(0), 100);
        },
      },
      {
        name: 'compress',
        altName: 'summarize',
        description: 'Compresses the context by replacing it with a summary.',
        action: async () => {
          if (pendingCompressionItemRef.current !== null) {
            addMessage({ type: MessageType.ERROR, content: 'Already compressing, wait for previous request to complete', timestamp: new Date() });
            return;
          }
          setPendingCompressionItem({ type: MessageType.COMPRESSION, compression: { isPending: true, originalTokenCount: null, newTokenCount: null } });
          try {
            const compressed = await config?.getGeminiClient()?.getChat()?.tryCompressChat(true);
            if (compressed) {
              addMessage({ type: MessageType.COMPRESSION, compression: { isPending: false, originalTokenCount: compressed.originalTokenCount, newTokenCount: compressed.newTokenCount }, timestamp: new Date() });
            } else {
              addMessage({ type: MessageType.ERROR, content: 'Failed to compress chat history.', timestamp: new Date() });
            }
          } catch (e) {
            addMessage({ type: MessageType.ERROR, content: `Failed to compress chat history: ${e instanceof Error ? e.message : String(e)}`, timestamp: new Date() });
          }
          setPendingCompressionItem(null);
        },
      },
    ];

    if (config?.getCheckpointingEnabled()) {
      commands.push({
        name: 'restore',
        description: 'restore a tool call. This will reset the conversation and file history to the state it was in when the tool call was suggested',
        completion: async () => {
          const checkpointDir = config?.getProjectTempDir() ? path.join(config.getProjectTempDir(), 'checkpoints') : undefined;
          if (!checkpointDir) return [];
          try {
            await fs.mkdir(checkpointDir, { recursive: true });
            const files = await fs.readdir(checkpointDir);
            return files.filter(file => file.endsWith('.json')).map(file => file.replace('.json', ''));
          } catch (_err) { return []; }
        },
        action: async (_mainCommand, subCommand, _args) => {
          const checkpointDir = config?.getProjectTempDir() ? path.join(config.getProjectTempDir(), 'checkpoints') : undefined;
          if (!checkpointDir) {
            addMessage({ type: MessageType.ERROR, content: 'Could not determine the .dolphin-cli directory path.', timestamp: new Date() });
            return;
          }
          try {
            await fs.mkdir(checkpointDir, { recursive: true });
            const files = await fs.readdir(checkpointDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            if (!subCommand) {
              if (jsonFiles.length === 0) {
                addMessage({ type: MessageType.INFO, content: 'No restorable tool calls found.', timestamp: new Date() });
                return;
              }
              addMessage({ type: MessageType.INFO, content: `Available tool calls to restore:\n\n${jsonFiles.map(f => f.replace('.json','')).join('\n')}`, timestamp: new Date() });
              return;
            }
            const selectedFile = subCommand.endsWith('.json') ? subCommand : `${subCommand}.json`;
            if (!jsonFiles.includes(selectedFile)) {
              addMessage({ type: MessageType.ERROR, content: `File not found: ${selectedFile}`, timestamp: new Date() });
              return;
            }
            const filePath = path.join(checkpointDir, selectedFile);
            const data = await fs.readFile(filePath, 'utf-8');
            const toolCallData = JSON.parse(data);

            if (toolCallData.history) { // This is UI history
                // Convert core history items to UI history items before loading
                const uiHistoryToLoad: HistoryItem[] = toolCallData.history.map((coreItem: any, index: number) => {
                    // This mapping needs to be robust, handling different core item types
                    // For simplicity, assuming text parts for now.
                    let itemType = MessageType.GEMINI;
                    if (coreItem.role === 'user') itemType = MessageType.USER;
                    // Add more sophisticated type mapping if core history contains tool calls/results
                    return {
                        type: itemType,
                        text: coreItem.parts?.map((p:any) => p.text || '').join('') || '',
                        id: Date.now() + index, // Ensure unique ID
                        timestamp: new Date(coreItem.timestamp || Date.now()) // Ensure timestamp
                    };
                });
                loadHistory(uiHistoryToLoad);
            }
            if (toolCallData.clientHistory) { // This is core client history
              await config?.getGeminiClient()?.getChat()?.setHistory(toolCallData.clientHistory);
            }
            if (toolCallData.commitHash && gitService) {
              await gitService.restoreProjectFromSnapshot(toolCallData.commitHash);
              addMessage({ type: MessageType.INFO, content: `Restored project to the state before the tool call.`, timestamp: new Date() });
            }
            return { shouldScheduleTool: true, toolName: toolCallData.toolCall.name, toolArgs: toolCallData.toolCall.args };
          } catch (error) {
            addMessage({ type: MessageType.ERROR, content: `Could not read restorable tool calls. Error: ${error instanceof Error ? error.message : String(error)}`, timestamp: new Date() });
          }
        },
      });
    }
    return commands;
  }, [
    config, settings, history, addItem, clearItems, loadHistory, refreshStatic, setShowHelp, onDebugMessage,
    openThemeDialog, openAuthDialog, openEditorDialog, performMemoryRefresh, toggleCorgiMode,
    showToolDescriptions, setQuittingMessages, addMemoryAction, showMemoryAction, savedChatTags, gitService, session
  ]);

  const handleSlashCommand = useCallback(
    async (rawQuery: string | PartListUnion): Promise<SlashCommandActionReturn | boolean> => {
      if (typeof rawQuery !== 'string') return false; // Only process string inputs for slash commands

      const trimmed = rawQuery.trim();
      if (!trimmed.startsWith('/') && !trimmed.startsWith('?')) return false;

      const userMessageTimestamp = Date.now();
      if (trimmed !== '/quit' && trimmed !== '/exit') { // Don't add quit to UI history here
        addItem({ type: MessageType.USER, text: trimmed }, userMessageTimestamp);
      }

      let subCommand: string | undefined;
      let args: string | undefined;
      const parts = trimmed.substring(trimmed.startsWith('?') ? 0 : 1).trim().split(/\s+/);
      const commandToMatch = trimmed.startsWith('?') ? 'help' : parts[0];

      if (parts.length > 1 && !trimmed.startsWith('?')) subCommand = parts[1];
      if (parts.length > 2 && !trimmed.startsWith('?')) args = parts.slice(2).join(' ');
      if (trimmed.startsWith('?') && parts.length > 0 && parts[0] !== '?') args = parts.join(' ');


      for (const cmd of slashCommands) {
        if (commandToMatch === cmd.name || commandToMatch === cmd.altName) {
          const actionResult = await cmd.action(commandToMatch, subCommand, args);
          if (typeof actionResult === 'object' && actionResult?.shouldScheduleTool) {
            return actionResult;
          }
          return true;
        }
      }
      addMessage({ type: MessageType.ERROR, content: `Unknown command: ${trimmed}`, timestamp: new Date() });
      return true;
    },
    [addItem, slashCommands, addMessage], // Ensure all dependencies are listed
  );

  return { handleSlashCommand, slashCommands, pendingHistoryItems };
};

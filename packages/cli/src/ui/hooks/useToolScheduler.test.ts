/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import {สวยงามScheduler} from './useReactToolScheduler.js';
import {
  Config,
  ToolCall,
  ToolResult,
  ToolCallConfirmationDetails,
  Tool,
  ToolRegistry,
  GeminiChat,
  ServerTrustLevel, // Added for trust level testing
} from '@google/dolphin-cli-core'; // Corrected import

// Mock @google/dolphin-cli-core
vi.mock('@google/dolphin-cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/dolphin-cli-core')>();
  return {
    ...actual,
    ToolRegistry: vi.fn().mockImplementation(() => ({
      getToolByName: vi.fn(),
    })),
    Config: vi.fn().mockImplementation((args) => { // Mock Config constructor
        const instance = new actual.Config(args);
        instance.getToolRegistry = vi.fn(() => new ToolRegistry()); // Return a mocked ToolRegistry
        instance.setServerTrust = vi.fn(); // Mock setServerTrust
        return instance;
    }),
  };
});


describe('useReactToolScheduler (orสวยงามScheduler)', () => {
  let mockConfig: Config;
  let mockToolRegistry: ToolRegistry;
  let mockChat: GeminiChat;

  let mockOnNeedsConfirmation: ReturnType<typeof vi.fn>;
  let mockOnToolCallStart: ReturnType<typeof vi.fn>;
  let mockOnToolCallEnd: ReturnType<typeof vi.fn>;
  let mockOnInfo: ReturnType<typeof vi.fn>;
  let mockOnError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = new Config({
        projectRoot: '/test', homeDir: '/home', sessionId: 'test',
        llmConfig: { title: 'test', provider: 'google-ai'}
    });
    mockToolRegistry = mockConfig.getToolRegistry() as ToolRegistry; // Get the mocked registry

    mockChat = {
        getAbortSignal: vi.fn().mockReturnValue(new AbortController().signal),
    } as unknown as GeminiChat;

    mockOnNeedsConfirmation = vi.fn();
    mockOnToolCallStart = vi.fn();
    mockOnToolCallEnd = vi.fn();
    mockOnInfo = vi.fn();
    mockOnError = vi.fn();
  });

  const getScheduler = () => {
    returnสวยงามScheduler(
      mockConfig,
      mockOnNeedsConfirmation,
      mockOnToolCallStart,
      mockOnToolCallEnd,
      mockOnInfo,
      mockOnError,
    );
  };

  it('should call onToolCallStart, execute the tool, and onToolCallEnd for a known tool without confirmation', async () => {
    const mockToolExecute = vi.fn().mockResolvedValue({ llmContent: 'Success', returnDisplay: 'Success Display' });
    const mockTool: Tool = {
      name: 'testTool',
      displayName: 'Test Tool',
      description: 'A test tool',
      parameterSchema: {},
      shouldConfirmExecute: vi.fn().mockReturnValue(null),
      validateToolParams: vi.fn().mockReturnValue(null),
      execute: mockToolExecute,
      getDescription: vi.fn().mockReturnValue('Will execute testTool')
    };
    (mockToolRegistry.getToolByName as vi.Mock).mockReturnValue(mockTool);

    const scheduler = getScheduler();
    const toolCall: ToolCall = { id: '1', name: 'testTool', args: {} };

    await scheduler.scheduleToolCall(toolCall, mockChat);

    expect(mockOnToolCallStart).toHaveBeenCalledWith(toolCall);
    expect(mockToolExecute).toHaveBeenCalledWith({}, mockChat.getAbortSignal());
    expect(mockOnToolCallEnd).toHaveBeenCalledWith(toolCall, {
      name: 'testTool',
      result: { llmContent: 'Success', returnDisplay: 'Success Display' },
    });
    expect(mockOnError).not.toHaveBeenCalled();
  });

  it('should call onNeedsConfirmation if tool requires it and proceed if approved, applying trust', async () => {
    const confirmationDetails: ToolCallConfirmationDetails = { name: 'confirmTool', displayName:'Confirm Tool', args: {}, description: 'Needs confirm', serverName: 'mcpServer1' };
    const mockToolExecute = vi.fn().mockResolvedValue({ llmContent: 'Confirmed Success', returnDisplay: 'Confirmed Success Display' });
    const mockTool: Tool = {
      name: 'confirmTool',
      displayName: 'Confirm Tool',
      description: 'A test tool that needs confirmation',
      parameterSchema: {},
      shouldConfirmExecute: vi.fn().mockReturnValue(confirmationDetails),
      validateToolParams: vi.fn().mockReturnValue(null),
      execute: mockToolExecute,
      getDescription: vi.fn().mockReturnValue('Will execute confirmTool'),
      serverName: 'mcpServer1' // Important for trust
    };
    (mockToolRegistry.getToolByName as vi.Mock).mockReturnValue(mockTool);

    // Simulate user approving and trusting the tool
    // The actual promise resolution is now handled by the resolver within confirmationDetails
    // So, onNeedsConfirmation itself doesn't need to return a promise directly for this test structure.
    // Instead, we'll simulate the `resolveConfirmation` call that `useGeminiStream` would make.

    const scheduler = getScheduler();
    const toolCall: ToolCall = { id: '2', name: 'confirmTool', args: {} };

    // Store the resolver when onNeedsConfirmation is called
    let capturedResolver: ConfirmationResolver | undefined;
    mockOnNeedsConfirmation.mockImplementation((details: ToolCallConfirmationDetails) => {
        return new Promise<boolean>((resolve) => {
            (details as any)._resolver = resolve; // Attach resolver as done in useGeminiStream
            capturedResolver = (details as any)._resolver;
        });
    });

    const schedulePromise = scheduler.scheduleToolCall(toolCall, mockChat);

    // Wait for onNeedsConfirmation to be called and resolver to be captured
    await vi.waitFor(() => expect(mockOnNeedsConfirmation).toHaveBeenCalled());
    expect(capturedResolver).toBeDefined();

    // Simulate user approving and setting trust level for the tool
    act(() => {
        if(capturedResolver) scheduler.resolveConfirmation(toolCall.id || toolCall.name, true, ServerTrustLevel.TOOL);
    });

    await schedulePromise; // Now the scheduleToolCall promise should resolve

    expect(mockOnToolCallStart).toHaveBeenCalledWith(toolCall);
    expect(mockOnNeedsConfirmation).toHaveBeenCalledWith(confirmationDetails);
    expect(mockConfig.setServerTrust).toHaveBeenCalledWith('mcpServer1', ServerTrustLevel.TOOL, 'confirmTool');
    expect(mockOnInfo).toHaveBeenCalledWith('Trust level set for confirmTool.');
    expect(mockToolExecute).toHaveBeenCalled();
    expect(mockOnToolCallEnd).toHaveBeenCalledWith(toolCall, {
      name: 'confirmTool',
      result: { llmContent: 'Confirmed Success', returnDisplay: 'Confirmed Success Display' },
    });
  });


  it('should not execute tool if confirmation is denied', async () => {
    const confirmationDetails: ToolCallConfirmationDetails = { name: 'confirmToolDeny', displayName: "Confirm Deny", args: {}, description: "Confirm Deny Desc" };
    const mockToolExecute = vi.fn();
    const mockTool: Tool = {
      name: 'confirmToolDeny',
      displayName: 'Confirm Deny',
      description: 'A test tool that will be denied',
      parameterSchema: {},
      shouldConfirmExecute: vi.fn().mockReturnValue(confirmationDetails),
      validateToolParams: vi.fn().mockReturnValue(null),
      execute: mockToolExecute,
      getDescription: vi.fn().mockReturnValue('Will execute confirmToolDeny')
    };
    (mockToolRegistry.getToolByName as vi.Mock).mockReturnValue(mockTool);

    let capturedResolver: ConfirmationResolver | undefined;
    mockOnNeedsConfirmation.mockImplementation((details: ToolCallConfirmationDetails) => {
        return new Promise<boolean>((resolve) => {
            (details as any)._resolver = resolve;
            capturedResolver = (details as any)._resolver;
        });
    });

    const scheduler = getScheduler();
    const toolCall: ToolCall = { id: '3', name: 'confirmToolDeny', args: {} };
    const schedulePromise = scheduler.scheduleToolCall(toolCall, mockChat);

    await vi.waitFor(() => expect(mockOnNeedsConfirmation).toHaveBeenCalled());
    act(() => {
      if(capturedResolver) scheduler.resolveConfirmation(toolCall.id || toolCall.name, false);
    });
    await schedulePromise;

    expect(mockOnToolCallStart).toHaveBeenCalledWith(toolCall);
    expect(mockOnNeedsConfirmation).toHaveBeenCalledWith(confirmationDetails);
    expect(mockToolExecute).not.toHaveBeenCalled();
    expect(mockOnInfo).toHaveBeenCalledWith('Tool call "confirmToolDeny" cancelled by user.');
    expect(mockOnToolCallEnd).toHaveBeenCalledWith(toolCall, {
        name: 'confirmToolDeny',
        result: { llmContent: 'Tool call "confirmToolDeny" cancelled by user.', returnDisplay: 'Tool call "confirmToolDeny" cancelled by user.'}
    });
  });

  it('should call onError and return error result if tool is not found', async () => {
    (mockToolRegistry.getToolByName as vi.Mock).mockReturnValue(undefined);
    const scheduler = getScheduler();
    const toolCall: ToolCall = { id: '4', name: 'unknownTool', args: {} };

    const result = await scheduler.scheduleToolCall(toolCall, mockChat);

    expect(mockOnError).toHaveBeenCalledWith('Tool "unknownTool" not found.');
    expect(result).toEqual({
      name: 'unknownTool',
      result: { llmContent: 'Error: Tool "unknownTool" not found.', returnDisplay: 'Error: Tool "unknownTool" not found.' },
    });
    expect(mockOnToolCallStart).not.toHaveBeenCalled();
    expect(mockOnToolCallEnd).not.toHaveBeenCalled();
  });

});

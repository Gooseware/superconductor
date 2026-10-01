import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';

export interface FiberContext {
  componentName: string;
  file?: string;
  line?: number;
  column?: number;
  selector?: string;
  propsSummary?: Record<string, any>;
}

export interface CopilotMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
  contextPills?: Array<{
    type: 'component' | 'source' | 'pin' | 'token';
    label: string;
    value?: string;
  }>;
  proposalPayload?: {
    title: string;
    diffSummary?: string;
    status: 'ready' | 'applied' | 'rejected';
  };
}

export interface ProposalMetadata {
  title?: string;
  author?: string;
  status?: string;
  timestamp?: number;
}

export interface CopilotSidecarProps {
  fiberContext?: FiberContext | null;
  activeViewMode?: 'current' | 'proposal';
  onViewModeChange?: (mode: 'current' | 'proposal') => void;
  messages?: CopilotMessage[];
  onSendMessage?: (content: string, context?: FiberContext | null) => void;
  isAgentTyping?: boolean;
  onClose?: () => void;
  proposalMetadata?: ProposalMetadata;
  quickActions?: string[];
  className?: string;
}

const DEFAULT_QUICK_ACTIONS = [
  'Fix contrast & tokens',
  'Tune spring entrance',
  'Extract to shared block',
  'Generate track spec'
];

export function CopilotSidecar({
  fiberContext = null,
  activeViewMode: externalMode,
  onViewModeChange,
  messages: externalMessages,
  onSendMessage,
  isAgentTyping = false,
  onClose,
  proposalMetadata = {
    title: 'In-DOM Live Draft Patch',
    status: 'Ephemeral virtual module patch'
  },
  quickActions = DEFAULT_QUICK_ACTIONS,
  className = ''
}: CopilotSidecarProps) {
  // Mode state: 'current' vs 'proposal'
  const [internalMode, setInternalMode] = useState<'current' | 'proposal'>('current');
  const viewMode = externalMode !== undefined ? externalMode : internalMode;

  const handleModeChange = (mode: 'current' | 'proposal') => {
    setInternalMode(mode);
    onViewModeChange?.(mode);
  };

  // Internal messages state fallback
  const [internalMessages, setInternalMessages] = useState<CopilotMessage[]>([
    {
      id: 'welcome',
      sender: 'agent',
      content:
        'Hello! I am your Superconductor Visual Studio Copilot. Select any DOM element to inspect its React Fiber context, drop feedback pins, or ask me to draft live in-DOM proposals.',
      timestamp: Date.now()
    }
  ]);

  const messages = externalMessages || internalMessages;
  const [inputValue, setInputValue] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (typeof chatBottomRef.current?.scrollIntoView === 'function') {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAgentTyping]);

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (onSendMessage) {
      onSendMessage(trimmed, fiberContext);
    } else {
      // Local fallback
      const userMsg: CopilotMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        content: trimmed,
        timestamp: Date.now(),
        contextPills: fiberContext
          ? [
              {
                type: 'component',
                label: `<${fiberContext.componentName} />`
              }
            ]
          : undefined
      };
      setInternalMessages(prev => [...prev, userMsg]);
    }

    setInputValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (actionText: string) => {
    if (onSendMessage) {
      onSendMessage(actionText, fiberContext);
    } else {
      const userMsg: CopilotMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        content: actionText,
        timestamp: Date.now()
      };
      setInternalMessages(prev => [...prev, userMsg]);
    }
  };

  return (
    <aside
      data-testid="copilot-sidecar"
      aria-label="Superconductor Copilot Sidecar"
      className={`visual-studio-copilot-sidecar ${className}`.trim()}
      style={{
        width: '380px',
        height: '100%',
        maxHeight: '100vh',
        backgroundColor: '#161920',
        color: '#f3f4f6',
        borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.35)',
        display: 'flex',
        flexDirection: 'column',
        fontSize: '13px',
        boxSizing: 'border-box',
        pointerEvents: 'auto', // HIT-TESTING DOGMA: Sidecar handles its own events
        zIndex: 9050,
        position: 'relative'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(0, 0, 0, 0.2)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 8px #10b981'
            }}
          />
          <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '-0.01em' }}>
            Copilot Sidecar
          </span>
        </div>

        {onClose && (
          <button
            type="button"
            data-testid="copilot-close-btn"
            onClick={onClose}
            aria-label="Close copilot sidecar"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              fontSize: '18px',
              cursor: 'pointer',
              lineHeight: 1
            }}
          >
            &times;
          </button>
        )}
      </div>

      {/* React Fiber Introspection Context Banner */}
      <div
        data-testid="fiber-context-banner"
        style={{
          padding: '12px 16px',
          backgroundColor: 'rgba(59, 130, 246, 0.06)',
          borderBottom: '1px solid rgba(59, 130, 246, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#60a5fa', fontWeight: 700 }}>
            Fiber Introspection
          </span>
          {fiberContext?.selector && (
            <span
              title={fiberContext.selector}
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#9ca3af',
                maxWidth: '180px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {fiberContext.selector}
            </span>
          )}
        </div>

        {fiberContext ? (
          <div>
            <div
              data-testid="active-component-name"
              style={{
                fontFamily: 'monospace',
                fontSize: '13px',
                fontWeight: 600,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>&lt;{fiberContext.componentName} /&gt;</span>
            </div>

            {fiberContext.file && (
              <div
                data-testid="active-source-location"
                title={`${fiberContext.file}:${fiberContext.line || 1}`}
                style={{
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: '#93c5fd',
                  marginTop: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {fiberContext.file}:{fiberContext.line || 1}
              </div>
            )}
          </div>
        ) : (
          <div
            data-testid="no-fiber-context"
            style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}
          >
            No component selected. Click or inspect any element to load Fiber context.
          </div>
        )}
      </div>

      {/* A/B Mode Toggle Segmented Control */}
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#1b1f27'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600 }}>
            Preview Viewport:
          </span>
          <span style={{ fontSize: '11px', color: viewMode === 'proposal' ? '#34d399' : '#9ca3af' }}>
            {viewMode === 'proposal' ? 'Live Proposal' : 'Original Baseline'}
          </span>
        </div>

        <div
          data-testid="ab-toggle-group"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '8px',
            padding: '2px',
            gap: '2px'
          }}
        >
          <button
            type="button"
            data-testid="ab-toggle-current"
            onClick={() => handleModeChange('current')}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              backgroundColor: viewMode === 'current' ? '#374151' : 'transparent',
              color: viewMode === 'current' ? '#ffffff' : '#9ca3af',
              transition: 'all 0.15s ease'
            }}
          >
            [Current]
          </button>
          <button
            type="button"
            data-testid="ab-toggle-proposal"
            onClick={() => handleModeChange('proposal')}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              backgroundColor: viewMode === 'proposal' ? '#2563eb' : 'transparent',
              color: viewMode === 'proposal' ? '#ffffff' : '#9ca3af',
              transition: 'all 0.15s ease'
            }}
          >
            [Proposal]
          </button>
        </div>

        {/* Status notice */}
        {viewMode === 'proposal' && (
          <div
            data-testid="proposal-status-notice"
            style={{
              marginTop: '6px',
              padding: '4px 8px',
              borderRadius: '4px',
              backgroundColor: 'rgba(37, 99, 235, 0.15)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              fontSize: '11px',
              color: '#93c5fd'
            }}
          >
            Draft Proposal: {proposalMetadata.title || 'In-Memory Virtual Module Patch'}
          </div>
        )}
      </div>

      {/* Chat Messages Stream */}
      <div
        data-testid="copilot-messages-container"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        {messages.map(msg => {
          const isUser = msg.sender === 'user';
          const isSystem = msg.sender === 'system';

          return (
            <div
              key={msg.id}
              data-testid={`copilot-message-${msg.id}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
                gap: '4px'
              }}
            >
              {/* Sender label */}
              <span style={{ fontSize: '10px', color: '#6b7280', textTransform: 'capitalize' }}>
                {msg.sender}
              </span>

              {/* Message Bubble */}
              <div
                style={{
                  maxWidth: '85%',
                  padding: '10px 12px',
                  borderRadius: isUser ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                  backgroundColor: isUser
                    ? '#2563eb'
                    : isSystem
                    ? '#374151'
                    : '#1f242d',
                  border: isUser ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  lineHeight: '1.45',
                  wordBreak: 'break-word'
                }}
              >
                {/* Context Pills */}
                {msg.contextPills && msg.contextPills.length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    {msg.contextPills.map((pill, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(255, 255, 255, 0.15)',
                          fontFamily: pill.type === 'component' ? 'monospace' : 'inherit'
                        }}
                      >
                        {pill.label}
                      </span>
                    ))}
                  </div>
                )}

                <div>{msg.content}</div>

                {/* Attached Proposal Payload Card if any */}
                {msg.proposalPayload && (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '8px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      fontSize: '11px'
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#60a5fa' }}>
                      {msg.proposalPayload.title}
                    </div>
                    {msg.proposalPayload.diffSummary && (
                      <div style={{ color: '#9ca3af', marginTop: '2px' }}>
                        {msg.proposalPayload.diffSummary}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleModeChange('proposal')}
                      style={{
                        marginTop: '6px',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        backgroundColor: '#3b82f6',
                        color: '#ffffff',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      Preview Proposal
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isAgentTyping && (
          <div
            data-testid="copilot-typing-indicator"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#1f242d',
              borderRadius: '8px',
              color: '#9ca3af',
              fontSize: '11px',
              width: 'fit-content'
            }}
          >
            <span>Agent drafting proposal</span>
            <span style={{ letterSpacing: '2px' }}>...</span>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Quick Action Chips */}
      {quickActions.length > 0 && (
        <div
          data-testid="quick-actions-bar"
          style={{
            padding: '8px 16px',
            display: 'flex',
            gap: '6px',
            overflowX: 'auto',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            backgroundColor: '#181b22'
          }}
        >
          {quickActions.map((action, idx) => (
            <button
              key={idx}
              type="button"
              data-testid={`quick-action-${idx}`}
              onClick={() => handleQuickAction(action)}
              style={{
                whiteSpace: 'nowrap',
                padding: '4px 10px',
                borderRadius: '999px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                color: '#d1d5db',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              {action}
            </button>
          ))}
        </div>
      )}

      {/* Chat Input */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#1b1f27',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            data-testid="copilot-input"
            aria-label="Ask Superconductor Copilot"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              fiberContext
                ? `Prompt agent regarding <${fiberContext.componentName} />...`
                : 'Ask agent to modify layout, tokens, or springs...'
            }
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              backgroundColor: '#262b35',
              color: '#ffffff',
              fontSize: '12px',
              outline: 'none'
            }}
          />
          <button
            type="button"
            data-testid="copilot-send-btn"
            onClick={handleSend}
            disabled={!inputValue.trim()}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: inputValue.trim() ? '#2563eb' : '#374151',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '12px',
              cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
              transition: 'background-color 0.15s ease'
            }}
          >
            Send
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#6b7280' }}>
          <span>Press Enter to send</span>
          {fiberContext && <span>Targeting &lt;{fiberContext.componentName} /&gt;</span>}
        </div>
      </div>
    </aside>
  );
}

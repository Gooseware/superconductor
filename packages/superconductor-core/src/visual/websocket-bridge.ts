import * as http from 'http';
import * as crypto from 'crypto';
import * as net from 'net';
import { EventEmitter } from 'events';
import {
  type SpatialAnnotation,
  type ProposalPatch,
  validateSpatialAnnotation,
  validateProposalPatch,
} from './surface-adapter.js';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const MAX_FRAME_PAYLOAD = 5 * 1024 * 1024; // 5MB

export interface FiberSourceLocation {
  filePath: string;
  lineNumber?: number;
  columnNumber?: number;
  componentName?: string;
}

export interface SelectedElementContext {
  selector?: string;
  xpath?: string;
  fiberSource?: FiberSourceLocation;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  viewId?: string;
}

export interface ElementSelectedEvent {
  selector: string;
  xpath?: string;
  fiberSource?: FiberSourceLocation;
}

export interface AnnotationCreatedEvent {
  annotation: SpatialAnnotation;
  client?: ConnectedClient;
}

export interface CopilotPromptEvent {
  prompt: string;
  activeContext?: SelectedElementContext;
}

export interface ProposalHotInjectedEvent {
  patch: ProposalPatch;
  aBState: 'proposal';
  client?: ConnectedClient;
}

export interface ClientErrorEvent {
  clientId: string;
  error: Error;
}

export interface ABToggledEvent {
  state: 'current' | 'proposal';
}

export interface CopilotResponseChunk {
  text?: string;
  delta?: string;
  done?: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectedClient {
  id: string;
  socket: net.Socket;
  remoteAddress?: string;
  connectedAt: string;
  send(message: string | object): void;
  close(code?: number, reason?: string): void;
}

export interface WebSocketBridgeOptions {
  server?: http.Server;
  port?: number;
  host?: string;
  path?: string;
}

/**
 * VisualStudioWebSocketBridge manages a full-duplex bi-directional WebSocket connection
 * between the active Superconductor agent session and the browser visual studio interface.
 * Transmits React Fiber introspection context, spatial annotations, live prompts, and hot-injected proposals.
 */
export class VisualStudioWebSocketBridge extends EventEmitter {
  private server: http.Server | null = null;
  private isExternalServer = false;
  private listening = false;
  private port: number = 0;
  private configuredPort: number | undefined = undefined;
  private host: string = process.env.SUPERCONDUCTOR_HOST || '0.0.0.0';
  private path?: string;
  private clients: Map<string, ConnectedClient> = new Map();
  private boundUpgradeHandler = this.handleUpgrade.bind(this);

  // Cached latest context
  private lastSelectedElement: ElementSelectedEvent | null = null;
  private lastAnnotation: SpatialAnnotation | null = null;
  private lastCopilotPrompt: CopilotPromptEvent | null = null;

  constructor(options?: WebSocketBridgeOptions) {
    super();
    if (options) {
      if (options.server) {
        this.server = options.server;
        this.isExternalServer = true;
      }
      if (options.port !== undefined) this.configuredPort = options.port;
      if (options.host !== undefined) this.host = options.host;
      if (options.path !== undefined) this.path = options.path;
    }
  }

  /**
   * Starts listening for WebSocket client connections.
   */
  async start(options?: WebSocketBridgeOptions): Promise<{ port: number; url: string }> {
    if (this.listening && this.server) {
      return { port: this.port, url: this.getUrl()! };
    }

    if (options?.server) {
      this.server = options.server;
      this.isExternalServer = true;
    }
    if (options?.port !== undefined) {
      this.configuredPort = options.port;
    }
    if (options?.host !== undefined) {
      this.host = options.host;
    } else if (!this.host) {
      this.host = process.env.SUPERCONDUCTOR_HOST || '0.0.0.0';
    }
    if (options?.path !== undefined) this.path = options.path;

    const requestedPort = this.configuredPort !== undefined ? this.configuredPort : 4356;
    this.port = requestedPort;

    if (!this.server) {
      this.server = http.createServer((req, res) => {
        // Return 200 health-check for plain HTTP requests
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'superconductor-visual-studio-bridge-active', clients: this.clients.size }));
      });
      this.isExternalServer = false;
    }

    // Attach HTTP upgrade handler
    this.server.on('upgrade', this.boundUpgradeHandler);

    if (!this.isExternalServer) {
      await new Promise<void>((resolve, reject) => {
        this.server!.listen(this.port, this.host, () => {
          resolve();
        });
        this.server!.on('error', reject);
      });

      const address = this.server.address();
      if (typeof address === 'object' && address !== null) {
        this.port = address.port;
      }
    } else {
      const address = this.server.address();
      if (typeof address === 'object' && address !== null) {
        this.port = address.port;
      }
    }

    this.listening = true;
    this.emit('listening', { port: this.port, url: this.getUrl() });

    return { port: this.port, url: this.getUrl()! };
  }

  /**
   * Stops the WebSocket bridge and closes all active client connections.
   */
  async stop(): Promise<void> {
    if (!this.listening) return;

    // Disconnect all clients cleanly
    for (const client of Array.from(this.clients.values())) {
      try {
        client.close(1000, 'Server stopping');
      } catch {
        // Best effort
      }
    }
    this.clients.clear();

    if (this.server) {
      this.server.removeListener('upgrade', this.boundUpgradeHandler);
    }

    if (!this.isExternalServer && this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    this.listening = false;
    this.emit('close');
  }

  /**
   * Whether the bridge is currently listening for connections.
   */
  isListening(): boolean {
    return this.listening;
  }

  /**
   * Returns the active listening port or undefined.
   */
  getPort(): number | undefined {
    return this.listening ? this.port : undefined;
  }

  /**
   * Returns the bound host address or undefined.
   */
  getHost(): string | undefined {
    return this.listening ? this.host : undefined;
  }

  /**
   * Returns the full ws:// URL of the bridge.
   */
  getUrl(): string | undefined {
    if (!this.listening) return undefined;
    const pathPart = this.path ? (this.path.startsWith('/') ? this.path : `/${this.path}`) : '';
    const clientHost = (this.host === '0.0.0.0' || this.host === '::') ? '127.0.0.1' : this.host;
    return `ws://${clientHost}:${this.port}${pathPart}`;
  }

  /**
   * Returns the number of currently connected studio clients.
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Returns all connected clients.
   */
  getClients(): ConnectedClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Returns the most recent element selection received from the studio.
   */
  getLastSelectedElement(): ElementSelectedEvent | null {
    return this.lastSelectedElement ? { ...this.lastSelectedElement } : null;
  }

  /**
   * Returns the most recent spatial annotation received from the studio.
   */
  getLastAnnotation(): SpatialAnnotation | null {
    return this.lastAnnotation ? { ...this.lastAnnotation } : null;
  }

  /**
   * Returns the most recent copilot prompt received from the studio.
   */
  getLastCopilotPrompt(): CopilotPromptEvent | null {
    return this.lastCopilotPrompt ? { ...this.lastCopilotPrompt } : null;
  }

  /**
   * Outgoing: Broadcasts or sends hot-injected proposal patch to studio client(s).
   */
  sendProposalHotInjected(
    patch: ProposalPatch,
    aBState: 'proposal' = 'proposal',
    clientId?: string
  ): void {
    const validated = validateProposalPatch(patch);
    const payload = {
      type: 'proposal_hot_injected',
      patch: validated,
      aBState,
      payload: { patch: validated, aBState },
    };

    if (clientId) {
      this.sendTo(clientId, payload);
    } else {
      this.broadcast('proposal_hot_injected', payload);
    }

    this.emit('proposal_hot_injected', { patch: validated, aBState });
  }

  /**
   * Outgoing: Broadcasts or sends A/B toggle state change to studio client(s).
   */
  sendABToggled(state: 'current' | 'proposal', clientId?: string): void {
    const payload = {
      type: 'ab_toggled',
      state,
      payload: { state },
    };

    if (clientId) {
      this.sendTo(clientId, payload);
    } else {
      this.broadcast('ab_toggled', payload);
    }

    this.emit('ab_toggled', { state });
  }

  /**
   * Outgoing: Sends an agent copilot response chunk to studio client(s).
   */
  sendCopilotResponse(response: CopilotResponseChunk, clientId?: string): void {
    const payload = {
      type: 'copilot_response',
      ...response,
      payload: response,
    };

    if (clientId) {
      this.sendTo(clientId, payload);
    } else {
      this.broadcast('copilot_response', payload);
    }

    this.emit('copilot_response', response);
  }

  /**
   * Broadcasts a message to all connected clients.
   */
  broadcast(type: string, data: unknown): void {
    const message =
      typeof data === 'object' && data !== null && 'type' in (data as Record<string, unknown>)
        ? JSON.stringify(data)
        : JSON.stringify({ type, data });

    for (const client of this.clients.values()) {
      client.send(message);
    }
  }

  /**
   * Sends a message to a specific connected client.
   */
  sendTo(clientId: string, message: string | object): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;
    client.send(message);
    return true;
  }

  /**
   * Handles HTTP Upgrade request and initiates RFC 6455 WebSocket handshake.
   */
  private handleUpgrade(req: http.IncomingMessage, socket: net.Socket, _head: Buffer): void {
    const upgradeHeader = req.headers['upgrade'];
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    // Path matching if specified
    if (this.path) {
      const cleanPath = (req.url || '').split('?')[0];
      const expectedPath = this.path.startsWith('/') ? this.path : `/${this.path}`;
      if (cleanPath !== expectedPath) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    // Calculate accept token
    const acceptToken = crypto
      .createHash('sha1')
      .update(key + WS_GUID)
      .digest('base64');

    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptToken}`,
      '\r\n',
    ];

    socket.write(responseHeaders.join('\r\n'));

    // Client registration
    const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    socket.setNoDelay(true);
    socket.setKeepAlive(true);

    const client: ConnectedClient = {
      id: clientId,
      socket,
      remoteAddress: socket.remoteAddress,
      connectedAt: new Date().toISOString(),
      send: (msg: string | object) => {
        const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
        this.sendFrame(socket, text, 0x01);
      },
      close: (code = 1000, reason = '') => {
        this.sendCloseFrame(socket, code, reason);
        socket.end();
      },
    };

    this.clients.set(clientId, client);
    this.emit('client_connected', client);

    let buffer: Buffer = Buffer.alloc(0);

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      buffer = this.processFrames(buffer, client);
    });

    const cleanup = () => {
      if (this.clients.has(clientId)) {
        this.clients.delete(clientId);
        this.emit('client_disconnected', client);
      }
    };

    socket.on('close', cleanup);
    socket.on('end', cleanup);
    socket.on('error', (err) => {
      console.warn('[VisualStudioWebSocketBridge] Client socket error:', err);
      this.emit('client_error', { clientId, error: err });
      cleanup();
    });
  }

  /**
   * Processes buffered RFC 6455 WebSocket frames.
   */
  private processFrames(buffer: Buffer, client: ConnectedClient): Buffer {
    while (buffer.length >= 2) {
      const b0 = buffer[0];
      const opcode = b0 & 0x0f;
      const b1 = buffer[1];
      const masked = (b1 & 0x80) !== 0;
      let payloadLength = b1 & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (buffer.length < offset + 2) break;
        payloadLength = buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLength === 127) {
        if (buffer.length < offset + 8) break;
        const bigLen = buffer.readBigUInt64BE(offset);
        if (bigLen > BigInt(MAX_FRAME_PAYLOAD)) {
          this.sendCloseFrame(client.socket, 1009, 'Message Too Big');
          client.socket.end();
          client.socket.destroy();
          return Buffer.alloc(0);
        }
        payloadLength = Number(bigLen);
        offset += 8;
      }

      if (payloadLength > MAX_FRAME_PAYLOAD) {
        this.sendCloseFrame(client.socket, 1009, 'Message Too Big');
        client.socket.end();
        client.socket.destroy();
        return Buffer.alloc(0);
      }

      let maskKey: Buffer | null = null;
      if (masked) {
        if (buffer.length < offset + 4) break;
        maskKey = buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (buffer.length < offset + payloadLength) {
        // Incomplete payload, wait for next socket chunk
        break;
      }

      const rawPayload = buffer.subarray(offset, offset + payloadLength);
      buffer = buffer.subarray(offset + payloadLength);

      const payload = Buffer.alloc(payloadLength);
      if (masked && maskKey) {
        for (let i = 0; i < payloadLength; i++) {
          payload[i] = rawPayload[i] ^ maskKey[i % 4];
        }
      } else {
        rawPayload.copy(payload);
      }

      // Handle OpCodes
      if (opcode === 0x01) {
        // Text frame
        const text = payload.toString('utf-8');
        this.handleClientMessage(text, client);
      } else if (opcode === 0x08) {
        // Close frame
        this.sendCloseFrame(client.socket, 1000, 'Bye');
        client.socket.end();
      } else if (opcode === 0x09) {
        // Ping frame -> reply with Pong
        this.sendFrame(client.socket, payload, 0x0a);
      }
    }

    return buffer;
  }

  /**
   * Dispatches incoming client text message to registered listeners and context stores.
   */
  private handleClientMessage(raw: string, client: ConnectedClient): void {
    let message: any;
    try {
      message = JSON.parse(raw);
    } catch {
      this.emit('raw_message', raw, client);
      return;
    }

    this.emit('message', message, client);

    const type = message.type || message.event;
    const data = message.payload || message.data || message;

    switch (type) {
      case 'element_selected': {
        const eventData: ElementSelectedEvent = {
          selector: data.selector || message.selector || '',
          xpath: data.xpath || message.xpath,
          fiberSource: data.fiberSource || message.fiberSource,
        };
        this.lastSelectedElement = eventData;
        this.emit('element_selected', eventData, client);
        break;
      }

      case 'annotation_created': {
        try {
          const rawAnnotation = data.annotation || data;
          const validated = validateSpatialAnnotation(rawAnnotation);
          this.lastAnnotation = validated;
          this.emit('annotation_created', { annotation: validated, client }, client);
        } catch (err: unknown) {
          console.warn('[VisualStudioWebSocketBridge] Invalid annotation schema:', err);
          client.send(JSON.stringify({
            type: 'error',
            code: 'INVALID_ANNOTATION_SCHEMA',
            message: err instanceof Error ? err.message : 'Invalid annotation schema',
          }));
        }
        break;
      }

      case 'proposal_hot_injected':
      case 'proposal_patch': {
        try {
          const rawPatch = data.patch || data;
          const validated = validateProposalPatch(rawPatch);
          const aBState = data.aBState || message.aBState || 'proposal';
          this.emit(type, { patch: validated, aBState, client }, client);
        } catch (err: unknown) {
          console.warn('[VisualStudioWebSocketBridge] Invalid proposal patch schema:', err);
          client.send(JSON.stringify({
            type: 'error',
            code: 'INVALID_PROPOSAL_PATCH_SCHEMA',
            message: err instanceof Error ? err.message : 'Invalid proposal patch schema',
          }));
        }
        break;
      }

      case 'copilot_prompt': {
        const eventData: CopilotPromptEvent = {
          prompt: data.prompt || message.prompt || '',
          activeContext: data.activeContext || message.activeContext,
        };
        this.lastCopilotPrompt = eventData;
        this.emit('copilot_prompt', eventData, client);
        break;
      }

      default: {
        // Unknown or custom event
        if (type) {
          this.emit(type, data, client);
        }
        break;
      }
    }
  }

  /**
   * Sends an unmasked RFC 6455 WebSocket frame from server to client.
   */
  private sendFrame(socket: net.Socket, data: string | Buffer, opcode: number): void {
    if (socket.destroyed || !socket.writable) return;

    const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
    const length = payload.length;

    let header: Buffer;
    if (length <= 125) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = length;
    } else if (length <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    try {
      socket.write(Buffer.concat([header, payload]));
    } catch {
      // Socket write failure
    }
  }

  /**
   * Sends a close frame to the client.
   */
  private sendCloseFrame(socket: net.Socket, code = 1000, reason = ''): void {
    if (socket.destroyed || !socket.writable) return;
    const reasonBuf = Buffer.from(reason, 'utf-8');
    const payload = Buffer.alloc(2 + reasonBuf.length);
    payload.writeUInt16BE(code, 0);
    reasonBuf.copy(payload, 2);
    this.sendFrame(socket, payload, 0x08);
  }
}

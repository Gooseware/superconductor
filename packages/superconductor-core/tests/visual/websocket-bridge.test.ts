import * as http from 'http';
import * as net from 'net';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  VisualStudioWebSocketBridge,
  MAX_FRAME_PAYLOAD,
  type ElementSelectedEvent,
  type CopilotPromptEvent,
} from '../../src/visual/websocket-bridge.js';
import type { SpatialAnnotation, ProposalPatch } from '../../src/visual/surface-adapter.js';

describe('VisualStudioWebSocketBridge', () => {
  let bridge: VisualStudioWebSocketBridge;

  beforeEach(() => {
    bridge = new VisualStudioWebSocketBridge();
  });

  afterEach(async () => {
    if (bridge.isListening()) {
      await bridge.stop();
    }
  });

  describe('Lifecycle & Connectivity', () => {
    it('should start listening on an ephemeral port and report correct URL', async () => {
      const { port, url } = await bridge.start({ port: 0 });

      expect(port).toBeGreaterThan(0);
      expect(url).toBe(`ws://127.0.0.1:${port}`);
      expect(bridge.isListening()).toBe(true);
      expect(bridge.getPort()).toBe(port);
      expect(bridge.getHost()).toBe('0.0.0.0');
      expect(bridge.getClientCount()).toBe(0);
    });

    it('should support custom host configuration', async () => {
      const { port, url } = await bridge.start({ port: 0, host: '127.0.0.1' });

      expect(port).toBeGreaterThan(0);
      expect(url).toBe(`ws://127.0.0.1:${port}`);
      expect(bridge.getHost()).toBe('127.0.0.1');
    });

    it('should default to port 4356 and host 0.0.0.0 when options are omitted', async () => {
      const defaultBridge = new VisualStudioWebSocketBridge();
      try {
        const { port, url } = await defaultBridge.start();
        expect(port).toBe(4356);
        expect(url).toBe('ws://127.0.0.1:4356');
        expect(defaultBridge.getHost()).toBe('0.0.0.0');
      } finally {
        await defaultBridge.stop();
      }
    });

    it('should accept a client WebSocket connection and emit connection events', async () => {
      const { url } = await bridge.start({ port: 0 });

      const connectedPromise = new Promise<string>((resolve) => {
        bridge.once('client_connected', (client) => {
          resolve(client.id);
        });
      });

      const ws = new WebSocket(url);

      const clientId = await connectedPromise;
      expect(clientId).toBeDefined();
      expect(bridge.getClientCount()).toBe(1);

      const disconnectedPromise = new Promise<void>((resolve) => {
        bridge.once('client_disconnected', () => {
          resolve();
        });
      });

      ws.close();
      await disconnectedPromise;

      expect(bridge.getClientCount()).toBe(0);
    });

    it('should serve a health check JSON response over plain HTTP', async () => {
      const { port } = await bridge.start({ port: 0 });

      const res = await fetch(`http://127.0.0.1:${port}`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('superconductor-visual-studio-bridge-active');
    });

    it('should gracefully close all client connections when stopped', async () => {
      const { url } = await bridge.start({ port: 0 });

      const ws = new WebSocket(url);
      await new Promise<void>((resolve) => {
        ws.onopen = () => resolve();
      });

      expect(bridge.getClientCount()).toBe(1);

      const closePromise = new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });

      await bridge.stop();
      await closePromise;

      expect(bridge.isListening()).toBe(false);
      expect(bridge.getClientCount()).toBe(0);
    });

    it('should remove upgrade listener from external server when stopped (ADV-4)', async () => {
      const server = http.createServer();
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const initialCount = server.listenerCount('upgrade');

      const extBridge = new VisualStudioWebSocketBridge({ server });
      await extBridge.start();
      expect(server.listenerCount('upgrade')).toBe(initialCount + 1);

      await extBridge.stop();
      expect(server.listenerCount('upgrade')).toBe(initialCount);

      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
  });

  describe('Incoming Client Events', () => {
    it('should handle element_selected event with Fiber introspection source', async () => {
      const { url } = await bridge.start({ port: 0 });

      const ws = new WebSocket(url);
      await new Promise<void>((resolve) => {
        ws.onopen = () => resolve();
      });

      const selectedPromise = new Promise<ElementSelectedEvent>((resolve) => {
        bridge.once('element_selected', (data) => resolve(data));
      });

      const payload: ElementSelectedEvent = {
        selector: 'button#checkout-button',
        xpath: '/html/body/div[1]/button',
        fiberSource: {
          filePath: 'src/components/Checkout.tsx',
          lineNumber: 48,
          componentName: 'CheckoutButton',
        },
      };

      ws.send(JSON.stringify({ type: 'element_selected', payload }));

      const received = await selectedPromise;
      expect(received.selector).toBe('button#checkout-button');
      expect(received.xpath).toBe('/html/body/div[1]/button');
      expect(received.fiberSource?.filePath).toBe('src/components/Checkout.tsx');
      expect(received.fiberSource?.lineNumber).toBe(48);
      expect(received.fiberSource?.componentName).toBe('CheckoutButton');

      expect(bridge.getLastSelectedElement()).toEqual(received);

      ws.close();
    });

    it('should handle annotation_created event', async () => {
      const { url } = await bridge.start({ port: 0 });

      const ws = new WebSocket(url);
      await new Promise<void>((resolve) => {
        ws.onopen = () => resolve();
      });

      const annotationPromise = new Promise<{ annotation: SpatialAnnotation }>((resolve) => {
        bridge.once('annotation_created', (data) => resolve(data));
      });

      const annotation: SpatialAnnotation = {
        id: 'ann-1',
        viewId: 'view-card',
        type: 'pin',
        selector: '.card-title',
        geometry: { x: 120, y: 80 },
        author: 'designer',
        comment: 'Increase font contrast to meet WCAG AAA standards',
        tags: ['accessibility', 'typography'],
        severity: 'enhancement',
        createdAt: new Date().toISOString(),
      };

      ws.send(JSON.stringify({ type: 'annotation_created', annotation }));

      const received = await annotationPromise;
      expect(received.annotation.id).toBe('ann-1');
      expect(received.annotation.comment).toBe(
        'Increase font contrast to meet WCAG AAA standards'
      );
      expect(received.annotation.severity).toBe('enhancement');

      expect(bridge.getLastAnnotation()?.id).toBe('ann-1');

      ws.close();
    });

    it('should handle copilot_prompt event with selected context', async () => {
      const { url } = await bridge.start({ port: 0 });

      const ws = new WebSocket(url);
      await new Promise<void>((resolve) => {
        ws.onopen = () => resolve();
      });

      const promptPromise = new Promise<CopilotPromptEvent>((resolve) => {
        bridge.once('copilot_prompt', (data) => resolve(data));
      });

      const promptPayload: CopilotPromptEvent = {
        prompt: 'Convert this card to a glassmorphism style with backdrop blur',
        activeContext: {
          selector: '.hero-card',
          fiberSource: {
            filePath: 'src/HeroCard.tsx',
            lineNumber: 12,
            componentName: 'HeroCard',
          },
          boundingBox: { x: 50, y: 50, width: 300, height: 200 },
        },
      };

      ws.send(JSON.stringify({ type: 'copilot_prompt', ...promptPayload }));

      const received = await promptPromise;
      expect(received.prompt).toBe(
        'Convert this card to a glassmorphism style with backdrop blur'
      );
      expect(received.activeContext?.selector).toBe('.hero-card');
      expect(received.activeContext?.fiberSource?.filePath).toBe('src/HeroCard.tsx');

      expect(bridge.getLastCopilotPrompt()?.prompt).toBe(
        'Convert this card to a glassmorphism style with backdrop blur'
      );

      ws.close();
    });

    it('should gracefully handle non-JSON or raw text message without crashing', async () => {
      const { url } = await bridge.start({ port: 0 });

      const ws = new WebSocket(url);
      await new Promise<void>((resolve) => {
        ws.onopen = () => resolve();
      });

      const rawPromise = new Promise<string>((resolve) => {
        bridge.once('raw_message', (raw) => resolve(raw));
      });

      ws.send('non-json-test-string');

      const raw = await rawPromise;
      expect(raw).toBe('non-json-test-string');

      ws.close();
    });

    it('should reject malformed annotation_created payload and send INVALID_ANNOTATION_SCHEMA error (SEC-1 & ADV-3)', async () => {
      const { url } = await bridge.start({ port: 0 });

      const ws = new WebSocket(url);
      await new Promise<void>((resolve) => {
        ws.onopen = () => resolve();
      });

      let annotationEventFired = false;
      bridge.once('annotation_created', () => {
        annotationEventFired = true;
      });

      const errorResponsePromise = new Promise<any>((resolve) => {
        ws.onmessage = (event) => {
          resolve(JSON.parse(String(event.data)));
        };
      });

      // Malformed annotation missing required geometry and viewId
      ws.send(
        JSON.stringify({
          type: 'annotation_created',
          annotation: { id: 'bad-annotation', comment: 'Missing geometry and viewId' },
        })
      );

      const errResponse = await errorResponsePromise;
      expect(errResponse.type).toBe('error');
      expect(errResponse.code).toBe('INVALID_ANNOTATION_SCHEMA');
      expect(errResponse.message).toBeDefined();
      expect(annotationEventFired).toBe(false);
      expect(bridge.getLastAnnotation()).toBeNull();

      ws.close();
    });

    it('should reject malformed incoming proposal payload and send INVALID_PROPOSAL_PATCH_SCHEMA error (SEC-1 & ADV-3)', async () => {
      const { url } = await bridge.start({ port: 0 });

      const ws = new WebSocket(url);
      await new Promise<void>((resolve) => {
        ws.onopen = () => resolve();
      });

      const errorResponsePromise = new Promise<any>((resolve) => {
        ws.onmessage = (event) => {
          resolve(JSON.parse(String(event.data)));
        };
      });

      ws.send(
        JSON.stringify({
          type: 'proposal_hot_injected',
          patch: { title: 'Missing required id and targetFilePath' },
        })
      );

      const errResponse = await errorResponsePromise;
      expect(errResponse.type).toBe('error');
      expect(errResponse.code).toBe('INVALID_PROPOSAL_PATCH_SCHEMA');
      expect(errResponse.message).toBeDefined();

      ws.close();
    });
  });

  describe('Outgoing Server Events', () => {
    it('should broadcast proposal_hot_injected to client', async () => {
      const { url } = await bridge.start({ port: 0 });

      const ws = new WebSocket(url);
      await new Promise<void>((resolve) => {
        ws.onopen = () => resolve();
      });

      const messagePromise = new Promise<any>((resolve) => {
        ws.onmessage = (event) => {
          resolve(JSON.parse(String(event.data)));
        };
      });

      const patch: ProposalPatch = {
        id: 'patch-broadcast-1',
        title: 'Hot Injected Proposal',
        targetFilePath: '/src/Header.tsx',
        cssDelta: 'header { backdrop-filter: blur(10px); }',
      };

      bridge.sendProposalHotInjected(patch, 'proposal');

      const received = await messagePromise;
      expect(received.type).toBe('proposal_hot_injected');
      expect(received.patch.id).toBe('patch-broadcast-1');
      expect(received.aBState).toBe('proposal');

      ws.close();
    });

    it('should send ab_toggled event to client', async () => {
      const { url } = await bridge.start({ port: 0 });

      const ws = new WebSocket(url);
      await new Promise<void>((resolve) => {
        ws.onopen = () => resolve();
      });

      const messagePromise = new Promise<any>((resolve) => {
        ws.onmessage = (event) => {
          resolve(JSON.parse(String(event.data)));
        };
      });

      bridge.sendABToggled('current');

      const received = await messagePromise;
      expect(received.type).toBe('ab_toggled');
      expect(received.state).toBe('current');

      ws.close();
    });

    it('should stream copilot_response chunks to client', async () => {
      const { url } = await bridge.start({ port: 0 });

      const ws = new WebSocket(url);
      await new Promise<void>((resolve) => {
        ws.onopen = () => resolve();
      });

      const receivedChunks: any[] = [];
      const donePromise = new Promise<void>((resolve) => {
        ws.onmessage = (event) => {
          const data = JSON.parse(String(event.data));
          receivedChunks.push(data);
          if (data.done) {
            resolve();
          }
        };
      });

      bridge.sendCopilotResponse({ delta: 'Analyzing React component...', done: false });
      bridge.sendCopilotResponse({ delta: ' Synthesizing CSS patch...', done: false });
      bridge.sendCopilotResponse({ text: 'Complete.', done: true });

      await donePromise;

      expect(receivedChunks.length).toBe(3);
      expect(receivedChunks[0].type).toBe('copilot_response');
      expect(receivedChunks[0].delta).toBe('Analyzing React component...');
      expect(receivedChunks[1].delta).toBe(' Synthesizing CSS patch...');
      expect(receivedChunks[2].done).toBe(true);

      ws.close();
    });

    it('should handle large payloads spanning 16-bit and 64-bit frame headers', async () => {
      const { url } = await bridge.start({ port: 0 });

      const ws = new WebSocket(url);
      await new Promise<void>((resolve) => {
        ws.onopen = () => resolve();
      });

      const messagePromise = new Promise<any>((resolve) => {
        ws.onmessage = (event) => {
          resolve(JSON.parse(String(event.data)));
        };
      });

      // Generate a >1000 character CSS delta requiring extended framing
      const largeCss = '.large-rule { ' + 'content: "x"; '.repeat(300) + '}';
      const patch: ProposalPatch = {
        id: 'patch-large',
        title: 'Large CSS Rule Patch',
        targetFilePath: '/src/Big.tsx',
        cssDelta: largeCss,
      };

      bridge.sendProposalHotInjected(patch, 'proposal');

      const received = await messagePromise;
      expect(received.type).toBe('proposal_hot_injected');
      expect(received.patch.cssDelta).toBe(largeCss);

      ws.close();
    });

    it('should validate and throw on invalid outgoing proposal patch (SEC-1 & ADV-3)', () => {
      expect(() => {
        bridge.sendProposalHotInjected({ id: 'bad-patch' } as any);
      }).toThrow();
    });
  });

  describe('Security & Framing (SEC-2 & ADV-5)', () => {
    it('should reject frames declaring payload larger than MAX_FRAME_PAYLOAD (5MB) with 1009 code (SEC-2)', async () => {
      const { port } = await bridge.start({ port: 0 });

      const socket = net.connect(port, '127.0.0.1');
      await new Promise<void>((resolve) => socket.once('connect', () => resolve()));

      // Send WebSocket handshake request
      const handshake = [
        'GET / HTTP/1.1',
        `Host: 127.0.0.1:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13',
        '\r\n',
      ].join('\r\n');

      socket.write(handshake);

      await new Promise<void>((resolve) => {
        socket.once('data', (data) => {
          expect(data.toString()).toContain('101 Switching Protocols');
          resolve();
        });
      });

      // Construct a frame declaring 6MB payload (exceeding 5MB cap)
      // Header: 2 bytes (fin+opcode, mask+127) + 8 bytes (64-bit length) + 4 bytes (mask) = 14 bytes
      const frameHeader = Buffer.alloc(14);
      frameHeader[0] = 0x81; // FIN + text opcode (0x01)
      frameHeader[1] = 0x80 | 127; // Masked (0x80) + 127 (64-bit length)
      const oversizedLength = BigInt(MAX_FRAME_PAYLOAD + 1024 * 1024); // 6MB
      frameHeader.writeBigUInt64BE(oversizedLength, 2);
      frameHeader.fill(0, 10, 14); // 4-byte mask key: 0x00000000

      const closeOrEndPromise = new Promise<{ closed: boolean; closeCode?: number }>((resolve) => {
        let closeCode: number | undefined;
        socket.on('data', (chunk) => {
          if (chunk.length >= 4 && (chunk[0] & 0x0f) === 0x08) {
            closeCode = chunk.readUInt16BE(2);
          }
        });
        socket.on('close', () => {
          resolve({ closed: true, closeCode });
        });
      });

      socket.write(frameHeader);

      const result = await closeOrEndPromise;
      expect(result.closed).toBe(true);
      if (result.closeCode) {
        expect(result.closeCode).toBe(1009); // RFC 6455 Message Too Big
      }
      expect(bridge.getClientCount()).toBe(0);
    });

    it('should emit client_error on socket error and cleanup client without swallowing (ADV-5)', async () => {
      const { url } = await bridge.start({ port: 0 });

      const ws = new WebSocket(url);
      await new Promise<void>((resolve) => {
        ws.onopen = () => resolve();
      });

      const clients = bridge.getClients();
      expect(clients.length).toBe(1);
      const targetClient = clients[0];

      const errorPromise = new Promise<{ clientId: string; error: Error }>((resolve) => {
        bridge.once('client_error', (data) => resolve(data));
      });

      const simulatedError = new Error('ECONNRESET: simulated connection reset');
      targetClient.socket.emit('error', simulatedError);

      const received = await errorPromise;
      expect(received.clientId).toBe(targetClient.id);
      expect(received.error.message).toBe('ECONNRESET: simulated connection reset');
      expect(bridge.getClientCount()).toBe(0);

      ws.close();
    });
  });
});

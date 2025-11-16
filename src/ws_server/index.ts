import { type WebSocket, WebSocketServer } from 'ws';
import { handleMessage } from '../ws_handlers/index';
import { handleClientDisconnect } from './helpers/index';

const PORT = 3000;

export const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    console.log(`Received message: ${message}`);

    try {
      const msg = JSON.parse(message.toString());
      handleMessage(ws, msg);
    } catch {
      console.log('Invalid WS message json');
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    handleClientDisconnect(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

console.log(`WebSocket server started on port ${PORT}`);

process.on('SIGINT', () => {
  console.log('Shutting down WebSocket server');
  wss.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
});

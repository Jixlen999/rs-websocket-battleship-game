import { WebSocketServer } from 'ws';
import { handleMessage } from '../handlers/index';

const PORT = 3000;

export const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
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
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

console.log(`WebSocket server started on port ${PORT}`);

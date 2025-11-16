import { WebSocket } from 'ws';

import type { WSMessage } from '../types/index';
import {
  handleAddShips,
  handleAddUserToRoom,
  handleAttack,
  handleCreateRoom,
  handleRandomAttack,
  handleReg,
} from './messageHandlers';

export const handleMessage = (ws: WebSocket, msg: WSMessage) => {
  switch (msg.type) {
    case 'reg':
      handleReg(ws, msg);
      break;
    case 'create_room':
      handleCreateRoom(ws);
      break;
    case 'add_user_to_room':
      handleAddUserToRoom(ws, msg);
      break;
    case 'add_ships':
      handleAddShips(msg);
      break;
    case 'attack':
      handleAttack(msg);
      break;
    case 'randomAttack':
      handleRandomAttack(msg);
      break;
  }
};

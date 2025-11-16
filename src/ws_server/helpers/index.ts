import { WebSocket } from 'ws';

import {
  findGameIdByPlayerId,
  finishGame,
  updateRoomsForAll,
} from '../../ws_handlers/helpers';
import { activeRooms, games, sessions } from '../../inmemory_DB/index';

export const handleClientDisconnect = (ws: WebSocket) => {
  const playerId = sessions.get(ws);
  if (!playerId) return;

  sessions.delete(ws);

  for (const [roomId, players] of activeRooms.entries()) {
    const index = players.indexOf(playerId);
    if (index !== -1) {
      players.splice(index, 1);

      if (players.length === 1) {
        const remainingPlayerId = players[0];
        const gameId = findGameIdByPlayerId(remainingPlayerId);

        if (gameId) {
          finishGame(gameId, remainingPlayerId);
        }
      }

      if (players.length === 0) {
        activeRooms.delete(roomId);
      }

      updateRoomsForAll();
    }
  }

  const gameId = findGameIdByPlayerId(playerId);
  if (gameId) {
    finishGame(gameId, getOpponentId(gameId, playerId));
  }
};

const getOpponentId = (gameId: string, playerId: string) => {
  const game = games.get(gameId);
  if (!game) return;
  return game.players.find((player) => player !== playerId);
};

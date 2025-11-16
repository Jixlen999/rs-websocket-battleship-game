import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';

import {
  activeRooms,
  games,
  loggedInUsers,
  sessions,
  users,
} from '../inmemory_DB/index';
import type { Ship, WSMessage } from '../types/index';
import {
  attack,
  createGameForBoth,
  findWsByPlayerId,
  send,
  updateRoomsForAll,
  updateTurn,
  updateWinnersForAll,
} from './helpers';

export const handleReg = (ws: WebSocket, msg: WSMessage) => {
  const { name, password } = JSON.parse(msg.data);

  if (loggedInUsers.has(name)) {
    const playerId = loggedInUsers.get(name) || '';
    const user = users.get(playerId);
    const currentUserPasswordHash = createHash('sha256')
      .update(user?.salt + password)
      .digest('hex');

    if (currentUserPasswordHash === user?.passwordHash) {
      sessions.set(ws, playerId);

      send(ws, {
        type: 'reg',
        data: JSON.stringify({
          name,
          index: playerId,
          error: false,
          errorText: '',
        }),
        id: 0,
      });

      updateRoomsForAll();
      updateWinnersForAll();

      return;
    } else {
      send(ws, {
        type: 'reg',
        data: JSON.stringify({
          name,
          index: '',
          error: true,
          errorText: 'wrong password',
        }),
        id: 0,
      });
      return;
    }
  } else {
    const salt = randomBytes(16).toString('hex');
    const passwordHash = createHash('sha256')
      .update(salt + password)
      .digest('hex');

    const newUser = { name, passwordHash, salt, wins: 0 };
    const id = randomUUID();

    users.set(id, newUser);
    loggedInUsers.set(name, id);
    sessions.set(ws, id);

    send(ws, {
      type: 'reg',
      data: JSON.stringify({
        name,
        index: id,
        error: false,
        errorText: '',
      }),
      id: 0,
    });

    updateRoomsForAll();
    updateWinnersForAll();
  }
};

export const handleCreateRoom = (ws: WebSocket) => {
  const playerId = sessions.get(ws);
  if (!playerId) return;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const existingRoom = Array.from(activeRooms.entries()).find(([_, players]) =>
    players.includes(playerId),
  );

  if (existingRoom) {
    return;
  }

  const roomId = randomUUID();
  activeRooms.set(roomId, [playerId]);

  updateRoomsForAll();
};

export const handleAddUserToRoom = (ws: WebSocket, msg: WSMessage) => {
  const { indexRoom } = JSON.parse(msg.data);
  const playerId = sessions.get(ws);
  if (!playerId) return;

  const playersInRoom = activeRooms.get(indexRoom);
  if (!playersInRoom) return;
  if (playersInRoom[0] === playerId) return;

  playersInRoom.push(playerId);

  playersInRoom.forEach((player) => {
    for (const [roomId, roomPlayers] of activeRooms.entries()) {
      if (roomPlayers.includes(player)) {
        activeRooms.delete(roomId);
      }
    }
  });

  createGameForBoth(playersInRoom);
  updateRoomsForAll();
};

export const handleAddShips = (msg: WSMessage) => {
  const { gameId, ships, indexPlayer } = JSON.parse(msg.data);
  const game = games.get(gameId);

  const shipsWithHits = ships.map((ship: Ship) => ({
    ...ship,
    hits: 0,
  }));

  game?.ships.set(indexPlayer, shipsWithHits);
  game?.ready.add(indexPlayer);

  if (game?.ready.size === 2) {
    game?.players.forEach((playerId) => {
      const playerWs = findWsByPlayerId(playerId);

      if (playerWs) {
        send(playerWs, {
          type: 'start_game',
          data: JSON.stringify({
            ships: game.ships.get(playerId),
            currentPlayerIndex: game.currentPlayer,
          }),
          id: 0,
        });
      }
    });

    updateTurn(game);
  }
};

export const handleAttack = (msg: WSMessage) => {
  const { gameId, x, y, indexPlayer } = JSON.parse(msg.data);

  attack(gameId, x, y, indexPlayer);
};

export const handleRandomAttack = (msg: WSMessage) => {
  const { gameId, indexPlayer } = JSON.parse(msg.data);
  const randomX = Math.floor(Math.random() * 10) + 1;
  const randomY = Math.floor(Math.random() * 10) + 1;

  attack(gameId, randomX, randomY, indexPlayer);
};

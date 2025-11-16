import { randomUUID } from 'crypto';
import { WebSocket } from 'ws';

import { activeRooms, games, sessions, users } from '../inmemory_DB/index';
import type { WSMessage, Ship, GameSession } from '../types/index';
import { wss } from '../ws_server/index';

export const send = (ws: WebSocket, msg: WSMessage) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    console.log('Sent response:', JSON.stringify(msg));
  }
};

export const createGameForBoth = (players: string[]) => {
  const gameId = randomUUID();

  players.forEach((playerId) => {
    wss.clients.forEach((client) => {
      if (sessions.get(client) === playerId) {
        send(client, {
          type: 'create_game',
          data: JSON.stringify({
            idGame: gameId,
            idPlayer: playerId,
          }),
          id: 0,
        });
      }
    });
  });

  games.set(gameId, {
    players,
    ships: new Map(),
    ready: new Set(),
    currentPlayer: Math.random() < 0.5 ? players[0] : players[1],
    shots: new Map(players.map((player) => [player, []])),
  });
};

export const finishGame = (gameId: string, winnerId?: string) => {
  const game = games.get(gameId);
  if (!game) return;

  game.players.forEach((playerId) => {
    const ws = findWsByPlayerId(playerId);
    if (ws) {
      send(ws, {
        type: 'finish',
        data: JSON.stringify({ winPlayer: winnerId || null }),
        id: 0,
      });
    }
  });

  if (winnerId) {
    const user = users.get(winnerId);
    if (user) user.wins++;
    updateWinnersForAll();
  }

  games.delete(gameId);
};

export const findGameIdByPlayerId = (playerId: string): string | undefined => {
  for (const [gameId, game] of games.entries()) {
    if (game.players.includes(playerId)) {
      return gameId;
    }
  }
  return undefined;
};

export const findWsByPlayerId = (playerId: string) => {
  return Array.from(sessions.entries()).find(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ([ws, id]) => playerId === id,
  )?.[0];
};

export const shipContainsPoint = (ship: Ship, x: number, y: number) => {
  for (let i = 0; i < ship.length; i++) {
    const shipX = !ship.direction ? ship.position.x + i : ship.position.x;
    const shipY = !ship.direction ? ship.position.y : ship.position.y + i;

    if (shipX === x && shipY === y) return true;
  }

  return false;
};

export const updateTurn = (game: GameSession, nextCurrentPlayerId?: string) => {
  if (nextCurrentPlayerId) game.currentPlayer = nextCurrentPlayerId;

  game?.players.forEach((playerId) => {
    const playerWs = findWsByPlayerId(playerId);
    if (!playerWs) return;

    send(playerWs, {
      type: 'turn',
      data: JSON.stringify({
        currentPlayer: game?.currentPlayer,
      }),
      id: 0,
    });
  });
};

export const updateRoomsForAll = () => {
  const rooms = Array.from(activeRooms.entries())
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .filter(([_, players]) => players.length === 1)
    .map(([roomId, players]) => {
      const playerId = players[0];
      const playerName = users.get(playerId)?.name;

      return {
        roomId,
        roomUsers: [
          {
            name: playerName,
            index: playerId,
          },
        ],
      };
    });

  wss.clients.forEach((client) => {
    send(client, {
      type: 'update_room',
      data: JSON.stringify(rooms),
      id: 0,
    });
  });
};

export const updateWinnersForAll = () => {
  const winners = JSON.stringify(
    Array.from(users.values()).map((user) => ({
      name: user.name,
      wins: user.wins,
    })),
  );

  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: 'update_winners',
          data: winners,
          id: 0,
        }),
      );
    }
  });
};

export const attack = (
  gameId: string,
  x: number,
  y: number,
  indexPlayer: string,
) => {
  const currentGame = games.get(gameId);
  if (!currentGame) return;

  if (currentGame.currentPlayer !== indexPlayer) {
    return;
  }

  const enemyPlayer = currentGame?.players.find(
    (player) => player !== indexPlayer,
  );

  if (!enemyPlayer) return;

  const enemyShips = currentGame?.ships.get(enemyPlayer);
  const enemyShipHit = enemyShips?.find((ship) =>
    shipContainsPoint(ship, x, y),
  );

  const playerShots = currentGame.shots.get(indexPlayer) || [];
  const alreadyHit = playerShots?.some((cell) => cell.x === x && cell.y === y);

  if (alreadyHit) return;

  playerShots.push({ x, y });
  currentGame.shots.set(indexPlayer, playerShots);

  if (enemyShipHit) {
    enemyShipHit.hits++;

    const status =
      enemyShipHit.hits === enemyShipHit.length ? 'killed' : 'shot';

    currentGame.players.forEach((player) => {
      const currentPlayerWs = findWsByPlayerId(player);
      if (!currentPlayerWs) return;

      send(currentPlayerWs, {
        type: 'attack',
        data: JSON.stringify({
          position: {
            x,
            y,
          },
          currentPlayer: indexPlayer,
          status,
        }),
        id: 0,
      });
    });
  }

  if (!enemyShipHit) {
    currentGame.players.forEach((player) => {
      const currentPlayerWs = findWsByPlayerId(player);
      if (!currentPlayerWs) return;

      send(currentPlayerWs, {
        type: 'attack',
        data: JSON.stringify({
          position: {
            x,
            y,
          },
          currentPlayer: indexPlayer,
          status: 'miss',
        }),
        id: 0,
      });
    });
  }

  if (!enemyShipHit) {
    updateTurn(currentGame, enemyPlayer);
  } else {
    if (!enemyShips?.some((ship) => ship.hits !== ship.length)) {
      currentGame?.players.forEach((playerId) => {
        const playerWs = findWsByPlayerId(playerId);
        if (!playerWs) return;

        send(playerWs, {
          type: 'finish',
          data: JSON.stringify({
            winPlayer: indexPlayer,
          }),
          id: 0,
        });
      });
      const winner = users.get(indexPlayer);
      if (!winner) return;

      winner.wins++;
      updateWinnersForAll();
    } else {
      updateTurn(currentGame, indexPlayer);
    }
  }
};

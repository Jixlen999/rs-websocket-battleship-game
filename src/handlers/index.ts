import { WebSocket } from 'ws';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { wss } from '../ws_server/index';

type User = {
  name: string;
  passwordHash: string;
  salt: string; // unique for every user, used to create safer hash
  wins: number;
};

type WSMessage = {
  type: string;
  data: string;
  id: number;
};

type Ship = {
  position: {
    x: number;
    y: number;
  };
  direction: boolean; // true - vertical, false - horizontal
  length: number;
  type: 'small' | 'medium' | 'large' | 'huge';
  hits: number;
};

type GameSession = {
  players: string[]; // players' Ids
  ships: Map<string, Ship[]>; // playerId, Ships[]
  ready: Set<string>; // plyers who sent add_ships
  currentPlayer: string; // who's turn
  shots: Map<string, { x: number; y: number }[]>; // splayerId, shotXY
};

const users = new Map<string, User>(); // id, User
const sessions = new Map<WebSocket, string>(); // unique ws, playerId
const loggedInUsers = new Map<string, string>(); // name, playerId
const activeRooms = new Map<string, string[]>(); // roomId, playerId[]
const games = new Map<string, GameSession>(); // gameId, session

function send(ws: WebSocket, msg: WSMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export const handleMessage = (ws: WebSocket, msg: WSMessage) => {
  switch (msg.type) {
    case 'reg':
      handleReg(ws, msg);
      break;
    case 'create_room':
      handleCreateRoom(ws, msg);
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

const handleReg = (ws: WebSocket, msg: WSMessage) => {
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

const handleCreateRoom = (ws: WebSocket, msg: WSMessage) => {
  const playerId = sessions.get(ws);
  if (!playerId) return;

  const roomId = randomUUID();
  activeRooms.set(roomId, [playerId]);

  updateRoomsForAll();
};

const handleAddUserToRoom = (ws: WebSocket, msg: WSMessage) => {
  const { indexRoom } = JSON.parse(msg.data);
  const playerId = sessions.get(ws);
  if (!playerId) return;

  const playersInRoom = activeRooms.get(indexRoom);
  if (!playersInRoom) return;

  playersInRoom.push(playerId);
  activeRooms.delete(indexRoom);

  createGameForBoth(playersInRoom);
  updateRoomsForAll();
};

const createGameForBoth = (players: string[]) => {
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

const handleAddShips = (msg: WSMessage) => {
  const { gameId, ships, indexPlayer } = JSON.parse(msg.data);
  const game = games.get(gameId);

  const shipsWithHits = ships.map((ship: Ship) => ({
    ...ship,
    hits: 0,
    hitCells: [],
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

const handleAttack = (msg: WSMessage) => {
  const { gameId, x, y, indexPlayer } = JSON.parse(msg.data);

  attack(gameId, x, y, indexPlayer);
};

const handleRandomAttack = (msg: WSMessage) => {
  const { gameId, indexPlayer } = JSON.parse(msg.data);
  const randomX = Math.floor(Math.random() * 10) + 1;
  const randomY = Math.floor(Math.random() * 10) + 1;

  attack(gameId, randomX, randomY, indexPlayer);
};

const attack = (gameId: string, x: number, y: number, indexPlayer: string) => {
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

const findWsByPlayerId = (playerId: string) => {
  return Array.from(sessions.entries()).find(
    ([ws, id]) => playerId === id,
  )?.[0];
};

const shipContainsPoint = (ship: Ship, x: number, y: number) => {
  for (let i = 0; i < ship.length; i++) {
    const shipX = !ship.direction ? ship.position.x + i : ship.position.x;
    const shipY = !ship.direction ? ship.position.y : ship.position.y + i;

    if (shipX === x && shipY === y) return true;
  }

  return false;
};

const updateTurn = (game: GameSession, nextCurrentPlayerId?: string) => {
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

const updateRoomsForAll = () => {
  const rooms = Array.from(activeRooms.entries())
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

const updateWinnersForAll = () => {
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

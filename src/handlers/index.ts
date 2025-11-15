import { WebSocket } from 'ws';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { wss } from '../ws_server/index';

type User = {
  name: string;
  passwordHash: string;
  salt: string; // уникальная для каждого пользователя, используется, чтобы более безопасно захешировать пароль
  wins: number;
};

type WSMessage = {
  type: string;
  data: string;
  id: number;
};

const users = new Map<string, User>(); // id, User
const sessions = new Map<WebSocket, string>(); // unique ws, playerId
const loggedInUsers = new Map<string, string>(); // name, playerId
const activeRooms = new Map<string, string[]>(); // roomId, playerId[]

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
      return send(ws, {
        type: 'reg',
        data: JSON.stringify({
          name,
          index: playerId,
          error: false,
          errorText: '',
        }),
        id: 0,
      });
    } else {
      updateRoomsForAll();
      updateWinnersForAll();

      return send(ws, {
        type: 'reg',
        data: JSON.stringify({
          name,
          index: '',
          error: true,
          errorText: 'wrong password',
        }),
        id: 0,
      });
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

  const name = users.get(playerId)?.name;

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

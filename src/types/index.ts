export type User = {
  name: string;
  passwordHash: string;
  salt: string; // unique for every user, used to create safer hash
  wins: number;
};

export type WSMessage = {
  type: string;
  data: string;
  id: number;
};

export type Ship = {
  position: {
    x: number;
    y: number;
  };
  direction: boolean; // true - vertical, false - horizontal
  length: number;
  type: 'small' | 'medium' | 'large' | 'huge';
  hits: number;
};

export type GameSession = {
  players: string[]; // players' Ids
  ships: Map<string, Ship[]>; // playerId, Ships[]
  ready: Set<string>; // plyers who sent add_ships
  currentPlayer: string; // who's turn
  shots: Map<string, { x: number; y: number }[]>; // playerId, shotXY
};

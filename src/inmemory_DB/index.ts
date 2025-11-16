import { WebSocket } from 'ws';
import type { GameSession, User } from '../types/index';

export const users = new Map<string, User>(); // id, User
export const sessions = new Map<WebSocket, string>(); // unique ws, playerId
export const loggedInUsers = new Map<string, string>(); // name, playerId
export const activeRooms = new Map<string, string[]>(); // roomId, playerId[]
export const games = new Map<string, GameSession>(); // gameId, session

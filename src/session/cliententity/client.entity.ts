import { Socket } from 'socket.io';

export class ClientEntity {
    nickname: string;
    roomId: number;
    gameType: string;
    roles: string;
    clientSocket: Socket | null = null;
}

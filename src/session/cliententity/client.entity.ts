export class ClientEntity {
    nickname: string;
    roomId: number;
    gameType: string;
    roles: string;
    clientSocket = null;
}
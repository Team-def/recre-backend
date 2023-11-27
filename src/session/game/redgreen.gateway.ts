import {
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { RedGreenService } from './redgreen.service';
import { SessionGuard } from '../session.guard';
import { SocketExtension } from '../socket.extension';

@WebSocketGateway({
    namespace: 'redgreen',
    transports: ['websocket'],
    pingInterval: 3000,
    pingTimeout: 10000,
    cookie: false,
    serveClient: false,
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 1000,
})
export class RedGreenGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private uuidToSocket = new Map<string, Socket>();

    constructor(private readonly redgreenService: RedGreenService) {}

    handleDisconnect(client: Socket) {
        throw new Error('Method not implemented.');
    }
    handleConnection(client: Socket) {
        throw new Error('Method not implemented.');
    }

    /**
     * host ⟶ server ⟶ host 방 생성 로직
     *
     * @param client host
     * @param payload RedGreenEntity
     * @returns ack for host
     */
    @UseGuards(SessionGuard)
    @SubscribeMessage('make_room')
    async makeRoomRedGreen(
        client: SocketExtension,
        payload: {
            game_type: string;
            user_num: number;
            goalDistance: number;
            winnerNum: number;
        },
    ) {}

    @SubscribeMessage('ready')
    async ready(client: Socket, payload: any) {
        throw new Error('Method not implemented.');
    }

    @SubscribeMessage('leave')
    async leave(client: Socket, payload: any) {
        throw new Error('Method not implemented.');
    }

    @SubscribeMessage('start_game')
    async startGame(client: Socket, payload: any) {
        throw new Error('Method not implemented.');
    }

    @SubscribeMessage('im_ready')
    async imReady(client: Socket, payload: any) {
        throw new Error('Method not implemented.');
    }

    @SubscribeMessage('run')
    async run(client: Socket, payload: any) {
        throw new Error('Method not implemented.');
    }

    @SubscribeMessage('stop')
    async stop(client: Socket, payload: any) {
        throw new Error('Method not implemented.');
    }

    /**
     * 게임진행중 호스트가 마우스를 뗐을때 날아가는 요청
     * @param client host
     * @param payload
     */
    @SubscribeMessage('resume')
    async stop(client: Socket, payload: any) {
        throw new Error('Method not implemented.');
    }

    @SubscribeMessage('youdie')
    async youdie(client: Socket, payload: any) {
        throw new Error('Method not implemented.');
    }

    @SubscribeMessage('touchdown')
    async touchdown(client: Socket, payload: any) {
        throw new Error('Method not implemented.');
    }

    /**
     * host가 명시적으로 게임을 종료
     * @param client host
     * @param payload
     */
    @SubscribeMessage('end_game')
    async endGame(client: Socket, payload: any) {
        throw new Error('Method not implemented.');
    }
}

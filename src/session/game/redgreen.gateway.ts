import {
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
} from '@nestjs/websockets';
import { SessionGateway } from '../session.gateway';
import { Socket } from 'socket.io';
import { User } from 'src/user/entities/user.entity';
import { Logger, UseGuards } from '@nestjs/common';
import { RedGreenService } from './redgreen.service';
import { RedGreenEntity } from './redgreen.entity';
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
export class RedGreenGateway extends SessionGateway {
    private readonly redgreenRooms: Map<number, RedGreenEntity> = new Map();

    constructor(private readonly redgreenService: RedGreenService) {
        super();
    }

    /**
     * host ⟶ server ⟶ host 방 생성 로직
     *
     * @param client host
     * @param payload RedGreenEntity
     * @returns ack for host
     */
    @UseGuards(SessionGuard)
    @SubscribeMessage('make_room_redgreen')
    async makeRoomRedGreen(
        client: SocketExtension,
        payload: {
            game_type: string;
            user_num: number;
            goalDistance: number;
            winnerNum: number;
        },
    ) {
        const { game_type, user_num, goalDistance, winnerNum } = payload;
        const clientEntity = this.uuidToclientEntity.get(client.uuId);
        const hostInfo = client.hostInfo;
        this.clientsLastActivity.set(client.uuId, { lastActivity: Date.now() });

        Logger.log({
            host_name: hostInfo.nickname,
            roomId: hostInfo.id,
            game_type,
            user_num,
            goalDistance,
            winnerNum,
        });

        // this.redgreenService.makeRoomHandler(); /// TODO: redgreen.service로 아래의 코드를 옮기기

        if (this.roomIdToHostId.has(hostInfo.id)) {
            /// TODO destroyRedGreenRoom
        }

        clientEntity.roomId = hostInfo.id;
        clientEntity.gameType = game_type;
        clientEntity.roles = 'host';

        // 무궁화 세션 생성
        const redgreenRoom = new RedGreenEntity(
            hostInfo.id,
            hostInfo.nickname,
            goalDistance,
            user_num,
            0,
            0,
            winnerNum,
        );
        Logger.log(`redgreenRoom 방 생성 완료`);

        // 무궁화 세션을 방 목록에 추가
        this.redgreenRooms.set(hostInfo.id, redgreenRoom);
        // 게임 진행중인 호스트 정보 등록
        this.roomIdToHostId.set(hostInfo.id, client.uuId);
        // 플레이어 리스트 세트 생성
        this.roomidToPlayerSet.set(hostInfo.id, new Set<string>());

        return {
            result: true,
            message: '방 생성 완료',
        };
    }

    @SubscribeMessage('ready_redgreen')
    async ready(client: Socket, payload: any) {
        // this.readyHandler(client, payload);
    }

    @SubscribeMessage('leave_readgreen')
    async leave(client: Socket, payload: any) {
        // this.leaveHandler(client, payload);
    }

    @SubscribeMessage('start_redgreen')
    async start(client: Socket, payload: any) {
        // this.startHandler(client, payload);
    }

    @SubscribeMessage('im_ready_redgreen')
    async imReady(client: Socket, payload: any) {
        // this.imReadyHandler(client, payload);
    }

    @SubscribeMessage('run')
    async run(client: Socket, payload: any) {
        // this.runHandler(client, payload);
    }

    @SubscribeMessage('stop')
    async stop(client: Socket, payload: any) {
        // this.stopHandler(client, payload);
    }

    @SubscribeMessage('youdie')
    async youdie(client: Socket, payload: any) {
        // this.youdieHandler(client, payload);
    }

    @SubscribeMessage('touchdown')
    async touchdown(client: Socket, payload: any) {
        // this.touchdownHandler(client, payload);
    }

    @SubscribeMessage('stop_redgreen')
    async stopGame(client: Socket, payload: any) {
        // this.stopGameHandler(client, payload);
    }

    @SubscribeMessage('end_redgreen')
    async endGame(client: Socket, payload: any) {
        // this.endGameHandler(client, payload);
    }
}

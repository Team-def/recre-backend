import {
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { RedGreenService } from './redgreen.service';
import { SessionGuard } from './session.guard';
import { SocketExtension } from './socket.extension';
import { SessionInfoService } from 'src/session-info/session-info.service';

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
    private socketTouuid = new Map<string, string>();

    constructor(
        private readonly redgreenService: RedGreenService,
        private readonly sessionInfoService: SessionInfoService,
    ) {}

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
    async run(client: Socket, payload: { shakeCount: number }) {
        const { shakeCount } = payload;
        const uuid = this.socketTouuid.get(client.id);
        const player = await this.sessionInfoService.findRedGreenPlayer(uuid);
        const game = await this.sessionInfoService.findRedGreenGame(player.room.room_id);
        const host = this.uuidToSocket.get(game.host.uuid);

        /**
         * @todo game.status === 'playing' 인지 확인
         */

        if (game.killer_mode === true) {
            this.youdie(uuid);
            return;
        } else {
            player.distance += shakeCount;
            await this.sessionInfoService.savePlayer(player);
            host.emit('run', { uuid, shakeCount });
        }

        if (player.distance >= game.length) {
            this.touchdown(uuid);
            return;
        }
    }

    /**
     * 게임진행중 호스트가 마우스를 눌렀을때 날아가는 요청("다"영희뒤돌아봐)
     *
     * @param client host
     * @param payload
     */
    @UseGuards(SessionGuard)
    @SubscribeMessage('stop')
    async stop(client: Socket, payload: { cur_time: Date }) {
        const { cur_time } = payload;
        const uuid = client.handshake.query.uuId.toString();
        const host = await this.sessionInfoService.findHost(uuid);
        const game = await this.sessionInfoService.findRedGreenGame((await host.room).room_id);
        game.killer_mode = true;
        await this.sessionInfoService.saveGame(game);

        client.emit('stop', { result: true });
    }

    /**
     * 게임진행중 호스트가 마우스를 뗐을때 날아가는 요청("무궁화꽃이피었습니")
     * @param client host
     * @param payload
     */
    @UseGuards(SessionGuard)
    @SubscribeMessage('resume')
    async resume(client: Socket, payload: { cur_time: Date }) {
        const { cur_time } = payload;
        const uuid = client.handshake.query.uuId.toString();
        const host = await this.sessionInfoService.findHost(uuid);
        const game = await this.sessionInfoService.findRedGreenGame((await host.room).room_id);
        game.killer_mode = false;
        await this.sessionInfoService.saveGame(game);

        client.emit('resume', { result: true });
    }

    @SubscribeMessage('youdie')
    async youdie(uuid: string) {
        const clientsocket = this.uuidToSocket.get(uuid);
        const player = await this.sessionInfoService.findRedGreenPlayer(uuid);
        const host = this.uuidToSocket.get(player.room.host.uuid);

        player.state = 'DEAD';
        player.endtime = new Date();
        await this.sessionInfoService.savePlayer(player);
        clientsocket.emit('youdie', {
            result: true,
            name: player.name,
            distance: player.distance,
            endtime: player.endtime,
        });
        host.emit('youdie', {
            result: true,
            name: player.name,
            distance: player.distance,
            endtime: player.endtime,
        });

    }

    @SubscribeMessage('touchdown')
    async touchdown(uuid: string) {
        const clientsocket = this.uuidToSocket.get(uuid);
        const player = await this.sessionInfoService.findRedGreenPlayer(uuid);
        const host = this.uuidToSocket.get(player.room.host.uuid);

        player.state = 'FINISH';
        player.endtime = new Date();
        await this.sessionInfoService.savePlayer(player);
        clientsocket.emit('touchdown', {
            result: true,
            name: player.name,
            endtime: player.endtime,
        });
        host.emit('touchdown', {
            result: true,
            name: player.name,
            endtime: player.endtime,
        });
    }

    /**
     * host가 명시적으로 게임을 종료
     * @param client host
     * @param payload
     */
    @SubscribeMessage('end_game')
    async endGame(client: Socket, payload: any) {
        const uuid = client.handshake.query.uuId.toString();
        const host = await this.sessionInfoService.findHost(uuid);
        const room = await host.room;
        //게임 종료
        this.server.to(room.room_id.toString()).emit('end_game', {
            result: true,
        });

        this.sessionInfoService.getRedGreenPlayers().then(async (players) => {
            for (const player of players) {
                room.current_user_num--;
                Logger.log('게임 참가자 나감: ' + player.uuid);
                Logger.log(
                    '게임 참가자: ' +
                        player.name +
                        ' 룸 번호: ' +
                        room.room_id +
                        ' 현재 인원: ' +
                        room.current_user_num,
                );
                // disconnect player
                const clientsocket = this.uuidToSocket.get(player.uuid);
                clientsocket.emit('disconnect');
            }
        });
    }
}

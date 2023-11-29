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
import { RedGreenEntity } from './game/redgreen.entity';
import { RedGreenPlayer } from 'src/session-info/entities/redgreen.player.entity';
import { CatchPlayer } from 'src/session-info/entities/catch.player.entitiy';
import { CatchGame } from 'src/session-info/entities/catch.game.entity';
import { Host } from 'src/session-info/entities/host.entity';
import { RedGreenGame } from 'src/session-info/entities/redgreen.game.entity';
import { log } from 'console';

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

    constructor(
        private readonly redgreenService: RedGreenService,
        private readonly sessionInfoService: SessionInfoService,
    ) {}

    private uuidToSocket = new Map<string, Socket>();
    private socketToUuid = new Map<Socket, string>();

    // < uuid, 최근활동 시간 > 인터벌로 체크할 클라이언트들
    private readonly clientsLastActivity: Map<string, { lastActivity: number }> = new Map();

    handleConnection(client: Socket) {
        const uuId = client.handshake.query.uuId;
        console.log('레드그린 클라이언트 접속 로그: ', uuId);
        if (uuId === undefined) {
            client.disconnect();
            return;
        }

        if (!this.uuidToSocket.has(uuId.toString())) {
            //신규 접속자
            console.log('신규 접속자');
            this.uuidToSocket.set(uuId.toString(), client);
        } else {
            //기존 접속자
            console.log('기존 접속자');
            const oldSocket = this.uuidToSocket.get(uuId.toString());
            if (oldSocket !== null) oldSocket.disconnect();
            this.uuidToSocket.set(uuId.toString(), client);
        }
        this.socketToUuid.set(client, uuId.toString());
    }

    async handleDisconnect(client: Socket) {
        //접속 해제
        Logger.log('레드그린 소켓 접속 해제 : ' + client.id);
        const uuId = this.socketToUuid.get(client);
        const player: RedGreenPlayer = await this.sessionInfoService.redGreenGamePlayerFindByUuid(uuId);
        const host: Host = await this.sessionInfoService.hostFind(uuId);
        if (player === undefined || host === undefined) {
            this.uuidToSocket.delete(uuId);
        }
        if(this.uuidToSocket.get(uuId) == client){
            this.uuidToSocket.set(uuId, null);
        }
        this.socketToUuid.delete(client);
    }

    async hostDisconnect(uuId: string) {
        Logger.log('호스트 접속 해제 : ' + uuId);
        const host_socket = this.uuidToSocket.get(uuId);
        const host = await this.sessionInfoService.hostFind(uuId);
        const room = await host.room;
        const players = await room.players;
        for (const player of players) {
            const socket = this.uuidToSocket.get(player.uuid);
            if (socket !== undefined)
                this.playerDisconnect(player.uuid);
        }
        //호스트 제거
        this.sessionInfoService.hostDelete(uuId);
        host_socket.disconnect();
        this.uuidToSocket.delete(uuId);
    }

    private playerDisconnect(uuId: string) {
        const player_socket = this.uuidToSocket.get(uuId);
        this.sessionInfoService.redGreenGamePlayerRemove(uuId);
        if(player_socket !== null)
            player_socket.disconnect();
        this.uuidToSocket.delete(uuId);
    }

    checkInactiveClients() {
        // const timeout = 10 * 60 * 1000; // 10 minutes (adjust as needed)
        const timeout = 15 * 60 * 1000; // 10 minutes (adjust as needed)

        // console.log(this.clientsLastActivity.size)
        this.clientsLastActivity.forEach((client, uuId) => {
            // console.log(client, clientId);
            const currentTime = Date.now();
            const lastActivityTime = client.lastActivity;

            if (currentTime - lastActivityTime > timeout) {
                // const clientEntity = this.uuidToclientEntity.get(uuId);
                //호스트의 경우 자동 접속해제 해제
                // if (clientEntity.roles === 'host') {
                //     // console.log("호스트 접속 종료: ", clientId);
                //     // this.end(clientEntity.clientSocket, { room_id: clientEntity.roomId.toString() });
                //     return;
                // }
                // if (clientEntity.clientSocket !== null) {
                //     clientEntity.clientSocket.emit('forceDisconnect', 'Inactive for too long'); //deprecated
                // }
                this.hostDisconnect(uuId);
            }
        });
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
            user_num: number;
            goalDistance: number;
            winnerNum: number;
        },
    ) {
        Logger.log('레드그린 클라이언트 make_room: ' + client.handshake.query.uuId);
        const { user_num, goalDistance, winnerNum } = payload;

        //이미 방이 존재하는 경우
        Logger.log("방 있나? "+await this.sessionInfoService.hostFind(client.handshake.query.uuId.toString()));
        if (await this.sessionInfoService.hostFind(client.handshake.query.uuId.toString()) != null) {
            Logger.log('방을 재생성 합니다.');
            //게임 종료 로직

            //기존 방 삭제
            await this.sessionInfoService.hostDelete(client.handshake.query.uuId.toString());
        }
        const host = new Host();
        host.uuid = client.handshake.query.uuId.toString();
        host.host_id = client.hostInfo.id;

        // this.sessionInfoService.hostSave(host);

        //방 상태 wait, playing, end
        const redGreenGame = new RedGreenGame();
        redGreenGame.user_num = user_num;
        redGreenGame.current_user_num = 0;
        redGreenGame.status = 'wait';
        redGreenGame.length = goalDistance;
        redGreenGame.win_num = winnerNum;
        redGreenGame.room_id = host.host_id

        host.room = Promise.resolve(redGreenGame);
        console.log(host);

        await this.sessionInfoService.hostSave(host);
    }

    @SubscribeMessage('ready')
    async ready(client: Socket, payload: {room_id: number, nickname: string}) {
        Logger.log('레드그린 클라이언트 ready: ' + client.handshake.query.uuId);
        const { room_id, nickname } = payload;
        const room = await this.sessionInfoService.redGreenGameFindByRoomId(room_id);
        room.current_user_num += 1;
        const player = new RedGreenPlayer();
        player.name = nickname;
        player.uuid = client.handshake.query.uuId.toString();
        player.room = room_id;
        await this.sessionInfoService.redGreenGamePlayerSave(player);
        await this.sessionInfoService.redGreenGameRoomSave(room);
    }

    @SubscribeMessage('leave')
    async leave(client: Socket) {
        Logger.log('레드그린 클라이언트 leave: ' + client.handshake.query.uuId);
        const uuid = client.handshake.query.uuId.toString();
        const player = await this.sessionInfoService.redGreenGamePlayerFindByUuid(uuid);
        const room = await player.room
        room.current_user_num -= 1;
        await this.sessionInfoService.redGreenGamePlayerRemove(uuid);
        this.playerDisconnect(uuid);
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
        const uuid = this.socketToUuid.get(client);
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
    // @UseGuards(SessionGuard)
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
    // @UseGuards(SessionGuard)
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

    // @SubscribeMessage('youdie')
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

    // @SubscribeMessage('touchdown')
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

    // /**
    //  * host가 명시적으로 게임을 종료
    //  * @param client host
    //  * @param payload
    //  */
    // @SubscribeMessage('end_game')
    // async endGame(client: Socket, payload: any) {
    //     const uuid = client.handshake.query.uuId.toString();
    //     const host = await this.sessionInfoService.findHost(uuid);
    //     const room = await host.room;
    //     //게임 종료
    //     this.server.to(room.room_id.toString()).emit('end_game', {
    //         result: true,
    //     });

    //     this.sessionInfoService.getRedGreenPlayers().then(async (players) => {
    //         for (const player of players) {
    //             room.current_user_num--;
    //             Logger.log('게임 참가자 나감: ' + player.uuid);
    //             Logger.log(
    //                 '게임 참가자: ' +
    //                     player.name +
    //                     ' 룸 번호: ' +
    //                     room.room_id +
    //                     ' 현재 인원: ' +
    //                     room.current_user_num,
    //             );
    //             // disconnect player
    //             const clientsocket = this.uuidToSocket.get(player.uuid);
    //             clientsocket.emit('disconnect');
    //         }
    //     });
    // }

    /**
     * host가 명시적으로 게임을 종료
     * @param client host
     * @param payload
     */
    @SubscribeMessage('end_game')
    async endGame(client: Socket, payload: any) {
        const uuId = client.handshake.query.uuId.toString();
        this.hostDisconnect(uuId);
    }

    onModuleInit() {
        // setInterval(() => {
        //     this.syncGameRoomInfo();
        // }, 3000);

        setInterval(() => {
            this.checkInactiveClients();
        }, 4000);
    }
}



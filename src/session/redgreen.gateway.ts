import {
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { SessionGuard } from './session.guard';
import { SocketExtension } from './socket.extension';
import { SessionInfoService } from 'src/session-info/session-info.service';
import { RedGreenPlayer } from 'src/session-info/entities/redgreen.player.entity';
import { Host } from 'src/session-info/entities/host.entity';
import { RedGreenGame } from 'src/session-info/entities/redgreen.game.entity';

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
        private readonly sessionInfoService: SessionInfoService,
    ) {}

    private uuidToSocket = new Map<string, Socket>();
    private socketToUuid = new Map<Socket, string>();

    // < uuid, 최근활동 시간 > 인터벌로 체크할 클라이언트들
    private readonly clientsLastActivity: Map<string, { lastActivity: number }> = new Map();

    async handleConnection(client: Socket) {
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
            const player: RedGreenPlayer = await this.sessionInfoService.redGreenGamePlayerFindByUuid(uuId.toString());
            // console.log("player: "+player);
            if (player) {
                client.join(player.room.toString());
            }
            this.uuidToSocket.set(uuId.toString(), client);
        }
        this.socketToUuid.set(client, uuId.toString());
    }

    async handleDisconnect(client: Socket) {
        //접속 해제
        Logger.log('레드그린 소켓 접속 해제 : ' + client.id);
        const uuId = this.socketToUuid.get(client);
        const player: RedGreenPlayer = await this.sessionInfoService.redGreenGamePlayerFindByUuid(uuId);
        const host: Host = await this.sessionInfoService.hostFindByUuid(uuId);
        if (player === undefined || host === undefined) {
            this.uuidToSocket.delete(uuId);
        }
        if (this.uuidToSocket.get(uuId) == client) {
            this.uuidToSocket.set(uuId, null);
        }
        this.socketToUuid.delete(client);
    }

    private async hostDisconnect(uuId: string) {
        Logger.log('호스트 접속 해제 : ' + uuId);
        const host_socket = this.uuidToSocket.get(uuId);
        const host: Host = await this.sessionInfoService.hostFindByUuid(uuId);
        const room: RedGreenGame = (await host.room) as RedGreenGame;
        const players = await room.players;
        for (const player of players) {
            const socket = this.uuidToSocket.get(player.uuid);
            if (socket !== undefined) this.playerDisconnect(player.uuid);
        }
        //호스트 제거
        await this.sessionInfoService.hostDelete(uuId);
        host_socket.disconnect();
        this.uuidToSocket.delete(uuId);
    }

    private async playerDisconnect(uuId: string) {
        const player_socket = this.uuidToSocket.get(uuId);
        await this.sessionInfoService.redGreenGamePlayerDelete(uuId);
        if (player_socket !== null) player_socket.disconnect();
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
        const oldHost = await this.sessionInfoService.hostFindByUuid(client.handshake.query.uuId.toString());

        //이미 방이 존재하는 경우
        if (oldHost) {
            Logger.log('방을 재생성 합니다.');
            //게임 종료 로직

            //기존 방 삭제
            await this.sessionInfoService.hostDelete(oldHost.uuid);
        }
        const host = new Host();
        host.uuid = client.handshake.query.uuId.toString();
        host.host_id = client.hostInfo.id;

        //방 상태 wait, playing, end
        const redGreenGame = new RedGreenGame();
        redGreenGame.user_num = user_num;
        redGreenGame.current_user_num = 0;
        redGreenGame.status = 'wait';
        redGreenGame.length = goalDistance;
        redGreenGame.win_num = winnerNum;
        redGreenGame.room_id = host.host_id;
        redGreenGame.current_win_num = 0;

        host.room = Promise.resolve(redGreenGame);
        console.log(host);

        await this.sessionInfoService.hostSave(host);
    }

    @SubscribeMessage('ready')
    async ready(client: Socket, payload: { room_id: number; nickname: string }) {
        Logger.log('레드그린 클라이언트 payload: ' + JSON.stringify(payload, null, 4), 'READY');
        const { room_id, nickname } = payload;
        const room: RedGreenGame = await this.sessionInfoService.redGreenGameFindByRoomId(room_id);
        if (room.status !== 'wait') {
            Logger.error('이미 시작된 게임입니다.', 'ready');
            client.emit('ready', { result: false, message: '이미 시작된 게임입니다.' });
            return;
        }
        room.current_user_num += 1;
        room.current_alive_num += 1;
        const player: RedGreenPlayer = new RedGreenPlayer();
        player.name = nickname;
        player.uuid = client.handshake.query.uuId.toString();
        player.room = Promise.resolve(room);
        client.join(room_id.toString());
        await this.sessionInfoService.redGreenGamePlayerSave(player);
        await this.sessionInfoService.redGreenGameSave(room);

        client.emit('ready', { result: true, message: '🆗' });
        const host = await this.sessionInfoService.hostFindByRoomId(room_id);
        const host_socket = this.uuidToSocket.get(host.uuid);
        host_socket.emit('player_list_add', {
            player_cnt: room.current_user_num,
            nickname: nickname,
        });
    }

    /**
     * @param client player
     * @returns emits 'player_list_remove' to host
     */
    @SubscribeMessage('leave_game')
    async leave(client: Socket) {
        const uuid: string = client.handshake.query.uuId.toString();
        const player: RedGreenPlayer = await this.sessionInfoService.redGreenGamePlayerFindByUuid(uuid);
        if (!player) {
            return { result: false };
        }
        Logger.log(player.name + '가 게임에서 나감');
        const room: RedGreenGame = (await player.room) as RedGreenGame;
        room.current_user_num -= 1;

        const host: Host = await this.sessionInfoService.hostFindByRoomId(room.room_id);
        const host_socket = this.uuidToSocket.get(host.uuid);
        host_socket.emit('player_list_remove', {
            player_cnt: room.current_user_num,
            nickname: player.name,
        });

        await this.sessionInfoService.redGreenGameSave(room);
        await this.sessionInfoService.redGreenGamePlayerDelete(uuid);
        this.playerDisconnect(uuid);
    }

    /**
     * @param client host
     * @param payload none
     */
    @SubscribeMessage('start_game')
    async startGame(client: Socket, payload: any) {
        const uuid = client.handshake.query.uuId.toString();
        const room: RedGreenGame = (await (await this.sessionInfoService.hostFindByUuid(uuid)).room) as RedGreenGame;
        if (room.status !== 'wait') {
            client.emit('start_game', { result: false, message: '이미 시작된 게임입니다.' });
            return;
        }
        room.status = 'playing';
        await this.sessionInfoService.redGreenGameSave(room);
        // 이제 호스트는 3,2,1 숫자를 세고 본 게임을 시작하게 된다.
        this.server.to(room.room_id.toString()).emit('start_game', { result: true });
        client.emit('start_game', { result: true });
    }

    @SubscribeMessage('im_ready')
    async imReady(client: Socket, payload: any) {
        throw new Error('Method not implemented.');
    }

    /**
     * @param client player
     * @param payload shakeCount: 이동한 거리의 **총량**
     * @returns no ack
     */
    @SubscribeMessage('run')
    async run(client: Socket, payload: { shakeCount: number }) {
        const { shakeCount } = payload;
        const uuid = client.handshake.query.uuId.toString();
        const player: RedGreenPlayer = await this.sessionInfoService.redGreenGamePlayerFindByUuid(uuid);
        const game: RedGreenGame = (await player.room) as RedGreenGame;
        console.log(game);
        const hostSocket = this.uuidToSocket.get((await game.host).uuid);

        if (game.status !== 'playing') {
            client.emit('run', { result: false, message: '게임이 시작되지 않았습니다.' });
            return;
        }
        if (game.killer_mode === true) {
            await this.youdie(player, game);
        } else {
            player.distance = shakeCount;
            await this.sessionInfoService.redGreenGamePlayerSave(player);
            hostSocket.emit('run', { uuid, shakeCount });
            if (player.distance >= game.length) {
                await this.touchdown(player, game);
            }
        }
        if (game.current_alive_num <= 0 || game.current_win_num >= game.win_num) {
            await this.finish(game);
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
        const host: Host = await this.sessionInfoService.hostFindByUuid(uuid);
        if (!host) {
            return { result: false, message: '호스트가 아닙니다.' };
        }
        const game: RedGreenGame = await this.sessionInfoService.redGreenGameFindByRoomId((await host.room).room_id);
        if (game.status !== 'playing') {
            return { result: false, message: '게임이 시작되지 않았습니다.' };
        }
        game.killer_mode = true;
        await this.sessionInfoService.redGreenGameSave(game);

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
        const host: Host = await this.sessionInfoService.hostFindByUuid(uuid);
        if (!host) {
            Logger.error(uuid + '는 호스트가 아닙니다.');
            return { result: false, message: uuid + '는 호스트가 아닙니다.' };
        }
        // const game: RedGreenGame = await this.sessionInfoService.redGreenGameFindByRoomId((await host.room).room_id);
        const game: RedGreenGame = (await host.room) as RedGreenGame;
        if (game.status !== 'playing') {
            Logger.error('게임이 시작되지 않았습니다.');
            return { result: false, message: '게임이 시작되지 않았습니다.' };
        }
        game.killer_mode = false;
        await this.sessionInfoService.redGreenGameSave(game);

        client.emit('resume', { result: true });
    }

    // @SubscribeMessage('youdie')
    async youdie(player: RedGreenPlayer, game: RedGreenGame) {
        if (!player) {
            Logger.error(player.name + '는 게임 참가자가 아닙니다.');
            return { result: false, message: player.name + '는 게임 참가자가 아닙니다.' };
        }
        if (game.status !== 'playing') {
            Logger.error('게임이 시작되지 않았습니다.');
            return { result: false, message: '게임이 시작되지 않았습니다.' };
        }
        const clientSocket = this.uuidToSocket.get(player.uuid);
        const hostSocket = this.uuidToSocket.get((await game.host).uuid);
        if (!hostSocket) {
            Logger.error('호스트가 없습니다.');
            return { result: false, message: '호스트가 없습니다.' };
        }

        player.state = 'DEAD';
        player.endtime = new Date();
        game.current_alive_num -= 1;
        await this.sessionInfoService.redGreenGameSave(game);
        await this.sessionInfoService.redGreenGamePlayerSave(player);
        clientSocket.emit('youdie', {
            result: true,
            name: player.name,
            distance: player.distance,
            endtime: player.endtime,
        });
        hostSocket.emit('youdie', {
            result: true,
            name: player.name,
            distance: player.distance,
            endtime: player.endtime,
        });
    }

    // @SubscribeMessage('touchdown')
    async touchdown(player: RedGreenPlayer, game: RedGreenGame) {
        if (!player) {
            Logger.error(player.name + '는 게임 참가자가 아닙니다.', 'touchdown');
            return { result: false, message: player.name + '는 게임 참가자가 아닙니다.' };
        }
        if (game.status !== 'playing') {
            Logger.error('게임이 시작되지 않았습니다.', 'touchdown');
            return { result: false, message: '게임이 시작되지 않았습니다.' };
        }
        const host_socket = this.uuidToSocket.get((await game.host).uuid);
        if (!host_socket) {
            Logger.error('호스트 소켓이 없습니다.', 'touchdown');
            return { result: false, message: '호스트소켓이 없습니다.' };
        }
        const clientsocket = this.uuidToSocket.get(player.uuid);
        if (!clientsocket) {
            Logger.error('클라이언트 소켓이 없습니다.', 'touchdown');
            return { result: false, message: '클라이언트 소켓이 없습니다.' };
        }

        player.state = 'FINISH';
        player.endtime = new Date();
        game.current_win_num += 1;
        game.current_alive_num -= 1;
        await this.sessionInfoService.redGreenGameSave(game);
        await this.sessionInfoService.redGreenGamePlayerSave(player);
        clientsocket.emit('touchdown', {
            result: true,
            name: player.name,
            endtime: player.endtime,
        });
        host_socket.emit('touchdown', {
            result: true,
            name: player.name,
            endtime: player.endtime,
        });
    }

    async syncGameRoomInfo() {
        const games: RedGreenGame[] = await this.sessionInfoService.redGreenGameFindAll();
        // console.log('syncGameRoomInfo: ' + games);
        if (games.length === 0) return;
        for (const game of games) {
            if (game.status !== 'playing') continue;
            const host: Host = await game.host;
            const players: RedGreenPlayer[] = (await game.players) as RedGreenPlayer[];
            const host_socket = this.uuidToSocket.get(host.uuid);

            // Logger.debug(JSON.stringify(players, null, 4)); // stringify with 4 spaces at each level)

            if (host_socket === undefined) return;
            host_socket.emit('players_status', {
                player_info: players,
            });

            // for (const player_socket of player_sockets) {
            //     player_socket.emit('sync_game_room_info', {
            //         room_id: room.room_id,
            //         host: host,
            //         players: players,
            //     });
            // }
        }
    }

    @SubscribeMessage('game_finished')
    async gameFinished(client: Socket, payload: any) {
        const uuid = client.handshake.query.uuId.toString();
        const host = await this.sessionInfoService.hostFindByUuid(uuid);
        const game: RedGreenGame = (await host.room) as RedGreenGame;
        this.finish(game);
    }

    async finish(game: RedGreenGame) {
        const host_socket = this.uuidToSocket.get((await game.host).uuid);
        const players: RedGreenPlayer[] = (await game.players) as RedGreenPlayer[];
        // const winners = [];
        // for (const gamer of (await game.players) as RedGreenPlayer[]) {
        //     if (gamer.state === 'FINISH') {
        //         winners.push({ nickname: gamer.name, score: gamer.distance });
        //     }
        // }
        game.status = 'end';
        await this.sessionInfoService.redGreenGameSave(game);
        host_socket.emit('game_finished', { player_info: players });
    }

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
        setInterval(() => {
            this.syncGameRoomInfo();
        }, 1000);

        setInterval(() => {
            this.checkInactiveClients();
        }, 4000);
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
}

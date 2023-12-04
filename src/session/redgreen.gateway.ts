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

    constructor(private readonly sessionInfoService: SessionInfoService) {}

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
            let player: RedGreenPlayer;
            this.sessionInfoService.redGreenGamePlayerFindByUuid(uuId.toString()).then((res) => {
                player = res;
            });
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

    async cleanRoomByHostUuid(uuid: string) {
        const host: Host = await this.sessionInfoService.hostFindByUuid(uuid);
        const room: RedGreenGame = (await host.room) as RedGreenGame;
        const players = await room.players;

        this.server.to(room.room_id.toString()).emit('end', { result: true });
        for (const player of players) {
            const playerSocket = this.uuidToSocket.get(player.uuid);
            if (playerSocket) {
                this.playerDisconnect(player.uuid);
            }
        }
        //호스트 제거
        await this.sessionInfoService.hostDelete(uuid);
    }

    private hostDisconnect(uuid: string) {
        Logger.log('호스트 접속 해제 : ' + uuid);
        this.cleanRoomByHostUuid(uuid);
        const host_socket = this.uuidToSocket.get(uuid);
        host_socket.disconnect();
        this.uuidToSocket.delete(uuid);
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
        this.clientsLastActivity.forEach(async (client, uuId) => {
            // console.log(client, clientId);
            const currentTime = Date.now();
            const lastActivityTime = client.lastActivity;
            if (currentTime - lastActivityTime > timeout) {
                const player: RedGreenPlayer = await this.sessionInfoService.redGreenGamePlayerFindByUuid(uuId);
                if (player) {
                    this.playerDisconnect(uuId);
                }
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
        const uuid = client.handshake.query.uuId.toString();
        const { user_num, goalDistance, winnerNum } = payload;

        //이미 방이 존재하는 경우
        const oldRoom: RedGreenGame = await this.sessionInfoService.redGreenGameFindByRoomId(client.hostInfo.id);
        if (oldRoom !== null) {
            Logger.log('방을 재생성 합니다.');
            const host = await this.sessionInfoService.hostFindByRoomId(client.hostInfo.id);
            await this.cleanRoomByHostUuid(host.uuid);
            // await this.hostDisconnect(host.uuid);
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

    @UseGuards(SessionGuard)
    @SubscribeMessage('close_gate')
    async closeGate(client: SocketExtension, payload: { room_id: number }) {
        const { room_id } = payload;
        const room: RedGreenGame = await this.sessionInfoService.redGreenGameFindByRoomId(room_id);
        if (room.status !== 'wait') return;
        this.server.to(payload.room_id.toString()).emit('close_gate', { result: true });
    }

    @SubscribeMessage('ready')
    async ready(client: Socket, payload: { room_id: number; nickname: string }) {
        const uuid = client.handshake.query.uuId.toString();
        Logger.log('레드그린 클라이언트 payload: ' + JSON.stringify(payload, null, 4), 'READY');
        const { room_id, nickname } = payload;
        if (room_id === undefined || nickname === undefined) {
            console.log(room_id);
            Logger.warn(`room_id: ${client.id} ready: 유효하지 않은 요청입니다.`);
            return;
        }

        const room: RedGreenGame = await this.sessionInfoService.redGreenGameFindByRoomId(room_id);

        if (room !== null) {
            if (room.current_user_num === room.user_num || room.status !== 'wait') {
                Logger.log(room.current_user_num + '방에 참여할 수 없습니다.');
                client.emit('ready', { result: false, message: '방에 참여할 수 없습니다.' });
                return;
            }
        } else {
            console.log(`${room_id}번 방이 존재하지 않습니다.`);
            client.emit('ready', {
                result: false,
                message: '방이 존재하지 않습니다.',
            });
            return;
        }

        //플레이어 생성
        const player: RedGreenPlayer = new RedGreenPlayer();
        try {
            player.uuid = uuid;
            player.name = nickname;
            player.room = Promise.resolve(room);
            await this.sessionInfoService.redGreenGamePlayerInsert(player);
        } catch (error) {
            Logger.log('이미 참가중입니다.');
            client.emit('ready', {
                result: false,
                message: '이미 참가중입니다.',
            });
            return;
        }

        // 플레이어 소켓 room 등록
        client.join(room_id.toString());

        room.current_user_num += 1;
        room.current_alive_num += 1;
        await this.sessionInfoService.redGreenGameSave(room);

        client.emit('ready', {
            result: true,
            message: '🆗',
            win_num: room.win_num,
            total_num: room.user_num,
            length: room.length,
        });
        const host = await this.sessionInfoService.hostFindByRoomId(room_id);
        const host_socket = this.uuidToSocket.get(host.uuid);
        host_socket.emit('player_list_add', {
            player_cnt: room.current_user_num,
            name: nickname,
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
            name: player.name,
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
        const starttime = new Date();
        this.server.to(room.room_id.toString()).emit('start_game', { result: true, starttime: starttime });
        client.emit('start_game', { result: true, starttime: starttime });
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

        this.server.to(game.room_id.toString()).emit('realtime_redgreen', { go: false });

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

        this.server.to(game.room_id.toString()).emit('realtime_redgreen', { go: true });

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
        player.distance = game.length + game.win_num - game.current_win_num;
        game.current_win_num += 1;
        game.current_alive_num -= 1;
        await this.sessionInfoService.redGreenGameSave(game);
        await this.sessionInfoService.redGreenGamePlayerSave(player);
        clientsocket.emit('touchdown', {
            result: true,
            rank: game.current_win_num,
            name: player.name,
            endtime: player.endtime,
        });
        host_socket.emit('touchdown', {
            result: true,
            rank: game.current_win_num,
            name: player.name,
            endtime: player.endtime,
        });
    }

    @SubscribeMessage('express_emotion')
    async expressEmotion(client: Socket, payload: { room_id: string; emotion: string }) {
        const { emotion } = payload;
        const uuid = client.handshake.query.uuId.toString();
        console.log('uuid: ', uuid);
        const player: RedGreenPlayer = await this.sessionInfoService.redGreenGamePlayerFindByUuid(uuid);
        console.log('player: ', player);
        const game: RedGreenGame = (await player.room) as RedGreenGame;
        console.log('game: ', game);
        const hostSocket = this.uuidToSocket.get((await game.host).uuid);

        this.clientsLastActivity.set(uuid, {
            lastActivity: Date.now(),
        });

        if (player === null || emotion === undefined) {
            return;
        }

        hostSocket.emit('express_emotion', { emotion });
    }

    async refreshPlayerRank() {
        // this.sessionInfoService.redGreenGameFindAll().then((games) => {
        const games: RedGreenGame[] = await this.sessionInfoService.redGreenGameFindAll();
        // console.log('syncGameRoomInfo: ' + games);
        if (games.length === 0) return;
        for (const game of games) {
            if (game.status !== 'playing') continue;
            const host: Host = await game.host;
            const players: RedGreenPlayer[] = (await game.players) as RedGreenPlayer[];

            const playersSorted = players.sort((a: RedGreenPlayer, b: RedGreenPlayer) => {
                return b.distance - a.distance;
            });

            for (let i = 0; i < playersSorted.length; i++) {
                const playerSocket = this.uuidToSocket.get(playersSorted[i].uuid);
                try {
                    playerSocket.emit('realtime_my_rank', { rank: i + 1 });
                } catch (error) {
                    // Logger.error(error);
                }
            }
        }
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
        const hostSocket = this.uuidToSocket.get((await game.host).uuid);
        let players: RedGreenPlayer[] = (await game.players) as RedGreenPlayer[];

        game.status = 'end';
        await this.sessionInfoService.redGreenGameSave(game);

        const endtime = new Date();
        players.forEach((player) => {
            if (player.state == 'ALIVE') {
                player.endtime = endtime;
            }
        });
        const playersSorted = players.sort((a: RedGreenPlayer, b: RedGreenPlayer) => {
            return b.distance - a.distance;
        });

        this.server.to(game.room_id.toString()).emit('game_finished', { player_info: playersSorted });

        hostSocket.emit('game_finished', { player_info: playersSorted });
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
            this.refreshPlayerRank();
        }, 2000);

        setInterval(() => {
            this.checkInactiveClients();
        }, 4000);
    }
}

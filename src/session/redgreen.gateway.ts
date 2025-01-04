import {
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { SessionGuardWithDB, SessionGuardWithoutDB } from './session.guard';
import { SocketExtension } from './socket.extension';
import { SessionInfoService } from 'src/session-info/session-info.service';
import { RedGreenPlayer } from 'src/session-info/entities/redgreen.player.entity';
import { Host } from 'src/session-info/entities/host.entity';
import { RedGreenGame } from 'src/session-info/entities/redgreen.game.entity';
import * as AsyncLock from 'async-lock';
import * as dotenv from 'dotenv';

dotenv.config();

@WebSocketGateway(+process.env.SOCKET_PORT, {
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
    private lock = new AsyncLock();

    // < uuid, 최근활동 시간 > 인터벌로 체크할 클라이언트들
    private readonly clientsLastActivity: Map<string, { lastActivity: number }> = new Map();

    handleConnection(client: Socket) {
        const uuId = client.handshake.query.uuId.toString();
        // console.log('캐치게임 클라이언트 접속 로그: ', uuId);
        if (uuId === undefined) {
            client.disconnect();
            return;
        }

        const oldSocket = this.uuidToSocket.get(uuId);
        if (!oldSocket) {
            //신규 접속자
            Logger.log('신규 접속자');
        } else {
            //기존 접속자
            Logger.debug('기존 접속자 소켓 초기화');
            oldSocket.disconnect();
            this.sessionInfoService.redGreenGamePlayerFindByUuid(uuId).then(async (player) => {
                if (player) {
                    Logger.debug(`기존 플레이어 "${player.name}" 재접속`, 'handleConnection');
                    client.join((await player.room).room_id.toString());
                }
            });
        }
        this.uuidToSocket.set(uuId, client);
        this.socketToUuid.set(client, uuId);
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
        if (!host) {
            Logger.warn(`uuid ${uuid}는 호스트가 아닙니다.`, 'cleanRoomByHostUuid');
            return;
        }
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
    @UseGuards(SessionGuardWithDB)
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
        const oldRoom: RedGreenGame = await this.sessionInfoService.redGreenGameFindByRoomId(client.hostInfo.id);
        if (oldRoom !== null) {
            Logger.debug('방을 재생성 합니다.');
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
        Logger.log(host);

        await this.sessionInfoService.hostSave(host);
    }

    @UseGuards(SessionGuardWithDB)
    @SubscribeMessage('close_gate')
    async closeGate(client: SocketExtension, payload: { room_id: number }) {
        const { room_id } = payload;
        const room: RedGreenGame = await this.sessionInfoService.redGreenGameFindByRoomId(room_id);
        if (room.status !== 'wait') return;
        this.server.to(payload.room_id.toString()).emit('close_gate', { result: true });
    }

    @SubscribeMessage('ready')
    async ready(client: Socket, payload: { room_id: number; nickname: string }) {
        this.lock.acquire('ready', async () => {
            const uuid = client.handshake.query.uuId.toString();
            Logger.log('레드그린 클라이언트 payload: ' + JSON.stringify(payload, null, 4), 'READY');
            const { room_id, nickname } = payload;
            if (room_id === undefined || nickname === undefined) {
                Logger.warn(`room_id: ${client.id} ready: 유효하지 않은 요청입니다.`);
                return;
            }
            Logger.log(`${nickname}의 발행시간은 ${client.handshake.time} 입니다.`);

            const room: RedGreenGame = await this.sessionInfoService.redGreenGameFindByRoomId(room_id);

            if (room) {
                if (room.current_user_num === room.user_num || room.status !== 'wait') {
                    Logger.warn(room.current_user_num + '방에 참여할 수 없습니다.');
                    client.emit('ready', { result: false, message: '방에 참여할 수 없습니다.' });
                    return;
                }
            } else {
                Logger.warn(`${room_id}번 방이 존재하지 않습니다.`);
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
                this.clientsLastActivity.set(uuid, {
                    lastActivity: Date.now(),
                });
            } catch (error) {
                Logger.warn('이미 참가중입니다.');
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
            Logger.warn(`uuid ${uuid}에 대한 플레이어가 존재하지 않습니다.`, 'leave_game');
            return { result: false };
        }
        Logger.log(player.name + '가 게임에서 나감');
        const room: RedGreenGame = (await player.room) as RedGreenGame;
        // 방이 없을 시 반환
        if (!room) {
            Logger.warn(`uuid ${uuid}가 속한 방이 없습니다.`, 'leave_game');
            return;
        }
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
    @UseGuards(SessionGuardWithoutDB)
    @SubscribeMessage('start_game')
    async startGame(client: Socket) {
        const uuid = client.handshake.query.uuId.toString();
        const room: RedGreenGame = (await (await this.sessionInfoService.hostFindByUuid(uuid)).room) as RedGreenGame;
        if (room.status !== 'wait') {
            client.emit('start_game', { result: false, message: '이미 시작된 게임입니다.' });
            return;
        }
        room.status = 'playing';
        room.start_time = new Date();
        await this.sessionInfoService.redGreenGameSave(room);
        // 이제 호스트는 3,2,1 숫자를 세고 본 게임을 시작하게 된다.

        this.server.to(room.room_id.toString()).emit('start_game', { result: true });
        client.emit('start_game', { result: true });
    }

    // @SubscribeMessage('im_ready')
    // async imReady(client: Socket, payload: any) {
    //     throw new Error('Method not implemented.');
    // }

    /**
     * @param client player
     * @param payload shakeCount: 이동한 거리의 **총량**
     * @returns no ack
     */
    @SubscribeMessage('run')
    async run(client: Socket, payload: { shakeCount: number; latency?: number }) {
        this.lock.acquire('run', async () => {
            const { shakeCount } = payload;
            const latency = payload.latency || 0;
            const uuid = client.handshake.query.uuId.toString();
            const player: RedGreenPlayer = await this.sessionInfoService.redGreenGamePlayerFindByUuid(uuid);

            // 플레이어가 없거나 방이 없을 시 반환
            if (!player) {
                // Logger.warn(`uuid ${uuid}에 대한 플레이어가 존재하지 않습니다.`, 'run');
                return;
            }
            const game: RedGreenGame = (await player.room) as RedGreenGame;
            // 게임룸이 없을 시 반환
            if (!game) {
                // Logger.warn(`uuid ${uuid}가 속한 방이 없습니다.`, 'run');
                return;
            }
            // console.log(game);

            const host = await game.host;
            if (!host) {
                Logger.warn(`uuid ${uuid}가 속한 방의 호스트가 없습니다.`, 'run');
                return;
            }

            const hostSocket = this.uuidToSocket.get(host.uuid);
            if (!hostSocket) {
                Logger.warn(`uuid ${uuid}가 속한 방의 호스트 소켓이 없습니다.`, 'run');
                return;
            }

            if (game.status !== 'playing' || player.state !== 'ALIVE') {
                // Logger.error(game.status + player.state + '게임이 시작되지 않았습니다.');
                return;
            }
            if (game.killer_mode === true && this.doesPlayerHaveToDie(game, latency)) {
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
            this.clientsLastActivity.set(uuid, {
                lastActivity: Date.now(),
            });
        });
    }

    /**
     * 지연시간 기반 죽음판정 정책
     */
    private doesPlayerHaveToDie(game: RedGreenGame, latency: number): boolean {
        const CONSTANT_MS = 200; // stop 메시지 날아온 시간으로부터 최소 인정시간
        const admitTime = game.last_killer_time + CONSTANT_MS + latency;
        const currentTime = performance.now();
        if (currentTime > admitTime) {
            Logger.debug(`${currentTime - admitTime}ms 만큼 늦었습니다. (latency: ${latency})`, 'doesPlayerHaveToDie');
            return true;
        }
        Logger.debug(`${admitTime - currentTime}ms 만큼 빨랐습니다. (latency: ${latency})`, 'doesPlayerHaveToDie');
        return false;
    }

    /**
     * 게임진행중 호스트가 마우스를 눌렀을때 날아가는 요청("다"영희뒤돌아봐)
     *
     * @param client host
     * @param payload
     */
    @UseGuards(SessionGuardWithoutDB)
    @SubscribeMessage('stop')
    async stop(client: Socket) {
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
        game.last_killer_time = performance.now();
        await this.sessionInfoService.redGreenGameSave(game);

        this.server.to(game.room_id.toString()).emit('realtime_redgreen', { go: false });

        client.emit('stop', { result: true });
    }

    /**
     * 게임진행중 호스트가 마우스를 뗐을때 날아가는 요청("무궁화꽃이피었습니")
     * @param client host
     * @param payload
     */
    @UseGuards(SessionGuardWithoutDB)
    @SubscribeMessage('resume')
    async resume(client: Socket) {
        this.lock.acquire('run', async () => {
            const uuid = client.handshake.query.uuId.toString();
            const host: Host = await this.sessionInfoService.hostFindByUuid(uuid);
            if (!host) {
                Logger.warn(uuid + '는 호스트가 아닙니다.');
                return { result: false, message: uuid + '는 호스트가 아닙니다.' };
            }
            // const game: RedGreenGame = await this.sessionInfoService.redGreenGameFindByRoomId((await host.room).room_id);
            const game: RedGreenGame = (await host.room) as RedGreenGame;
            if (game.status !== 'playing') {
                // Logger.error('게임이 시작되지 않았습니다.');
                return { result: false, message: '게임이 시작되지 않았습니다.' };
            }
            game.killer_mode = false;

            this.server.to(game.room_id.toString()).emit('realtime_redgreen', { go: true });

            await this.sessionInfoService.redGreenGameSave(game);

            client.emit('resume', { result: true });
        });
    }

    async youdie(player: RedGreenPlayer, game: RedGreenGame) {
        if (!player) {
            Logger.warn(player.name + '는 게임 참가자가 아닙니다.');
            return { result: false, message: player.name + '는 게임 참가자가 아닙니다.' };
        }
        if (game.status !== 'playing') {
            Logger.warn('게임이 시작되지 않았습니다.');
            return { result: false, message: '게임이 시작되지 않았습니다.' };
        }
        const clientSocket = this.uuidToSocket.get(player.uuid);
        const hostSocket = this.uuidToSocket.get((await game.host).uuid);
        if (!hostSocket) {
            Logger.warn('호스트가 없습니다.');
            return { result: false, message: '호스트가 없습니다.' };
        }

        player.state = 'DEAD';
        const end_time = new Date();
        player.elapsed_time = end_time.getTime() - game.start_time.getTime();
        game.current_alive_num -= 1;
        await this.sessionInfoService.redGreenGameSave(game);
        await this.sessionInfoService.redGreenGamePlayerSave(player);

        clientSocket.emit('youdie', {
            result: true,
            name: player.name,
            distance: player.distance,
            elapsed_time: player.elapsed_time,
        });
        hostSocket.emit('youdie', {
            result: true,
            name: player.name,
            distance: player.distance,
            elapsed_time: player.elapsed_time,
        });
    }

    async touchdown(player: RedGreenPlayer, game: RedGreenGame) {
        if (!player) {
            Logger.warn(player.name + '는 게임 참가자가 아닙니다.', 'touchdown');
            return { result: false, message: player.name + '는 게임 참가자가 아닙니다.' };
        }
        if (game.status !== 'playing') {
            Logger.warn('게임이 시작되지 않았습니다.', 'touchdown');
            return { result: false, message: '게임이 시작되지 않았습니다.' };
        }
        const host_socket = this.uuidToSocket.get((await game.host).uuid);
        if (!host_socket) {
            Logger.warn('호스트 소켓이 없습니다.', 'touchdown');
            return { result: false, message: '호스트소켓이 없습니다.' };
        }
        const clientsocket = this.uuidToSocket.get(player.uuid);
        if (!clientsocket) {
            Logger.warn('클라이언트 소켓이 없습니다.', 'touchdown');
            return { result: false, message: '클라이언트 소켓이 없습니다.' };
        }

        player.state = 'FINISH';
        const end_time = new Date();
        player.elapsed_time = end_time.getTime() - game.start_time.getTime();
        player.distance = game.length + game.win_num - game.current_win_num;
        game.current_win_num += 1;
        game.current_alive_num -= 1;
        await this.sessionInfoService.redGreenGameSave(game);
        await this.sessionInfoService.redGreenGamePlayerSave(player);

        clientsocket.emit('touchdown', {
            result: true,
            rank: game.current_win_num,
            name: player.name,
            elapsed_time: player.elapsed_time,
        });
        host_socket.emit('touchdown', {
            result: true,
            rank: game.current_win_num,
            name: player.name,
            elapsed_time: player.elapsed_time,
        });
    }

    @SubscribeMessage('express_emotion')
    async expressEmotion(client: Socket, payload: { room_id: string; emotion: string }) {
        const { emotion } = payload;
        const uuid = client.handshake.query.uuId.toString();
        // console.log('uuid: ', uuid);
        const player: RedGreenPlayer = await this.sessionInfoService.redGreenGamePlayerFindByUuid(uuid);
        // console.log('player: ', player);
        const game: RedGreenGame = (await player.room) as RedGreenGame;
        // 게임룸이 존재하지 않을 시 반환
        if (!game) {
            Logger.warn(`uuid ${uuid}가 속한 방이 없습니다.`, 'express_emotion');
            return;
        }

        const hostSocket = this.uuidToSocket.get((await game.host).uuid);
        // console.log('game: ', game);
        if (player === null || emotion === undefined || hostSocket === undefined) {
            Logger.warn(`uuid ${uuid}에 대한 플레이어 또는 속한 방의 호스트가 없습니다.`, 'express_emotion');
            return;
        }

        this.clientsLastActivity.set(uuid, {
            lastActivity: Date.now(),
        });

        hostSocket.emit('express_emotion', { emotion });
    }

    async refreshPlayerRank() {
        // this.sessionInfoService.redGreenGameFindAll().then((games) => {
        const games: RedGreenGame[] = await this.sessionInfoService.redGreenGameFindAll();
        // console.log('syncGameRoomInfo: ' + games);
        if (games.length === 0) {
            // Logger.warn('게임이 없습니다.', 'refreshPlayerRank');
            return;
        }
        for (const game of games) {
            if (game.status !== 'playing') continue;
            const players: RedGreenPlayer[] = (await game.players) as RedGreenPlayer[];

            const playersSorted = players.sort((a: RedGreenPlayer, b: RedGreenPlayer) => {
                return b.distance - a.distance;
            });

            for (let i = 0; i < playersSorted.length; i++) {
                const player = playersSorted[i];
                const playerSocket = this.uuidToSocket.get(player.uuid);
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
        if (games.length === 0) {
            // Logger.warn('오픈된 게임이 없습니다.', 'syncGameRoomInfo');
            return;
        }
        for (const game of games) {
            if (game.status !== 'playing') continue;
            const host: Host = await game.host;
            const players: RedGreenPlayer[] = (await game.players) as RedGreenPlayer[];
            const host_socket = this.uuidToSocket.get(host.uuid);

            // Logger.debug(JSON.stringify(players, null, 4)); // stringify with 4 spaces at each level)

            if (!host_socket) {
                Logger.warn('호스트 소켓이 없습니다.', 'syncGameRoomInfo');
                return;
            }
            host_socket.emit('players_status', {
                player_info: players,
            });
        }
    }

    @SubscribeMessage('pre_player_status')
    async prePlayerStatus(hostSocket: Socket) {
        const uuid = hostSocket.handshake.query.uuId.toString();
        const host = await this.sessionInfoService.hostFindByUuid(uuid);
        if (!host) {
            Logger.warn(`uuid ${uuid}는 호스트가 아닙니다.`);
            return { result: false, message: '호스트가 아닙니다.' };
        }
        const game: RedGreenGame = (await host.room) as RedGreenGame;
        if (!game) {
            Logger.warn(`uuid ${uuid} 호스트의 게임이 존재하지 않습니다.`);
            return { result: false, message: '게임이 존재하지 않습니다.' };
        }
        const players: RedGreenPlayer[] = (await game.players) as RedGreenPlayer[];

        hostSocket.emit('pre_player_status', { pre_player_info: players });
    }

    @UseGuards(SessionGuardWithoutDB)
    @SubscribeMessage('game_finished')
    async gameFinished(client: Socket) {
        const uuid = client.handshake.query.uuId.toString();
        const host = await this.sessionInfoService.hostFindByUuid(uuid);
        const game: RedGreenGame = (await host.room) as RedGreenGame;
        this.finish(game);
    }

    async finish(game: RedGreenGame) {
        const hostSocket = this.uuidToSocket.get((await game.host).uuid);
        const players: RedGreenPlayer[] = (await game.players) as RedGreenPlayer[];

        game.status = 'end';

        const end_time = new Date();
        const elapsed_time = end_time.getTime() - game.start_time.getTime();
        players.forEach((player) => {
            if (player.state === 'ALIVE') {
                player.elapsed_time = elapsed_time;
            }
        });
        await this.sessionInfoService.redGreenGameSave(game);

        const playersSorted = players.sort((a: RedGreenPlayer, b: RedGreenPlayer) => {
            return b.distance - a.distance;
        });

        this.server.to(game.room_id.toString()).emit('game_finished', { player_info: playersSorted });

        hostSocket.emit('players_status', {
            player_info: players,
        });

        hostSocket.emit('game_finished', { player_info: playersSorted });
    }

    /**
     * host가 명시적으로 게임을 종료
     * @param client host
     * @param payload
     */
    @UseGuards(SessionGuardWithoutDB)
    @SubscribeMessage('end_game')
    async endGame(client: Socket) {
        const uuId = client.handshake.query.uuId.toString();
        this.hostDisconnect(uuId);
    }

    @SubscribeMessage('ping')
    ping(client: Socket, payload: { start: number }) {
        return { start: payload.start };
    }

    onModuleInit() {
        setInterval(() => {
            this.syncGameRoomInfo();
        }, 300);

        setInterval(() => {
            this.refreshPlayerRank();
        }, 2000);

        setInterval(() => {
            this.checkInactiveClients();
        }, 4000);
    }
}

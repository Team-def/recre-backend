import { Logger, UseGuards } from '@nestjs/common';

import {
    SubscribeMessage,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    WebSocketGateway,
} from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';
import { User } from 'src/user/entities/user.entity';
import { SessionGuardWithDB, SessionGuardWithoutDB } from './session.guard';
import { SessionInfoService } from 'src/session-info/session-info.service';
import { CatchPlayer } from 'src/session-info/entities/catch.player.entitiy';
import { Host } from 'src/session-info/entities/host.entity';
import { CatchGame } from 'src/session-info/entities/catch.game.entity';
import { SocketExtension } from './socket.extension';
import * as AsyncLock from 'async-lock';

@WebSocketGateway({
    namespace: 'catch', /// TODO - namespace는 나중에 정의할 것
    transports: ['websocket'],
    pingInterval: 3000,
    pingTimeout: 10000,
    cookie: false,
    serveClient: false,
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 1000,
})
export class CatchGateway implements OnGatewayConnection, OnGatewayDisconnect {
    constructor(private readonly sessionInfoService: SessionInfoService) {}
    @WebSocketServer()
    server: Server;

    // < uuid, 최근활동 시간 > 인터벌로 체크할 클라이언트들
    private readonly clientsLastActivity: Map<string, { lastActivity: number }> = new Map();

    // < socket, uuid > 소켓으로 uuid 접근
    socketTouuid: Map<Socket, string> = new Map();

    // < uuid, socket > uuid로 소켓 접근
    private uuidToSocket = new Map<string, Socket>();

    private lock = new AsyncLock();

    // 소켓 접속
    handleConnection(client: Socket) {
        const uuId = client.handshake.query.uuId.toString();
        Logger.log('캐치게임 클라이언트 접속 로그: ', uuId);
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
            Logger.log('기존 접속자 소켓 초기화');
            oldSocket.disconnect();
            this.sessionInfoService.catchGamePlayerFindByUuid(uuId).then(async (player) => {
                if (player) {
                    Logger.debug(`기존 플레이어 "${player.name}" 재접속`);
                    client.join((await player.room).room_id.toString());
                }
            });
        }
        this.uuidToSocket.set(uuId, client);
        this.socketTouuid.set(client, uuId);
    }

    async handleDisconnect(client: Socket) {
        //접속 해제
        Logger.log('캐치게임 소켓 접속 해제 : ' + client.id);
        const uuId = this.socketTouuid.get(client);
        const player: CatchPlayer = await this.sessionInfoService.catchGamePlayerFindByUuid(uuId);
        const host: Host = await this.sessionInfoService.hostFindByUuid(uuId);
        if (player === undefined || host === undefined) {
            this.uuidToSocket.delete(uuId);
        }
        if (this.uuidToSocket.get(uuId) == client) {
            this.uuidToSocket.set(uuId, null);
        }
        this.socketTouuid.delete(client);
    }

    checkInactiveClients() {
        // const timeout = 10 * 60 * 1000; // 10 minutes (adjust as needed)
        const timeout = 15 * 60 * 1000; // 10 minutes (adjust as needed)

        this.clientsLastActivity.forEach(async (client, uuId) => {
            const currentTime = Date.now();
            const lastActivityTime = client.lastActivity;

            if (currentTime - lastActivityTime > timeout) {
                const player: CatchPlayer = await this.sessionInfoService.catchGamePlayerFindByUuid(uuId);
                if (player) {
                    this.playerDisconnect(uuId);
                }
            }
        });
    }

    @SubscribeMessage('leave_game')
    async leaveGame(client: Socket) {
        Logger.log('캐치 플레이어 leave: ' + client.handshake.query.uuId);

        const uuid = client.handshake.query.uuId.toString();
        const player: CatchPlayer = await this.sessionInfoService.catchGamePlayerFindByUuid(uuid);
        if (!player) {
            Logger.warn(`uuid ${uuid}에 대한 플레이어가 존재하지 않습니다.`, 'leave_game');
            return { result: false };
        }
        const room: CatchGame = (await player.room) as CatchGame;
        room.current_user_num -= 1;
        const host: Host = await this.sessionInfoService.hostFindByRoomId(room.room_id);
        const host_socket = this.uuidToSocket.get(host.uuid);
        host_socket.emit('player_list_remove', {
            player_cnt: room.current_user_num,
            nickname: player.name,
        });
        await this.sessionInfoService.catchGameRoomSave(room);
        this.playerDisconnect(uuid);
    }

    async cleanRoomByHostUuid(uuId: string) {
        Logger.log('방 제거: ' + uuId);
        const host: Host = await this.sessionInfoService.hostFindByUuid(uuId);
        const room: CatchGame = (await host.room) as CatchGame;
        this.server.to(room.room_id.toString()).emit('end', { result: true });
        const players = await room.players;
        if (players !== null) {
            for (const player of players) {
                this.playerDisconnect(player.uuid);
            }
        }
        //DB에서 호스트 제거
        await this.sessionInfoService.hostDelete(uuId);
    }

    async hostDisconnect(uuId: string) {
        Logger.log('호스트 접속 해제 : ' + uuId);
        this.cleanRoomByHostUuid(uuId);
        const host_socket = this.uuidToSocket.get(uuId);
        host_socket.disconnect();
        this.uuidToSocket.delete(uuId);
    }

    async playerDisconnect(uuId: string) {
        Logger.log('플레이어 접속 종료: ', uuId);

        const player_socket = this.uuidToSocket.get(uuId);
        await this.sessionInfoService.catchGamePlayerDelete(uuId);

        if (player_socket !== null) {
            player_socket.disconnect();
        }
        this.uuidToSocket.delete(uuId);
    }

    //호스트 접속, 방생성
    @UseGuards(SessionGuardWithDB)
    @SubscribeMessage('make_room')
    async makeRoom(
        client: SocketExtension,
        //게임 종류, 참여자 수, 정답, 호스트 정보
        payload: {
            game_type: string;
            user_num: number;
            answer: string;
            hostInfo: User;
        },
    ) {
        const { game_type, user_num, answer, hostInfo } = payload;
        const uuId = client.handshake.query.uuId.toString();
        Logger.log('캐치게임 방 생성 로그: ', uuId);
        this.clientsLastActivity.set(uuId.toString(), {
            lastActivity: Date.now(),
        });

        Logger.log({
            host_name: hostInfo.nickname,
            room_id: hostInfo.id,
            game_type: game_type,
            user_num: user_num,
            answer: answer,
        });
        if ((await this.sessionInfoService.catchGameRoomFindByRoomId(hostInfo.id)) !== null) {
            Logger.log('방을 재생성 합니다.');
            const host = await this.sessionInfoService.hostFindByRoomId(hostInfo.id);
            await this.cleanRoomByHostUuid(host.uuid);
        }

        // 호스트 생성
        const host = new Host();
        host.uuid = client.handshake.query.uuId.toString();
        host.host_id = client.hostInfo.id;

        //캐치마인드 세션 생성
        const catchGame: CatchGame = new CatchGame();
        catchGame.room_id = hostInfo.id;
        catchGame.status = 'wait';
        catchGame.user_num = user_num;
        catchGame.current_user_num = 0;
        catchGame.ans = answer;

        Logger.log('방 생성', host);

        Logger.log({
            host_name: hostInfo.nickname,
            host_id: hostInfo.id,
            room_id: hostInfo.id,
            user_num: catchGame.user_num,
            answer: catchGame.ans,
            current_user_num: catchGame.current_user_num,
            status: catchGame.status,
        });

        host.room = Promise.resolve(catchGame);
        await this.sessionInfoService.hostSave(host);

        client.emit('make_room', { result: true, message: '방 생성 성공' });
    }

    //todo => 게임 시작버튼을 누를 시 access_token 토큰 필요
    //게임 시작
    @UseGuards(SessionGuardWithDB)
    @SubscribeMessage('start_catch_game')
    async startCatchGame(client: Socket) {
        const uuid = client.handshake.query.uuId.toString();
        const room: CatchGame = (await (await this.sessionInfoService.hostFindByUuid(uuid)).room) as CatchGame;

        Logger.log('start_catch_game:' + room.room_id);

        //게임 시작상태로 변경
        room.status = 'playing';
        await this.sessionInfoService.catchGameRoomSave(room);
        // 이제 호스트는 3,2,1 숫자를 세고 본 게임을 시작하게 된다.
        client.emit('start_catch_game', { result: true });
        this.server.to(room.room_id.toString()).emit('start_catch_game', { result: true });

        this.clientsLastActivity.set(uuid.toString(), {
            lastActivity: Date.now(),
        });
    }

    //유저 ready
    @SubscribeMessage('ready')
    async ready(client: Socket, payload: { room_id: string; nickname: string }) {
        this.lock.acquire('ready', async () => {
            const uuId = client.handshake.query.uuId.toString();
            const { room_id, nickname } = payload;
            if (room_id === undefined || nickname === undefined) {
                Logger.log(room_id);
                Logger.warn(`room_id: ${client.id} ready: 유효하지 않은 요청입니다.`);
                return;
            }

            const room: CatchGame = await this.sessionInfoService.catchGameRoomFindByRoomId(Number(room_id));

            if (room !== null) {
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
            const player: CatchPlayer = new CatchPlayer();

            try {
                player.uuid = uuId;
                player.name = nickname;
                player.room = Promise.resolve(room);
                await this.sessionInfoService.catchGamePlayerInsert(player);
            } catch (error) {
                Logger.warn('이미 참가중입니다.');
                client.emit('ready', {
                    result: false,
                    message: '이미 참가중입니다.',
                });
                return;
            }

            Logger.log(
                '게임 참가자: ' +
                    nickname +
                    ' 룸 번호: ' +
                    room_id +
                    ' 총 참가 인원: ' +
                    room.user_num +
                    ' 현재 참가 인원: ' +
                    room.current_user_num,
            );

            // 마지막 활동시간 갱신
            this.clientsLastActivity.set(uuId, {
                lastActivity: Date.now(),
            });

            // 방에 참가
            Logger.log(nickname + ': ' + room_id + '에 게임 참가: ');
            room.current_user_num++;
            await this.sessionInfoService.catchGameRoomSave(room);

            client.join(room_id.toString());
            client.emit('ready', {
                result: true,
                message: '게임에 참가하였습니다.',
            });

            // 호스트에게 플레이어 추가 알림
            const hostSocket = this.uuidToSocket.get((await room.host).uuid.toString());
            hostSocket.emit('player_list_add', {
                player_cnt: room.current_user_num,
                nickname: nickname,
            });
        });
    }

    //정답 제출
    @SubscribeMessage('throw_catch_answer')
    async throwCatchAnswer(client: Socket, payload: { room_id: string; ans: string }) {
        const { ans, room_id } = payload;
        const uuId = client.handshake.query.uuId.toString();
        this.clientsLastActivity.set(uuId.toString(), {
            lastActivity: Date.now(),
        });

        const player: CatchPlayer = await this.sessionInfoService.catchGamePlayerFindByUuid(uuId);
        if (player === null || player.room === null) {
            Logger.warn(
                `room_id: ${room_id}, uuid ${uuId} 플레이어 또는 플레이어가 속한 방이 없습니다.`,
                'throw_catch_answer',
            );
            return;
        }

        const room: CatchGame = (await player.room) as CatchGame;
        const host: Host = await room.host;

        //================================================================================================

        Logger.log('게임 상태' + room.status);
        if (room.status !== 'playing') {
            Logger.warn('게임이 시작되지 않았습니다.');
            return;
        }
        const hostuuid = host.uuid;
        Logger.log('정답 입력방 확인 호스트 UUID: ', hostuuid);
        const hostSocket = this.uuidToSocket.get(hostuuid);
        if (ans === room.ans) {
            Logger.log('정답: ' + ans);
            room.status = 'end';

            hostSocket.emit('correct', {
                result: true,
                answer: room.ans,
                nickname: player.name,
            });
            this.server.to(room.room_id.toString()).emit('correct', {
                result: true,
                answer: room.ans,
                nickname: player.name,
            });
        } else {
            Logger.log('틀림: ' + ans);
            hostSocket.emit('incorrect', {
                result: true,
                incorrectAnswer: ans,
                nickname: player.name,
            });
            client.emit('incorrect', {
                message: '땡!',
            });
        }
        await this.sessionInfoService.catchGameRoomSave(room);
    }

    //================================================================================================

    //감정 표현
    @SubscribeMessage('express_emotion')
    async expressEmotion(client: Socket, payload: { room_id: string; emotion: string }) {
        const { emotion } = payload;
        const uuId = client.handshake.query.uuId.toString();

        const player: CatchPlayer = await this.sessionInfoService.catchGamePlayerFindByUuid(uuId);
        if (!player) {
            Logger.warn(`uuid ${uuId}에 대한 플레이어가 존재하지 않습니다.`, 'express_emotion');
            return;
        }
        const room: CatchGame = (await player.room) as CatchGame;
        if (!room) {
            Logger.warn(`uuid ${uuId}가 속한 방이 없습니다.`, 'express_emotion');
            return;
        }
        const host: Host = await room.host;
        if (!host) {
            Logger.warn(`uuid ${uuId}가 속한 방의 호스트가 없습니다.`, 'express_emotion');
            return;
        }

        this.clientsLastActivity.set(uuId, {
            lastActivity: Date.now(),
        });

        if (player === null || emotion === undefined) {
            Logger.warn(`uuid ${uuId}가 전송한 감정표현이 없습니다.`, 'express_emotion');
            return;
        }

        // Logger.log('게임 상태' + room.status);

        const hostuuid = host.uuid;
        const hostSocket = this.uuidToSocket.get(hostuuid);
        // Logger.log('감정 표현: ' + emotion);
        hostSocket.emit('express_emotion', {
            emotion: emotion,
            // nickname: clientEntity.nickname,
        });
    }

    //캐치 마인드 게임 종료
    @UseGuards(SessionGuardWithoutDB)
    @SubscribeMessage('end_game')
    async end(client: Socket, payload: { room_id: string }) {
        const { room_id } = payload;
        const room: CatchGame = await this.sessionInfoService.catchGameRoomFindByRoomId(Number(room_id));
        const uuid = client.handshake.query.uuId.toString();

        // 방이 존재하는 경우 제거
        if (room_id === undefined || room === null) {
            client.emit('end', {
                result: false,
                message: '방이 존재하지 않습니다.',
            });
            return;
        }

        this.hostDisconnect(uuid);
    }

    //캐치 마인드 정답 설정 (호스트만 가능)
    @UseGuards(SessionGuardWithDB)
    @SubscribeMessage('set_catch_answer')
    async setCatchAnswer(client: Socket, payload: { room_id: string; ans: string }) {
        const { room_id, ans } = payload;
        const room: CatchGame = await this.sessionInfoService.catchGameRoomFindByRoomId(Number(room_id));
        const hostUuid = (await room.host).uuid.toString();
        const hostSocket = this.uuidToSocket.get(hostUuid);
        if (room === null) {
            client.emit('set_catch_answer', {
                type: 'not_found_room',
                message: '방이 존재하지 않습니다.',
            });
            return;
        }
        this.clientsLastActivity.set(hostUuid, {
            lastActivity: Date.now(),
        });

        if (room.status !== 'wait') {
            Logger.warn('게임이 이미 시작되었습니다.');
            client.emit('set_catch_answer', {
                type: 'already_started',
                message: '게임이 이미 시작되었습니다.',
            });
            Logger.log('정답:', room.ans);
            return;
        }

        room.ans = ans;
        this.sessionInfoService.catchGameRoomSave(room);
        Logger.log(room_id + '번방 정답 설정: ' + ans);
        hostSocket.emit('set_catch_answer', { type: 'answer_success', answer: ans });
        client.emit('set_catch_answer', { type: 'answer_success', answer: ans });
    }

    @UseGuards(SessionGuardWithoutDB)
    @SubscribeMessage('draw')
    handleDraw(client: any, canvasData: any): void {
        // 클라이언트로 그림 데이터 및 캔버스 정보 전송
        // Logger.log('draw: 헀다');
        try {
            const { room_id } = canvasData;
            this.server.to(room_id.toString()).emit('draw', canvasData);
        } catch (error) {}
    }

    @UseGuards(SessionGuardWithoutDB)
    @SubscribeMessage('clear_draw')
    clearDraw(client: any, payload: { room_id: number }): void {
        // 클라이언트로 그림 데이터 및 캔버스 정보 전송
        // Logger.log('draw: 지우기');
        try {
            const { room_id } = payload;
            this.server.to(room_id.toString()).emit('clear_draw', { result: true });
        } catch (error) {}
    }

    onModuleInit() {
        setInterval(() => {
            this.checkInactiveClients();
        }, 4000);
    }
}

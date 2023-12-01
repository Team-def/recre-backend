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
import { SessionGuard } from './session.guard';
import { SessionInfoService } from 'src/session-info/session-info.service';
import { CatchPlayer } from 'src/session-info/entities/catch.player.entitiy';
import { Host } from 'src/session-info/entities/host.entity';
import { CatchGame } from 'src/session-info/entities/catch.game.entity';
import { SocketExtension } from './socket.extension';
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

    // 소켓 접속
    async handleConnection(client: Socket) {
        const uuId = client.handshake.query.uuId.toString();
        console.log('캐치게임 클라이언트 접속 로그: ', uuId);
        if (uuId === undefined) {
            client.disconnect();
            return;
        }

        if (!this.uuidToSocket.has(uuId)) {
            //신규 접속자
            console.log('신규 접속자');
            this.uuidToSocket.set(uuId, client);
        } else {
            //기존 접속자
            console.log('기존 접속자');
            const oldSocket = this.uuidToSocket.get(uuId.toString());
            if (oldSocket !== null) oldSocket.disconnect();
            const player: CatchPlayer = await this.sessionInfoService.catchGamePlayerFindByUuid(uuId);
            // console.log("player: "+player);
            if (player) {
                client.join(player.room.toString());
            }
            this.uuidToSocket.set(uuId, client);
        }
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

        // console.log(this.clientsLastActivity.size)
        this.clientsLastActivity.forEach(async (client, uuId) => {
            // console.log(client, clientId);
            const currentTime = Date.now();
            const lastActivityTime = client.lastActivity;

            if (currentTime - lastActivityTime > timeout) {
                const clientSocket = this.uuidToSocket.get(uuId);
                const host: Host = await this.sessionInfoService.hostFindByUuid(uuId);
                //호스트의 경우 자동 접속해제 해제
                if (host !== null) {
                    console.log('호스트 접속 종료: ', host);
                    this.hostDisconnect(uuId, false);
                    return;
                }
                if (clientSocket !== null) {
                    clientSocket.emit('forceDisconnect', 'Inactive for too long'); //deprecated
                }
                this.playerDisconnect(uuId);
            }
        });
    }

    @SubscribeMessage('leave_game')
    async leaveGame(client: Socket) {
        Logger.log('캐치 플레이어 leave: ' + client.handshake.query.uuId);

        const uuid = client.handshake.query.uuId.toString();
        const player: CatchPlayer = await this.sessionInfoService.catchGamePlayerFindByUuid(uuid);
        if (!player) {
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

    async hostDisconnect(uuId: string, roomRefresh: boolean) {
        Logger.log('호스트 접속 해제 : ' + uuId);
        const host_socket = this.uuidToSocket.get(uuId);
        const host: Host = await this.sessionInfoService.hostFindByUuid(uuId);
        const room: CatchGame = (await host.room) as CatchGame;
        const players = await room.players;
        if (players !== null) {
            for (const player of players) {
                this.playerDisconnect(player.uuid);
            }
        }
        //호스트 제거
        await this.sessionInfoService.hostDelete(uuId);

        if (roomRefresh !== true) {
            host_socket.disconnect();
            this.uuidToSocket.delete(uuId);
        }
    }

    async playerDisconnect(uuId: string) {
        console.log('플레이어 접속 종료: ', uuId);
        // const uuId = this.socketTouuid.get(client.id)

        const player_socket = this.uuidToSocket.get(uuId);
        await this.sessionInfoService.catchGamePlayerDelete(uuId);

        if (player_socket !== null) {
            player_socket.emit('end', { result: true });
            player_socket.disconnect();
        }
        this.uuidToSocket.delete(uuId);
    }

    //호스트 접속, 방생성
    @UseGuards(SessionGuard)
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
        console.log('캐치게임 방 생성 로그: ', uuId);
        this.clientsLastActivity.set(uuId.toString(), {
            lastActivity: Date.now(),
        });

        Logger.log('make_room: authoriaztion success');
        Logger.log({
            host_name: hostInfo.nickname,
            room_id: hostInfo.id,
            game_type: game_type,
            user_num: user_num,
            answer: answer,
        });
        if ((await this.sessionInfoService.catchGameRoomFindByRoomId(hostInfo.id)) !== null) {
            // this.destroyCatchGame(Number(hostInfo.id));
            Logger.log('이미 존재하는 방입니다.');
            const host = await this.sessionInfoService.hostFindByRoomId(hostInfo.id);
            await this.hostDisconnect(host.uuid, true);
            // await this.sessionInfoService.hostDelete(host.uuid);
        }
        console.log('왔니');

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

        console.log('방 생성', host);

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
    @UseGuards(SessionGuard)
    @SubscribeMessage('start_catch_game')
    async startCatchGame(client: Socket, payload: { hostInfo: User }) {
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
        const uuId = client.handshake.query.uuId.toString();
        const { room_id, nickname } = payload;
        if (
            room_id === undefined ||
            nickname === undefined ||
            (await this.sessionInfoService.catchGamePlayerFindByUuid(uuId)) !== null
        ) {
            console.log(room_id);
            Logger.warn(`room_id: ${client.id} ready: invalid room_id or nickname`);
            return;
        }

        const room: CatchGame = await this.sessionInfoService.catchGameRoomFindByRoomId(Number(room_id));

        this.clientsLastActivity.set(uuId, {
            lastActivity: Date.now(),
        });

        if (room.status !== 'wait') {
            console.log('게임이 이미 시작되었습니다.');
            client.emit('ready', {
                result: false,
                message: '게임이 이미 시작되었습니다.',
            });
            return;
        }

        const player: CatchPlayer = await this.sessionInfoService.catchGamePlayerFindByUuid(uuId);

        if (player !== null) {
            Logger.log('이미 참가중입니다.');
            client.emit('ready', {
                result: false,
                message: '이미 참가중입니다.',
            });
            return;
        }

        if (room != null) {
            if (room.current_user_num === room.user_num) {
                Logger.log(room.current_user_num + '번 방이 꽉 찼습니다.');
                client.emit('ready', {
                    result: false,
                    message: '방이 꽉 찼습니다.',
                });
                return;
            }
            Logger.log(nickname + ': ' + room_id + '에 게임 참가: ');
            room.current_user_num++;
            await this.sessionInfoService.catchGameRoomSave(room);

            //플레이어 생성
            const player: CatchPlayer = new CatchPlayer();
            player.uuid = uuId;
            player.name = nickname;
            player.room = Promise.resolve(room);
            await this.sessionInfoService.catchGamePlayerSave(player);

            client.join(room_id.toString());
            client.emit('ready', {
                result: true,
                message: '게임에 참가하였습니다.',
            });
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
        const hostSocket = this.uuidToSocket.get((await room.host).uuid.toString());
        hostSocket.emit('player_list_add', {
            player_cnt: room.current_user_num,
            nickname: nickname,
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
            console.log(room_id, '정답을 보낼 수 없습니다..');
            return;
        }

        const room: CatchGame = (await player.room) as CatchGame;
        const host: Host = await room.host;

        //================================================================================================

        Logger.log('게임 상태' + room.status);
        if (room.status !== 'playing') {
            return;
        }
        const hostuuid = host.uuid;
        console.log('정답 입력방 확인 호스트 UUID: ', hostuuid);
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
        const room: CatchGame = (await player.room) as CatchGame;
        const host: Host = await room.host;

        this.clientsLastActivity.set(uuId, {
            lastActivity: Date.now(),
        });

        if (player === null || emotion === undefined) {
            return;
        }

        Logger.log('게임 상태' + room.status);

        const hostuuid = host.uuid;
        const hostSocket = this.uuidToSocket.get(hostuuid);
        Logger.log('감정 표현: ' + emotion);
        hostSocket.emit('express_emotion', {
            emotion: emotion,
            // nickname: clientEntity.nickname,
        });
    }

    private async destroyCatchGame(room_id: number) {
        const room = await this.sessionInfoService.catchGameRoomFindByRoomId(room_id);
        const host = await room.host;

        const hostuuid = host.uuid;

        // 게임 종료
        this.server.to(room_id.toString()).emit('end', {
            result: true,
            answer: room.ans,
        });

        for (const player of (await room.players) as CatchPlayer[]) {
            Logger.log('게임 종료: ' + player);
            this.playerDisconnect(player.uuid); // 캐치 게임 종료시 플레이어 접속 종료
        }
    }

    //캐치 마인드 게임 종료
    // @UseGuards(SessionGuard)
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

        this.hostDisconnect(uuid, false);
    }

    //캐치 마인드 정답 설정 (호스트만 가능)
    @UseGuards(SessionGuard)
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

        console.log('정답 입력 로그: ', hostUuid);

        if (room.status !== 'wait') {
            console.log('게임이 이미 시작되었습니다.');
            client.emit('set_catch_answer', {
                type: 'already_started',
                message: '게임이 이미 시작되었습니다.',
            });
            console.log('정답:', room.ans);
            return;
        }

        room.ans = ans;
        this.sessionInfoService.catchGameRoomSave(room);
        Logger.log(room_id + '번방 정답 설정: ' + ans);
        hostSocket.emit('set_catch_answer', { type: 'answer_success', answer: ans });
        client.emit('set_catch_answer', { type: 'answer_success', answer: ans });
    }

    // syncGameRoomInfo() {
    //     for (let room of this.catchGameRoom.values()) {
    //         const host_socket = this.uuidToclientEntity.get(room.host).clientSocket;
    //         host_socket.emit('player_list_add', {
    //             player_cnt: value.current_user_num,
    //             nickname: null,
    //         Logger.log('게임 종료: ' + uuId);
    //         this.custumDisconnect(this.uuidToclientEntity.get(uuId).clientSocket);  //캐치 게임 종료시 플레이어 접속 종료
    //     }

    //     this.catchGameRoom.forEach((value, key) => {
    //         const hostuuid = this.roomIdToHostId.get(key);
    //         const host = this.uuidToclientEntity.get(hostuuid).clientSocket;

    //         });
    //     });
    // }

    // @UseGuards(SessionGuard)
    @SubscribeMessage('draw')
    handleDraw(client: any, canvasData: any): void {
        // 클라이언트로 그림 데이터 및 캔버스 정보 전송
        // Logger.log('draw: 헀다');
        try {
            const { room_id } = canvasData;
            this.server.to(room_id.toString()).emit('draw', canvasData);
        } catch (error) {}
    }

    // @UseGuards(SessionGuard)
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
        // setInterval(() => {
        //     this.syncGameRoomInfo();
        // }, 3000);
        // setInterval(() => {
        //     this.checkInactiveClients();
        // }, 4000);
    }
}

import { Logger, UseGuards } from '@nestjs/common';

import {
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';
import { User } from 'src/user/entities/user.entity';
import { Catch } from './game/catch';
import { ClientEntity } from './cliententity/client.entity';
import { SessionGuard } from './session.guard';

@WebSocketGateway({
    transports: ['websocket'],
    pingInterval: 3000,
    pingTimeout: 10000,
    cookie: false,
    serveClient: false,
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 1000,
})
export class SessionGateway implements OnGatewayConnection, OnGatewayDisconnect {
    constructor() {}
    @WebSocketServer()
    server: Server;

    // <uuid, socket> 접속된 전체 소켓
    private connectedSockets: Map<string, Socket> = new Map();

    // < uuid, 최근활동 시간 > 인터벌로 체크할 클라이언트들
    private readonly clientsLastActivity: Map<string, { lastActivity: number }> = new Map();

    // < room_id, uuid >, 방 번호로 호스트 조회
    private roomIdToHostId: Map<number, string> = new Map();

    // <uuid, clientEntity>, uuid 로 클라이언트 정보 접근
    private uuidToclientEntity: Map<string, ClientEntity> = new Map();

    // < socket, uuid > 소켓으로 uuid 접근
    private socketTouuid: Map<string, string> = new Map();

    //<룸 아이디, 플레이어 uuid[] > 룸 아이디로 플레이어 세트 조회
    private roomidToPlayerSet: Map<number, Set<string>> = new Map();

    // 룸 아이디, 캐치마인드 세션
    private catchGameRoom: Map<number, Catch> = new Map();

    // 소켓 접속
    handleConnection(client: Socket) {
        // console.log(client.handshake.query.aaa);
        const uuId = client.handshake.query.uuId;
        console.log('클라이언트 접속 로그: ', uuId);
        if (uuId === undefined) {
            client.disconnect();
            return;
        }

        if (!this.uuidToclientEntity.has(uuId.toString())) {
            Logger.log('새로운 클라이언트 접속: ' + uuId.toString());
            const clientEntity = new ClientEntity();

            clientEntity.nickname = '';
            clientEntity.roomId = -1;
            clientEntity.gameType = '';
            clientEntity.roles = '';
            clientEntity.clientSocket = client;

            // uuid 클라이언트 엔티티 연결
            this.uuidToclientEntity.set(uuId.toString(), clientEntity);
            // 소켓 uuid 연결
            this.socketTouuid.set(client.id, uuId.toString());
        } else {
            Logger.log('기존 클라이언트 접속: ' + uuId.toString());
            const clientEntity = this.uuidToclientEntity.get(uuId.toString());

            // 기존 클라이언트 연결 종료
            try {
                clientEntity.clientSocket.disconnect();
            } catch (error) {
                Logger.log(error.message);
            }
            clientEntity.clientSocket = client;

            // 기존에 클라이언트가 속해 있었던 룸이 있다면 재연결
            if (clientEntity.roomId !== -1) client.join(clientEntity.roomId.toString());
            this.socketTouuid.set(client.id, uuId.toString());
        }

        this.clientsLastActivity.set(uuId.toString(), {
            lastActivity: Date.now(),
        });
        this.connectedSockets.set(uuId.toString(), client);
    }

    handleDisconnect(client: Socket) {
        Logger.log(`클라이언트 접속 해제: ${client.id}`);
        const uuId = this.socketTouuid.get(client.id);
        // 즉시 제거되도 되는 클라이언트
        console.log(uuId);
        if (uuId === undefined) return;

        //게임에 참여하지 않은 플레이어 접속 종료
        const clientEntity = this.uuidToclientEntity.get(uuId);
        if (clientEntity.roomId === -1) {
            this.socketTouuid.delete(client.id);
            return;
        }

        if (this.uuidToclientEntity.get(uuId).clientSocket === client) {
          this.uuidToclientEntity.get(uuId).clientSocket = null;
        }
        this.socketTouuid.delete(client.id);
        this.connectedSockets.delete(client.id);
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
                const clientEntity = this.uuidToclientEntity.get(uuId);
                //호스트의 경우 자동 접속해제 해제
                if (clientEntity.roles === 'host') {
                    // console.log("호스트 접속 종료: ", clientId);
                    // this.end(clientEntity.clientSocket, { room_id: clientEntity.roomId.toString() });
                    return;
                }
                if (clientEntity.clientSocket !== null) {
                    clientEntity.clientSocket.emit('forceDisconnect', 'Inactive for too long'); //deprecated
                }
                this.custumDisconnect(uuId);
            }
        });
    }

    @SubscribeMessage('leave_game')
    leaveGame(client: Socket) {
        const uuId = this.socketTouuid.get(client.id);
        this.custumDisconnect(uuId);
    }

    custumDisconnect(uuId: string) {
        console.log('커스텀 접속 종료: ', uuId);
        // const uuId = this.socketTouuid.get(client.id)

        const client = this.uuidToclientEntity.get(uuId).clientSocket;

        if (this.uuidToclientEntity.get(uuId) === undefined) return;
        if (this.roomidToPlayerSet.has(this.uuidToclientEntity.get(uuId).roomId)) {
            this.roomidToPlayerSet.get(this.uuidToclientEntity.get(uuId).roomId).delete(uuId.toString());
        }

        //클라이언트
        const catchGame = this.catchGameRoom.get(this.uuidToclientEntity.get(uuId).roomId);
        if (catchGame !== undefined && catchGame.status === 0) {
            catchGame.current_user_num--;
            const hostuuid = this.roomIdToHostId.get(this.uuidToclientEntity.get(uuId).roomId);
            const host = this.uuidToclientEntity.get(hostuuid).clientSocket;
            const enstity = this.uuidToclientEntity.get(uuId);
            Logger.log('게임 참가자 나감: ' + uuId);
            Logger.log(
                '게임 참가자: ' +
                    enstity.nickname +
                    ' 룸 번호: ' +
                    enstity.roomId +
                    ' 총 참가 인원: ' +
                    catchGame.current_user_num,
            );
            
            Logger.log('host: ' + host, 'custumDisconnect');
            host.emit('player_list_remove', {
                player_cnt: catchGame.current_user_num,
                nickname: enstity.nickname,
            });
        }

        // const client = this.uuidToclientEntity.get(uuId).clientSocket;
        if (client !== null) {
            client.emit('leave_game', { result: true });
            client.disconnect();
        }
        this.dellConnectionInfo(uuId);
    }

    //호스트 접속, 방생성
    @UseGuards(SessionGuard)
    @SubscribeMessage('make_room')
    async makeRoom(
        client: Socket,
        //게임 종류, 참여자 수, 정답, 호스트 정보
        payload: {
            game_type: string;
            user_num: number;
            answer: string;
            hostInfo: User;
        },
    ) {
        const { game_type, user_num, answer, hostInfo } = payload;
        const uuId = client.handshake.query.uuId;
        const clientEntity = this.uuidToclientEntity.get(uuId.toString());
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
        const hostuuid = this.roomIdToHostId.get(hostInfo.id);
        if (hostuuid) {
            const hostentity = this.uuidToclientEntity.get(hostuuid);
            hostentity.clientSocket = client;
            this.destroyCatchGame(Number(hostInfo.id));
        }

        clientEntity.roomId = hostInfo.id;
        clientEntity.gameType = game_type;
        clientEntity.roles = 'host';
        //캐치마인드 세션 생성
        const catchGame = new Catch(hostInfo.id, hostInfo.nickname, payload.user_num, payload.answer, 0, 0);
        console.log('방 생성 로그2: ', uuId);

        Logger.log({
            host_name: hostInfo.nickname,
            host_id: catchGame.host,
            room_id: catchGame.roomID,
            game_type: game_type,
            user_num: catchGame.user_num,
            answer: catchGame.correctAnswer,
            current_user_num: catchGame.current_user_num,
            status: catchGame.status,
        });

        //캐치 마인드 세션에 등록
        this.catchGameRoom.set(hostInfo.id, catchGame);
        //게임 진행중인 호스트 정보 등록
        this.roomIdToHostId.set(hostInfo.id, uuId.toString());
        //플레이어 리스트 세트 생성
        this.roomidToPlayerSet.set(hostInfo.id, new Set<string>());

        client.emit('make_room', { result: true, message: '방 생성 성공' });
    }

    //todo => 게임 시작버튼을 누를 시 access_token 토큰 필요
    //게임 시작
    @UseGuards(SessionGuard)
    @SubscribeMessage('start_catch_game')
    startCatchGame(client: Socket, payload: { hostInfo: User }) {
        const room_id = payload.hostInfo.id.toString();
        const hostuuid = this.roomIdToHostId.get(Number(room_id));
        this.clientsLastActivity.set(hostuuid.toString(), {
            lastActivity: Date.now(),
        });

        Logger.log('start_catch_game:' + room_id + ' ' + this.roomIdToHostId.get(Number(room_id)));
        Logger.log(typeof room_id);
        const room = this.catchGameRoom.get(Number(room_id));
        //게임 시작 상태로 변경
        room.status = 1;
        this.server.to(room_id.toString()).emit('start_catch_game', { result: true });
        client.emit('start_catch_game', { result: true });
        // return { result: true };
    }

    //유저 ready
    @SubscribeMessage('ready')
    async ready(client: Socket, payload: { room_id: string; nickname: string }) {
        const { room_id, nickname } = payload;
        if (room_id === undefined || nickname === undefined || !this.catchGameRoom.has(Number(room_id))) {
            console.log(room_id);
            Logger.warn(`room_id: ${client.id} ready: invalid room_id or nickname`);
            return;
        }

        const room = this.catchGameRoom.get(Number(room_id));
        const uuId = this.socketTouuid.get(client.id);
        this.clientsLastActivity.set(uuId.toString(), {
            lastActivity: Date.now(),
        });

        if (room.status !== 0) {
            console.log('게임이 이미 시작되었습니다.');
            client.emit('ready', {
                result: false,
                message: '게임이 이미 시작되었습니다.',
            });
            return;
        }

        const clientEntity = this.uuidToclientEntity.get(uuId);
        if (clientEntity.roomId !== -1) {
            Logger.log('이미 참가중입니다.');
            client.emit('ready', {
                result: false,
                message: '이미 참가중입니다.',
            });
            return;
        }

        if (room) {
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
            clientEntity.roomId = Number(room_id);
            clientEntity.nickname = nickname;
            this.roomidToPlayerSet.get(Number(room_id)).add(uuId.toString());
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
        const hostuuid = this.roomIdToHostId.get(Number(room_id));
        const host = this.uuidToclientEntity.get(hostuuid).clientSocket;
        host.emit('player_list_add', {
            player_cnt: room.current_user_num,
            nickname: nickname,
        });
    }

    //정답 제출
    @SubscribeMessage('throw_catch_answer')
    async throwCatchAnswer(client: Socket, payload: { room_id: string; ans: string }) {
        const { ans } = payload;
        const uuId = this.socketTouuid.get(client.id);
        const clientEntity = this.uuidToclientEntity.get(uuId);
        this.clientsLastActivity.set(uuId.toString(), {
            lastActivity: Date.now(),
        });

        if (clientEntity.roomId === 0 || ans === undefined || !this.catchGameRoom.has(clientEntity.roomId)) {
            return;
        }
        const room = this.catchGameRoom.get(clientEntity.roomId);
        Logger.log('게임 상태' + room.status);
        if (room.status !== 1) {
            return;
        }
        const hostuuid = this.roomIdToHostId.get(clientEntity.roomId);
        console.log('정답 입력방 확인 호스트 UUID: ', hostuuid);
        const host = this.uuidToclientEntity.get(hostuuid).clientSocket;
        if (ans === room.correctAnswer) {
            Logger.log('정답: ' + ans);
            room.status = 2;

            host.emit('correct', {
                result: true,
                answer: room.correctAnswer,
                nickname: clientEntity.nickname,
            });
            this.server.to(clientEntity.roomId.toString()).emit('correct', {
                result: true,
                answer: room.correctAnswer,
                nickname: clientEntity.nickname,
            });
        } else {
            Logger.log('틀림: ' + ans);
            host.emit('incorrect', {
                result: true,
                incorrectAnswer: ans,
                nickname: clientEntity.nickname,
            });
            client.emit('incorrect', {
                message: '땡!',
            });
        }
    }

    //감정 표현
    @SubscribeMessage('express_emotion')
    async expressEmotion(client: Socket, payload: { room_id: string; emotion: string }) {
        const { emotion } = payload;
        const uuId = this.socketTouuid.get(client.id);
        const clientEntity = this.uuidToclientEntity.get(uuId);
        this.clientsLastActivity.set(uuId.toString(), {
            lastActivity: Date.now(),
        });

        if (clientEntity.roomId === 0 || emotion === undefined || !this.catchGameRoom.has(clientEntity.roomId)) {
            return;
        }
        const room = this.catchGameRoom.get(clientEntity.roomId);
        Logger.log('게임 상태' + room.status);

        const hostuuid = this.roomIdToHostId.get(clientEntity.roomId);
        const host = this.uuidToclientEntity.get(hostuuid).clientSocket;
        Logger.log('감정 표현: ' + emotion);
        host.emit('express_emotion', {
            emotion: emotion,
            // nickname: clientEntity.nickname,
        });
    }

    private destroyCatchGame(room_id: number) {
        const hostuuid = this.roomIdToHostId.get(room_id);
        const host = this.uuidToclientEntity.get(hostuuid).clientSocket;

        Logger.debug(room_id, `destroyCatchGame`);

        //게임 종료
        this.server.to(room_id.toString()).emit('end', {
            result: true,
            answer: this.catchGameRoom.get(room_id).correctAnswer,
        });

        for (let uuId of this.roomidToPlayerSet.get(room_id)) {
            Logger.log('게임 종료: ' + uuId);
            this.custumDisconnect(uuId); //캐치 게임 종료시 플레이어 접속 종료
        }

        this.catchGameRoom.delete(room_id);
        this.roomIdToHostId.delete(room_id);
    }

    //캐치 마인드 게임 종료
    // @UseGuards(SessionGuard)
    @SubscribeMessage('end_game')
    async end(client: Socket, payload: { room_id: string }) {
        const { room_id } = payload;

        // 방이 존재하는 경우 제거
        if (room_id === undefined || !this.catchGameRoom.has(Number(room_id))) {
            client.emit('end', {
                result: false,
                message: '방이 존재하지 않습니다.',
            });
            return;
        }

        console.log('캐치 게임 종료: ', room_id);
        this.destroyCatchGame(Number(room_id));

        // const room = this.catchGameRoom.get(Number(room_id));
        // room.current_user_num = 0;

        // if (room) {
        //     room.status = 2;

        //     this.server
        //         .to(room_id.toString())
        //         .emit('end', { result: true, answer: room.correctAnswer });

        //     for (let uuId of this.roomidToPlayerSet.get(Number(room_id))) {
        //         Logger.log('게임 종료: ' + uuId);
        //         this.custumDisconnect(this.uuidToclientEntity.get(uuId).clientSocket);  //캐치 게임 종료시 플레이어 접속 종료

        //     }

        // }

        // this.catchGameRoom.delete(Number(room_id));
        // this.roomIdToHostId.delete(Number(room_id));

        const uuId = this.socketTouuid.get(client.id);
        // 소켓 -> uuid 제거
        this.socketTouuid.delete(this.uuidToclientEntity.get(uuId).clientSocket.id);
        // 클라이언트 엔티티 제거 (위아래 순서 중요)
        this.uuidToclientEntity.delete(uuId);
        this.clientsLastActivity.delete(uuId);
        Logger.log('게임 종료: ' + room_id + '호스트 uuid: ' + uuId);
        client.disconnect();
    }

    //캐치 마인드 정답 설정 (호스트만 가능)
    @UseGuards(SessionGuard)
    @SubscribeMessage('set_catch_answer')
    async setCatchAnswer(client: Socket, payload: { room_id: string; ans: string }) {
        const hostuuId = this.roomIdToHostId.get(Number(payload.room_id));
        if (hostuuId === undefined) {
            client.emit('set_catch_answer', {
                type: 'not_found_room',
                message: '방이 존재하지 않습니다.',
            });
            return;
        }
        this.clientsLastActivity.set(hostuuId.toString(), {
            lastActivity: Date.now(),
        });

        console.log('정답 입력 로그: ', hostuuId);
        // const hostuuid = this.hostuuidByRoomId.get(Number(payload.room_id));
        const host = this.uuidToclientEntity.get(hostuuId).clientSocket;

        const { room_id, ans } = payload;
        const room = this.catchGameRoom.get(Number(room_id));

        if (room.status !== 0) {
            console.log('게임이 이미 시작되었습니다.');
            client.emit('set_catch_answer', {
                type: 'already_started',
                message: '게임이 이미 시작되었습니다.',
            });
            console.log('정답:', room.correctAnswer);
            return;
        }

        room.correctAnswer = ans;
        Logger.log(room_id + '번방 정답 설정: ' + ans);
        host.emit('set_catch_answer', { type: 'answer_success', answer: ans });
        client.emit('set_catch_answer', { type: 'answer_success', answer: ans });
    }

    dellConnectionInfo(uuId: string) {
        // const uuId = this.socketTouuid.get(client.id);
        const client = this.uuidToclientEntity.get(uuId).clientSocket;
        if (client !== null) this.socketTouuid.delete(client.id);
        this.uuidToclientEntity.delete(uuId);
        this.clientsLastActivity.delete(uuId);
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

        setInterval(() => {
            this.checkInactiveClients();
        }, 4000);
    }
}

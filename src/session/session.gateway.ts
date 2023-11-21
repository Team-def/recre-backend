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
import { constrainedMemory } from 'process';
import { log } from 'console';


@WebSocketGateway(5002, {
  transports: ['websocket'], pingInterval: 3000, pingTimeout: 10000, cookie: false, serveClient: false, reconnection: true,
  reconnectionAttempts: 3, reconnectionDelay: 1000,
})
export class SessionGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
  ) { }
  @WebSocketServer()
  server: Server;

  //접속된 전체 소켓
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
  handleConnection(client: Socket,) {
    // console.log(client.handshake.query.aaa);
    Logger.log(`클라이언트 접속: ${client.id}`);

    const uuId = client.handshake.query.uuId;
    if (uuId === undefined) {
      client.disconnect();
      return;
    }

    if (!this.uuidToclientEntity.has(uuId.toString())) {
      Logger.log("새로운 클라이언트 접속: " + uuId.toString());
      const clientEntity = new ClientEntity();

      clientEntity.nickname = "";
      clientEntity.roomId = -1;
      clientEntity.gameType = "";
      clientEntity.roles = "";
      clientEntity.clientSocket = client;

      // uuid 클라이언트 엔티티 연결
      this.uuidToclientEntity.set(uuId.toString(), clientEntity);
      // 소켓 uuid 연결
      this.socketTouuid.set(client.id, uuId.toString());

    } else {
      Logger.log("기존 클라이언트 접속: " + uuId.toString());
      const clientEntity = this.uuidToclientEntity.get(uuId.toString());

      // 기존 클라이언트 연결 종료
      try {
        clientEntity.clientSocket.disconnect();
      } catch (error) {
        Logger.log(error.message);
      }
      clientEntity.clientSocket = client;

      // 기존에 클라이언트가 속해 있었던 룸이 있다면 재연결
      if (clientEntity.roomId !== -1)
        client.join(clientEntity.roomId.toString());
      this.socketTouuid.set(client.id, uuId.toString());

    }

    this.clientsLastActivity.set(uuId.toString(), { lastActivity: Date.now() });
    this.connectedSockets.set(uuId.toString(), client);
  }

  handleDisconnect(client: Socket) {
    Logger.log(`클라이언트 접속 해제: ${client.id}`);
    const uuId = this.socketTouuid.get(client.id);
    // 즉시 제거되도 되는 클라이언트
    console.log(uuId);
    if (uuId === undefined)
      return

    //게임에 참여하지 않은 플레이어 접속 종료
    const clientEntity = this.uuidToclientEntity.get(uuId);
    if (clientEntity.roomId === -1) {
      this.socketTouuid.delete(client.id);
      return;
    }

    //현재 세션 상태 0: 대기중, 1: 게임중, 2: 게임 종료

    // 호스트 접속 종료

    // 플레이어 접속 종료
    const room_id = clientEntity.roomId;
    const room = this.catchGameRoom.get(room_id);
    if (room.status === 0) {
      room.current_user_num--;
      const hostuuid = this.roomIdToHostId.get(room_id);
      const host = this.uuidToclientEntity.get(hostuuid).clientSocket;
      Logger.log("플레이어 접속 해제: " + uuId);
      host.emit('player_list_remove', { player_cnt: room.current_user_num, nickname: this.uuidToclientEntity.get(uuId).nickname });
    }


    this.socketTouuid.delete(client.id);
    this.connectedSockets.delete(client.id);
  }


  checkInactiveClients() {
    // const timeout = 10 * 60 * 1000; // 10 minutes (adjust as needed)
    const timeout = 4 * 60 * 1000; // 10 minutes (adjust as needed)

    // console.log(this.clientsLastActivity.size)
    this.clientsLastActivity.forEach((client, clientId) => {
      // console.log(client, clientId);
      const currentTime = Date.now();
      const lastActivityTime = client.lastActivity;

      if (currentTime - lastActivityTime > timeout) {
        const clientEntity = this.uuidToclientEntity.get(clientId);
        if (clientEntity.roles === 'host') {
          console.log("호스트 접속 종료: ", clientId);
          this.end(clientEntity.clientSocket, { room_id: clientEntity.roomId.toString() });
          return;
        }
        clientEntity.clientSocket.emit('forceDisconnect', 'Inactive for too long');
        this.dellConnectionInfo(clientEntity.clientSocket);
        if (clientEntity.clientSocket !== null)
          clientEntity.clientSocket.disconnect();
        // this.clientsLastActivity.delete(clientId);
        // this.uuidToclientEntity.delete(clientId);
      }
    });

  }


  @SubscribeMessage('leave_game')
  custumDisconnect(client: Socket) {
    const uuId = this.socketTouuid.get(client.id);

    if (this.roomidToPlayerSet.has(this.uuidToclientEntity.get(uuId).roomId)) {
      this.roomidToPlayerSet.get(this.uuidToclientEntity.get(uuId).roomId).delete(uuId.toString());
    }

    //호스트


    //클라이언트
    const catchGame = this.catchGameRoom.get(this.uuidToclientEntity.get(uuId).roomId);
    if (catchGame !== undefined && catchGame.status === 0) {
      catchGame.current_user_num--;
      const hostuuid = this.roomIdToHostId.get(this.uuidToclientEntity.get(uuId).roomId);
      const host = this.uuidToclientEntity.get(hostuuid).clientSocket;
      const enstity = this.uuidToclientEntity.get(uuId);
      Logger.log("게임 참가자 나감: " + uuId);
      Logger.log("게임 참가자: " + enstity.nickname + " 룸 번호: " + enstity.roomId + " 총 참가 인원: " + catchGame.current_user_num);

      host.emit('player_list_remove', { player_cnt: catchGame.current_user_num, nickname: enstity.nickname });
    }

    this.dellConnectionInfo(client);
    client.disconnect();


    // Logger.log(`클라이언트 접속 해제: ${uuId}`);
    // if (uuId === undefined) {
    //   this.uuidToclientEntity.delete(uuId);
    //   client.disconnect();
    //   return
    // };
    // const clientEntity = this.uuidToclientEntity.get(uuId);
    // if (clientEntity.roomId === -1) {
    //   client.disconnect();
    //   return;
    // }
    // Logger.log(`클라이언트 접속 해제: ${client.id}`);
    // if (clientEntity.roomId !== -1) {
    //   const room_id = clientEntity.roomId;
    //   const room = this.catchGameRoom.get(room_id);
    //   if (room) {
    //     room.current_user_num--;
    //     const hostuuid = this.roomIdToHostId.get(room_id);
    //     const host = this.uuidToclientEntity.get(hostuuid).clientSocket;
    //     Logger.log("플레이어 접속 해제: " + uuId);
    //     host.emit('player_list_remove', { player_cnt: room.current_user_num, nickname: this.uuidToclientEntity.get(uuId).nickname });
    //   }
    // }
    // this.uuidToclientEntity.delete(uuId);
    // client.disconnect();
  }

  //호스트 접속, 방생성
  @UseGuards(SessionGuard)
  @SubscribeMessage('make_room')
  async makeRoom(
    client: any,
    //게임 종류, 참여자 수, 정답, 호스트 정보
    payload: { game_type: string; user_num: number, answer: string, hostInfo: User },
  ) {
    const { game_type, user_num, answer, hostInfo } = payload;
    const uuId = client.handshake.query.uuId;
    const clientEntity = this.uuidToclientEntity.get(uuId.toString());
    this.clientsLastActivity.set(uuId.toString(), { lastActivity: Date.now() });

    Logger.log('make_room: authoriaztion success');
    Logger.log({
      host_name: hostInfo.nickname,
      room_id: hostInfo.id,
      game_type: game_type,
      user_num: user_num,
      answer: answer,
    });
    if (this.roomIdToHostId.has(hostInfo.id)) {
      client.emit('make_room', { result: false, message: '이미 방이 존재합니다.' });
      return;
    }

    clientEntity.roomId = hostInfo.id;
    clientEntity.gameType = game_type;
    clientEntity.roles = 'host';
    //캐치마인드 세션 생성
    const catchGame = new Catch(hostInfo.id, hostInfo.nickname, payload.user_num, payload.answer);
    //캐치 마인드 세션에 등록
    this.catchGameRoom.set(hostInfo.id, catchGame);
    //게임 진행중인 호스트 정보 등록
    this.roomIdToHostId.set(hostInfo.id, uuId.toString());
    //플레이어 리스트 세트 생성
    this.roomidToPlayerSet.set(hostInfo.id, new Set<string>());

    client.emit('make_room', { result: true });
  }

  //todo => 게임 시작버튼을 누를 시 access_token 토큰 필요
  //게임 시작
  @UseGuards(SessionGuard)
  @SubscribeMessage('start_catch_game')
  startCatchGame(client: Socket, payload: { hostInfo: User }) {
    const room_id = payload.hostInfo.id.toString();
    const hostuuid = this.roomIdToHostId.get(Number(room_id));
    this.clientsLastActivity.set(hostuuid.toString(), { lastActivity: Date.now() });

    Logger.log('start_catch_game:' + room_id + ' ' + this.roomIdToHostId.get(Number(room_id)));
    Logger.log(typeof room_id);
    const room = this.catchGameRoom.get(Number(room_id));
    //게임 시작 상태로 변경
    room.status = 1;
    this.server.to(room_id.toString()).emit('start_catch_game', { result: true });
    client.emit("start_catch_game", { result: true });
    // return { result: true };
  }

  //유저 ready
  @SubscribeMessage('ready')
  async ready(client: Socket, payload: { room_id: string; nickname: string }) {
    const { room_id, nickname } = payload;
    if (room_id === undefined || nickname === undefined || !this.catchGameRoom.has(Number(room_id))) {
      console.log(room_id)
      Logger.warn(`room_id: ${client.id} ready: invalid room_id or nickname`);
      return;
    }

    const room = this.catchGameRoom.get(Number(room_id));
    const uuId = this.socketTouuid.get(client.id);
    this.clientsLastActivity.set(uuId.toString(), { lastActivity: Date.now() });

    const clientEntity = this.uuidToclientEntity.get(uuId);
    if (clientEntity.roomId !== -1) {
      Logger.log("이미 참가중입니다.");
      client.emit('ready', { result: false, message: '이미 참가중입니다.' });
      return;
    }

    if (room) {
      if (room.current_user_num === room.user_num) {
        Logger.log(room.current_user_num + "번 방이 꽉 찼습니다.");
        client.emit('ready', { result: false, message: '방이 꽉 찼습니다.' });
        return;
      }
      Logger.log(nickname + ": " + room_id + "에 게임 참가: ");
      room.current_user_num++;
      clientEntity.roomId = Number(room_id);
      clientEntity.nickname = nickname;
      this.roomidToPlayerSet.get(Number(room_id)).add(uuId.toString());
      client.join(room_id.toString());
      client.emit('ready', { result: true, message: '게임에 참가하였습니다.' });
    }

    Logger.log("게임 참가자: " + nickname + " 룸 번호: " + room_id + " 총 참가 인원: " +
      room.user_num + " 현재 참가 인원: " + room.current_user_num);
    const hostuuid = this.roomIdToHostId.get(Number(room_id));
    const host = this.uuidToclientEntity.get(hostuuid).clientSocket;
    host.emit('player_list_add', { player_cnt: room.current_user_num, nickname: nickname });
  }

  //정답 제출
  @SubscribeMessage('throw_catch_answer')
  async throwCatchAnswer(client: Socket, payload: { room_id: string; ans: string }) {
    const { ans } = payload;
    const uuId = this.socketTouuid.get(client.id);
    const clientEntity = this.uuidToclientEntity.get(uuId);
    this.clientsLastActivity.set(uuId.toString(), { lastActivity: Date.now() });

    if (clientEntity.roomId === 0 || ans === undefined || !this.catchGameRoom.has(clientEntity.roomId)) { return; };
    const room = this.catchGameRoom.get(clientEntity.roomId);
    Logger.log("게임 상태" + room.status);
    if (room.status !== 1) {
      return;
    }
    const hostuuid = this.roomIdToHostId.get(clientEntity.roomId);
    console.log("정답 입력방 확인 호스트 UUID: ", hostuuid);
    const host = this.uuidToclientEntity.get(hostuuid).clientSocket;
    if (ans === room.correctAnswer) {
      Logger.log("정답: " + ans);
      room.status = 2;

      host.emit('correct', { result: true, answer: room.correctAnswer, nickname: clientEntity.nickname })
      this.server.to(clientEntity.roomId.toString()).emit('correct', { result: true, answer: room.correctAnswer, nickname: clientEntity.nickname });
    } else {
      Logger.log("틀림: " + ans);
      host.emit('incorrect', { result: true, incorrectAnswer: ans, nickname: clientEntity.nickname });
    }
  }

  //캐치 마인드 게임 종료
  @SubscribeMessage('end_game')
  async end(client: Socket, payload: { room_id: string }) {
    console.log("캐치 게임 종료");
    const { room_id } = payload;
    const room = this.catchGameRoom.get(Number(room_id));
    if (room) {
      room.status = 2;
      for (let uuId of this.roomidToPlayerSet.get(Number(room_id))) {
        Logger.log("게임 종료: " + uuId);
        this.socketTouuid.delete(this.uuidToclientEntity.get(uuId).clientSocket.id);
        this.uuidToclientEntity.delete(uuId);
        this.clientsLastActivity.delete(uuId);
      }
      this.server.to(room_id.toString()).emit('end', { result: true, answer: room.correctAnswer });
      // this.server.timeout(30000).to(room_id.toString()).disconnectSockets();
      this.server.timeout(2000).emit("some-event", (err, responses) => {
        this.server.to(room_id.toString()).disconnectSockets();
        if (err) {
          // some clients did not acknowledge the event in the given delay
        } else {
          console.log(responses); // one response per client
        }
      });
      this.roomIdToHostId.delete(Number(room_id));
    }
    this.catchGameRoom.delete(Number(room_id));
    const uuId = this.socketTouuid.get(client.id);

    // 소켓 -> uuid 제거
    this.socketTouuid.delete(this.uuidToclientEntity.get(uuId).clientSocket.id);
    // 클라이언트 엔티티 제거 (위아래 순서 중요)
    this.uuidToclientEntity.delete(uuId);
    this.clientsLastActivity.delete(uuId);
    Logger.log("게임 종료: " + room_id + "호스트 uuid: " + uuId);
    client.disconnect();
  }

  //캐치 마인드 정답 설정 (호스트만 가능)
  @UseGuards(SessionGuard)
  @SubscribeMessage('set_catch_answer')
  async setCatchAnswer(client: Socket, payload: { room_id: string; ans: string }) {
    const hostuuId = this.roomIdToHostId.get(Number(payload.room_id));
    if (hostuuId === undefined) {
      client.emit('set_catch_answer', { result: false, message: '방이 존재하지 않습니다.' });
      return;
    }
    this.clientsLastActivity.set(hostuuId.toString(), { lastActivity: Date.now() });

    console.log("정답 입력 로그: ", hostuuId);
    // const hostuuid = this.hostuuidByRoomId.get(Number(payload.room_id));
    const host = this.uuidToclientEntity.get(hostuuId).clientSocket;

    const { room_id, ans } = payload;
    const room = this.catchGameRoom.get(Number(room_id));

    room.correctAnswer = ans;
    Logger.log(room_id + "번방 정답 설정: " + ans);
    host.emit('set_catch_answer', { result: true, answer: ans });
    client.emit('set_catch_answer', { result: true, answer: ans });
  }

  dellConnectionInfo(client: Socket) {
    const uuId = this.socketTouuid.get(client.id);
    this.socketTouuid.delete(client.id);
    this.uuidToclientEntity.delete(uuId);
    this.clientsLastActivity.delete(uuId);
  }

  syncGameRoomInfo(){
    this.catchGameRoom.forEach((value, key) => {
      const hostuuid = this.roomIdToHostId.get(key);
      const host = this.uuidToclientEntity.get(hostuuid).clientSocket;
      host.emit('player_list_add', { player_cnt: value.current_user_num, nickname: null });
    })
  }

  onModuleInit() {
    setInterval(() => {
      this.syncGameRoomInfo();
    }, 3000);

    setInterval(() => {
      this.checkInactiveClients();
    }, 4000);
  }
}

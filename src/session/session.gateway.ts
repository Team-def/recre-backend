import { Logger, UseGuards } from '@nestjs/common';

import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { promises } from 'dns';
import { access } from 'fs';
import { Server, Socket } from 'socket.io';
import { AuthService } from 'src/auth/auth.service';
import { User } from 'src/user/entities/user.entity';
import { UserService } from 'src/user/user.service';
import { Catch } from './game/catch';
import { ClientEntity } from './cliententity/client.entity';

import { subscribe } from 'diagnostics_channel';
import { SessionGuard } from './session.guard';
import { json } from 'stream/consumers';
import { log } from 'console';

@WebSocketGateway(8000, { transports: ['websocket'], pingInterval: 3000, pingTimeout: 10000 })
export class SessionGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly userservice: UserService,
    private readonly authservice: AuthService,
  ) { }
  @WebSocketServer()
  server: Server;

  // todo: 각 방에 접속된 인원들 string 타입이 아니라 array로 관리해야함(일단 해결)
  private connectedSockets: Map<string, Socket> = new Map();

  private hostuuidByRoomId: Map<number, string> = new Map();

  // private playerRoomIdBySoketId: Map<string, number> = new Map();

  //uuid 로 클라이언트 정보 접근 <uuid, clientEntity>
  private uuidToclientEntity: Map<string, ClientEntity> = new Map();
  //소켓으로 uuid 접근
  private socketTouuid: Map<Socket, string> = new Map();

  //<룸 아이디, 플레이어uuid[] >
  private roomidToPlayerSet: Map<number, Set<string>> = new Map();


  // 룸 아이디, 캐치마인드 세션
  private catchGameRoom: Map<number, Catch> = new Map();

  handleConnection(client: Socket,) {
    // console.log(client.handshake.query.aaa);
    Logger.log(`클라이언트 접속: ${client.id}`);
    const uuId = client.handshake.query.uuId;

    if (!this.uuidToclientEntity.has(uuId.toString())) {
      Logger.log("새로운 클라이언트 접속: " + uuId.toString());
      const clientEntity = new ClientEntity();

      clientEntity.nickname = "";
      clientEntity.roomId = -1;
      clientEntity.gameType = "";
      clientEntity.roles = "";
      clientEntity.clientSocket = client;

      this.uuidToclientEntity.set(uuId.toString(), clientEntity);
      this.socketTouuid.set(client, uuId.toString());

    } else {
      Logger.log("기존 클라이언트 접속: " + uuId.toString());
      const clientEntity = this.uuidToclientEntity.get(uuId.toString());
      if (clientEntity.clientSocket !== null) {
        if (clientEntity.roomId !== -1) {
          client.join(clientEntity.roomId.toString());
        }
        clientEntity.clientSocket = client;
        this.socketTouuid.set(client, uuId.toString());
      }

    }

    this.connectedSockets.set(uuId.toString(), client);
  }

  handleDisconnect(client: Socket) {
    const uuId = this.socketTouuid.get(client);
    const clientEntity = this.uuidToclientEntity.get(uuId);
    Logger.log(`클라이언트 접속 해제: ${client.id}`);
    if (uuId === undefined || clientEntity) {
      this.connectedSockets.delete(client.id);
      return
    }
    if (clientEntity.roomId === -1) {
      this.socketTouuid.delete(client);
      // this.uuidToclientEntity.delete(uuId);
      this.connectedSockets.delete(client.id);
      return;
    }

    if (clientEntity.roomId !== -1) {
      const room_id = clientEntity.roomId;
      const room = this.catchGameRoom.get(room_id);
      if (room.status === 2) {
        room.current_user_num--;
        const hostuuid = this.hostuuidByRoomId.get(room_id);
        const host = this.uuidToclientEntity.get(hostuuid).clientSocket;
        Logger.log("플레이어 접속 해제: " + uuId);
        host.emit('player_list_remove', { player_cnt: room.current_user_num, nickname: this.uuidToclientEntity.get(uuId).nickname });
      }
    } else {
      this.uuidToclientEntity.delete(uuId);
    }
    this.socketTouuid.delete(client);
    this.connectedSockets.delete(client.id);
  }

  @SubscribeMessage('leave_game')
  custumDisconnect(client: Socket) {
    const uuId = this.socketTouuid.get(client);

    Logger.log(`클라이언트 접속 해제: ${uuId}`);
    if (uuId === undefined) {
      this.uuidToclientEntity.delete(uuId);
      client.disconnect();
      return
    };
    const clientEntity = this.uuidToclientEntity.get(uuId);
    if (clientEntity.roomId === -1) {
      client.disconnect();
      return;
    }
    Logger.log(`클라이언트 접속 해제: ${client.id}`);
    if (clientEntity.roomId !== -1) {
      const room_id = clientEntity.roomId;
      const room = this.catchGameRoom.get(room_id);
      if (room) {
        room.current_user_num--;
        const hostuuid = this.hostuuidByRoomId.get(room_id);
        const host = this.uuidToclientEntity.get(hostuuid).clientSocket;
        Logger.log("플레이어 접속 해제: " + uuId);
        host.emit('player_list_remove', { player_cnt: room.current_user_num, nickname: this.uuidToclientEntity.get(uuId).nickname });
      }
    }
    this.uuidToclientEntity.delete(uuId);
    client.disconnect();
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

    Logger.log('make_room: authoriaztion success');
    Logger.log({
      host_name: hostInfo.nickname,
      room_id: hostInfo.id,
      game_type: game_type,
      user_num: user_num,
      answer: answer,
    });
    if (this.hostuuidByRoomId.has(hostInfo.id)) {
      client.emit('make_room', { result: false, message: '이미 방이 존재합니다.' });
      return;
    }
    //캐치마인드 세션 생성
    const catchGame = new Catch(hostInfo.id, hostInfo.nickname, payload.user_num, payload.answer);

    //캐치 마인드 세션에 등록
    this.catchGameRoom.set(hostInfo.id, catchGame);
    //게임 진행중인 호스트 정보 등록
    this.hostuuidByRoomId.set(hostInfo.id, uuId.toString());
    //플레이어 리스트 세트 생성
    this.roomidToPlayerSet.set(hostInfo.id, new Set<string>());
  }

  //todo => 게임 시작버튼을 누를 시 access_token 토큰 필요
  //게임 시작
  @UseGuards(SessionGuard)
  @SubscribeMessage('start_catch_game')
  startCatchGame(client: Socket, payload: { hostInfo: User }) {
    const room_id = payload.hostInfo.id.toString();
    const hostuuid = this.hostuuidByRoomId.get(Number(room_id));
    if (this.uuidToclientEntity.get(hostuuid).clientSocket !== client) {
      client.emit('start_catch_game', { result: false, message: '호스트가 아닙니다.' });
      return;
    }
    Logger.log('start_catch_game:' + room_id + ' ' + this.hostuuidByRoomId.get(Number(room_id)));
    Logger.log(typeof room_id);
    const room = this.catchGameRoom.get(Number(room_id));
    //게임 시작 상태로 변경
    room.status = 1;
    this.server.to(room_id.toString()).emit('start_catch_game', { result: true });
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
    const uuId = this.socketTouuid.get(client);
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
      // this.playerRoomIdBySoketId.set(client.id, Number(room_id));
      clientEntity.nickname = nickname;
      // this.playerNickNameBySocketId.set(client.id, nickname);
      this.roomidToPlayerSet.get(Number(room_id)).add(uuId.toString());
      client.join(room_id.toString());
    }
    console.log(client.rooms);

    Logger.log("게임 참가자: " + nickname + " 룸 번호: " + room_id + " 총 참가 인원: " +
      room.user_num + " 현재 참가 인원: " + room.current_user_num);
    const hostuuid = this.hostuuidByRoomId.get(Number(room_id));
    const host = this.uuidToclientEntity.get(hostuuid).clientSocket;
    host.emit('player_list_add', { player_cnt: room.current_user_num, nickname: nickname });
  }

  //정답 제출
  @SubscribeMessage('throw_catch_answer')
  async throwCatchAnswer(client: Socket, payload: { room_id: string; ans: string }) {
    const { ans } = payload;
    const uuId = this.socketTouuid.get(client);
    const clientEntity = this.uuidToclientEntity.get(uuId);
    if (clientEntity.roomId === 0 || ans === undefined || !this.catchGameRoom.has(clientEntity.roomId)) { return; };
    const room = this.catchGameRoom.get(clientEntity.roomId);
    Logger.log("게임 상태" + room.status);
    if (room.status !== 1) {
      return;
    }
    const hostuuid = this.hostuuidByRoomId.get(clientEntity.roomId);
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
    const { room_id } = payload;
    const room = this.catchGameRoom.get(Number(room_id));
    if (room) {
      room.status = 2;
      for (let uuid of this.roomidToPlayerSet.get(Number(room_id))) {
        Logger.log("게임 종료: " + uuid);
        this.socketTouuid.delete(this.uuidToclientEntity.get(uuid).clientSocket);
        this.uuidToclientEntity.delete(uuid);
      }
      this.server.to(room_id.toString()).emit('end', { result: true, answer: room.correctAnswer });
      this.server.to(room_id.toString()).disconnectSockets();
      this.hostuuidByRoomId.delete(Number(room_id));
    }
    this.catchGameRoom.delete(Number(room_id));
    const uuId = this.socketTouuid.get(client);
    this.socketTouuid.delete(client);
    this.uuidToclientEntity.delete(uuId);
    Logger.log("게임 종료: " + room_id + "호스트 uuid: " + uuId);
    client.disconnect();
  }

  //캐치 마인드 정답 설정 (호스트만 가능)
  @UseGuards(SessionGuard)
  @SubscribeMessage('set_catch_answer')
  async setCatchAnswer(client: Socket, payload: { room_id: string; ans: string }) {
    const hostuuid = this.hostuuidByRoomId.get(Number(payload.room_id));
    const host = this.uuidToclientEntity.get(hostuuid).clientSocket;
    if (host !== client) {
      return;
    }
    const { room_id, ans } = payload;
    const room = this.catchGameRoom.get(Number(room_id));
    room.correctAnswer = ans;
    Logger.log(room_id + "번방 정답 설정: " + ans);
  }
}

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

@WebSocketGateway(8000)
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

  private hostSocketsByRoomId: Map<number, Socket> = new Map();

  private playerRoomIdBySoketId: Map<string, number> = new Map();

  private playerNickNameBySocketId: Map<string, string> = new Map();

  private uuidToclient: Map<string, ClientEntity> = new Map();

  // 룸 아이디, 캐치마인드 세션
  private catchGameRoom: Map<number, Catch> = new Map();

  handleConnection(client: Socket) {
    // console.log(client.handshake.query.aaa);
    Logger.log(`클라이언트 접속: ${client.id}`);
    const uuId = client.handshake.query.uuId;
    
    this.connectedSockets.set(uuId.toString(), client);
  }

  handleDisconnect(client: Socket) {
    Logger.log(`클라이언트 접속 해제: ${client.id}`);
    if (this.playerRoomIdBySoketId.has(client.id)) {
      const room_id = this.playerRoomIdBySoketId.get(client.id);
      const room = this.catchGameRoom.get(room_id);
      if (room) {
        room.current_user_num--;
        const host = this.hostSocketsByRoomId.get(room_id);
        Logger.log("플레이어 접속 해제: " + this.playerNickNameBySocketId.get(client.id));
        host.emit('player_list_remove', { player_cnt: room.current_user_num, nickname: this.playerNickNameBySocketId.get(client.id) });
      }
    }
    this.playerNickNameBySocketId.delete(client.id);
    this.connectedSockets.delete(client.id);
  }

  @SubscribeMessage('leave_game')
  custumDisconnect(client: Socket, dethnote: string) {
    client.disconnect();
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoomEvent(client: Socket, payload: { room: string }) {
    client.join(payload.room);
    console.log(
      `클라이언트 ${client.id}이(가) 방 ${payload.room}에 참여했습니다.`,
    );
  }

  @SubscribeMessage('sendMessage')
  handleMessage(client: Socket, payload: { room: string; message: string }) {
    const { room, message } = payload;
    console.log(this.connectedSockets.size);
    console.log(
      `클라이언트 ${client.id}이(가) 방 ${room}에 메시지 ${message}를 보냈습니다.`,
    );
    // this.server.emit('message', { sender: client.id, message });
    this.server.to(room).emit('message', { sender: client.id, message });
  }

  // @SubscribeMessage('leaveRoom')
  // handleLeaveRoomEvent(client: Socket, payload: { room: string }) {
  //   client.leave(payload.room);
  //   console.log(
  //     `클라이언트 ${client.id}이(가) 방 ${payload.room}을 나갔습니다.`,
  //   );
  // }

  @SubscribeMessage('send_location')
  handleLocation(
    client: Socket,
    payload: { room: string; x: number; y: number },
  ) {
    const { room, x, y } = payload;
    console.log(
      `클라이언트 ${client.id}이(가) 방 ${room}에 위치 ${x},${y}를 보냈습니다.`,
    );
    // this.server.emit('message', { sender: client.id, message });
    this.server.to(room).emit('location', { sender: client.id, x, y });
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
    Logger.log('make_room: authoriaztion success');
    Logger.log({
      host_name: hostInfo.nickname,
      room_id: hostInfo.id,
      game_type: game_type,
      user_num: user_num,
      answer: answer,
    });
    if (this.hostSocketsByRoomId.has(hostInfo.id)) {
      client.emit('make_room', { result: false, message: '이미 방이 존재합니다.' });
      return;
    }
    //캐치마인드 세션 생성
    const catchGame = new Catch(hostInfo.id, hostInfo.nickname, payload.user_num, payload.answer);
    //세션 상태 대기중
    catchGame.status = 1;

    //캐치 마인드 세션에 등록
    this.catchGameRoom.set(hostInfo.id, catchGame);
    //게임 진행중인 호스트 정보 등록
    this.hostSocketsByRoomId.set(hostInfo.id, client);
  }

  //todo => 게임 시작버튼을 누를 시 access_token 토큰 필요
  //게임 시작
  @UseGuards(SessionGuard)
  @SubscribeMessage('start_catch_game')
  startCatchGame(client: Socket, payload: { hostInfo: User }) {
    const room_id = payload.hostInfo.id.toString();
    if (this.hostSocketsByRoomId.get(Number(room_id)) !== client) {
      client.emit('start_catch_game', { result: false, message: '호스트가 아닙니다.' });
      return;
    }
    Logger.log('start_catch_game:' + room_id + ' ' + this.hostSocketsByRoomId.get(Number(room_id)));
    Logger.log(typeof room_id);
    const room = this.catchGameRoom.get(Number(room_id));
    //게임 시작 상태로 변경
    room.status = 2;
    this.server.to(room_id.toString()).emit('start_catch_game', { result: true });
  }

  //유저 ready
  @SubscribeMessage('ready')
  async ready(client: Socket, payload: { room_id: string; nickname: string }) {
    const { room_id, nickname } = payload;
    if (room_id === undefined || nickname === undefined || !this.catchGameRoom.has(Number(room_id))) {
      Logger.warn(`room_id: ${client.id} ready: invalid room_id or nickname`);
      return;
    }

    const room = this.catchGameRoom.get(Number(room_id));
    if (this.playerRoomIdBySoketId.has(client.id)) {
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
      this.playerRoomIdBySoketId.set(client.id, Number(room_id));
      this.playerNickNameBySocketId.set(client.id, nickname);
      client.join(room_id.toString());
    }
    console.log(client.rooms);

    Logger.log("게임 참가자: " + nickname + " 룸 번호: " + room_id + " 총 참가 인원: " +
      room.user_num + " 현재 참가 인원: " + room.current_user_num);
    const host = this.hostSocketsByRoomId.get(Number(room_id));
    host.emit('player_list_add', { player_cnt: room.current_user_num, nickname: nickname });
  }

  //정답 제출
  @SubscribeMessage('throw_catch_answer')
  async throwCatchAnswer(client: Socket, payload: { room_id: string; ans: string }) {
    const { room_id, ans } = payload;
    if (room_id === undefined || ans === undefined || !this.catchGameRoom.has(Number(room_id))) { return; };
    const room = this.catchGameRoom.get(Number(room_id));
    Logger.log("게임 상태" + room.status);
    if (room.status !== 2) {
      return;
    }
    if (ans === room.correctAnswer) {
      Logger.log("정답: " + ans);
      room.status = 3;
      const host = this.hostSocketsByRoomId.get(Number(room_id));
      host.emit('correct', { result: true, answer: room.correctAnswer, nickname: this.playerNickNameBySocketId.get(client.id) })
      this.server.to(room_id.toString()).emit('correct', { result: true, answer: room.correctAnswer, nickname: this.playerNickNameBySocketId.get(client.id) });
    } else {
      Logger.log("틀림: " + ans);
      const host = this.hostSocketsByRoomId.get(Number(room_id));
      host.emit('incorrect', { result: true, incorrectAnswer: ans, nickname: this.playerNickNameBySocketId.get(client.id) });
    }
  }

  //캐치 마인드 게임 종료
  @SubscribeMessage('end_game')
  async end(client: Socket, payload: { room_id: string }) {
    const { room_id } = payload;
    const room = this.catchGameRoom.get(Number(room_id));
    if (room) {
      room.status = 2;
      this.catchGameRoom.delete(Number(room_id));
      this.server.to(room_id.toString()).emit('end', { result: false, answer: room.correctAnswer });
      this.server.to(room_id.toString()).disconnectSockets();
      this.hostSocketsByRoomId.delete(Number(room_id));
    }
    client.disconnect();
  }

  //캐치 마인드 정답 설정 (호스트만 가능)
  @UseGuards(SessionGuard)
  @SubscribeMessage('set_catch_answer')
  async setCatchAnswer(client: Socket, payload: { room_id: string; ans: string }) {
    if (this.hostSocketsByRoomId.get(Number(payload.room_id)) !== client) {
      return;
    }
    const { room_id, ans } = payload;
    const room = this.catchGameRoom.get(Number(room_id));
    room.correctAnswer = ans;
    Logger.log(room_id + "번방 정답 설정: " + ans);
  }
}

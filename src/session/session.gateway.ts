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
import { subscribe } from 'diagnostics_channel';
import { SessionGuard } from './session.guard';

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

  private connectedPlayerSocketsByRoomId: Map<number, string[]> = new Map();

  private connectedHostSocketsByRoomId: Map<number, string> = new Map();

  private PlayerNickNameBySocketId: Map<string, string> = new Map();

  private CatchGameRoom: Map<number, Catch> = new Map();

  handleConnection(client: Socket) {
    console.log(client.handshake.query.aaa);
    console.log(`클라이언트 접속: ${client.id}`);
    this.connectedSockets.set(client.id, client);
  }

  handleDisconnect(client: Socket) {
    console.log(`클라이언트 접속 해제: ${client.id}`);
    this.connectedSockets.delete(client.id);
  }

  @SubscribeMessage('custom_disconnect')
  custumDisconnect(client: Socket, dethnote: string) {
    const dead = this.connectedSockets.get(dethnote);
    dead.disconnect();
    // this.connectedSockets.delete(client.id);
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

  @SubscribeMessage('leaveRoom')
  handleLeaveRoomEvent(client: Socket, payload: { room: string }) {
    client.leave(payload.room);
    console.log(
      `클라이언트 ${client.id}이(가) 방 ${payload.room}을 나갔습니다.`,
    );
  }

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

  //호스트 접속
  @UseGuards(SessionGuard)
  @SubscribeMessage('make_room')
  async makeRoom(
    client: any,
    payload: { access_token: string; game_type: string; user_num: number, answer: string },
  ) {
    const { access_token, game_type, user_num, answer } = payload;
    console.log('make_room', access_token);

    //호스트 검증
    const tokenPayload = this.authservice.getAccessTokenPayload(payload.access_token);

    if (!tokenPayload) {
      client.emit('make_room', { result: false });
      return;
    }
    const hostInfo = await this.userservice.findUserByEmail(tokenPayload.email);

    Logger.log({
      host_name: hostInfo.nickname,
      room_id: hostInfo.id,
      game_type: game_type,
      user_num: user_num,
      answer: answer
    });
    if (this.connectedHostSocketsByRoomId.has(hostInfo.id)) {
      client.emit('make_room', { result: false });
      return;
    }
    //방 만들기

    const catchGame = new Catch(hostInfo.id, hostInfo.nickname, payload.user_num, payload.answer);
    this.connectedPlayerSocketsByRoomId.set(hostInfo.id, []);
    this.CatchGameRoom.set(hostInfo.id, catchGame);
    this.connectedHostSocketsByRoomId.set(hostInfo.id, client.id);
  }

  //게임 시작
  @SubscribeMessage('start_catch_game')
  startCatchGame(client: Socket, payload: { room_id: string }) {
    Logger.log('start_catch_game:'+payload.room_id+' '+this.connectedHostSocketsByRoomId.get(Number(payload.room_id)));
    const { room_id } = payload;
    this.server.to(room_id).emit('start_catch_game', { result: true });
  }

  //유저 ready
  @SubscribeMessage('ready')
  async ready(client: Socket, payload: { room_id: string; nickname: string }) {
    const { room_id, nickname } = payload;


    const room = this.CatchGameRoom.get(Number(room_id));
    Logger.log(room_id + " " + nickname + " " + room.user_num );

    if (room) {
      if (room.current_user_num === room.user_num) {
        client.emit('make_room', { result: false, message: '방이 꽉 찼습니다.' });
        return;
      }
      room.current_user_num++;
      this.PlayerNickNameBySocketId.set(client.id, nickname);
      this.connectedPlayerSocketsByRoomId.get(Number(room_id)).push(client.id);
      client.join(room_id);

    }
    Logger.log("게임 참가자: " + nickname + " 룸 번호: " + room_id+" 총 참가 인원: "+room.user_num)+" 현재 참가 인원: "+room.current_user_num;

    
  }

  //정답 제출
  @SubscribeMessage('throw_catch_answer')
  async throwCatchAnswer(client: Socket, payload: { room_id: string; ans: string }) {
    const { room_id, ans } = payload;
    const room = this.CatchGameRoom.get(Number(room_id));
    if(ans === room.correctAnswer){
      this.server.to(room_id).emit('end', { result: true, nickname: this.PlayerNickNameBySocketId.get(client.id) });
    }
  }
}

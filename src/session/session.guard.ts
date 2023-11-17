import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';
import { AuthService } from 'src/auth/auth.service';
import { UserService } from 'src/user/user.service';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly userservice: UserService,
    private readonly authservice: AuthService,
    private readonly jwtService: JwtService,

  ) { }
  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const payload = context.switchToWs().getData();
    const client = context.switchToWs().getClient();

    let accessToken = payload.access_token;
    let tokenPayload = null;
    accessToken = accessToken.replace('Bearer ', '');
    try {
      //엑서스 토큰 검증
      tokenPayload = this.jwtService.verify(accessToken, {
        secret: process.env.JWT_ACCESS_TOKEN_SECRET,
      });
      const hostInfo = await this.userservice.findUserByEmail(tokenPayload.email);
      payload.hostInfo = hostInfo;

    } catch (e) {
      Logger.error(e);
      client.emit('make_room', { result: false });
      return false;
    }
    return true;
  }
}
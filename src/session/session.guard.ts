import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from 'src/auth/auth.service';
import { normalizeToken } from 'src/auth/normalize-token';
import { UserService } from 'src/user/user.service';
import { SocketExtension } from './socket.extension';

@Injectable()
export class SessionGuard implements CanActivate {
    constructor(
        private readonly userservice: UserService,
        private readonly authservice: AuthService,
        private readonly jwtService: JwtService,
    ) {}
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const payload = context.switchToWs().getData();
        const client: SocketExtension = context.switchToWs().getClient();

        let accessToken = payload.access_token;
        let tokenPayload = null;
        try {
            //엑서스 토큰 검증
            accessToken = normalizeToken(accessToken);
            tokenPayload = this.jwtService.verify(accessToken, {
                secret: process.env.JWT_ACCESS_TOKEN_SECRET,
            });
            const hostInfo = await this.userservice.findUser(tokenPayload.email, tokenPayload.provider);
            payload.hostInfo = hostInfo;

            client.hostInfo = hostInfo;
            // client.qrKey =
            //     client.handshake.query.qrKey.toString() ??
            //     '💀 TODO: 여기에 qrKey를 넣어야함';
            client.uuId = client.handshake.query.uuId.toString();
        } catch (e) {
            Logger.error(`💀 session guard 오류: ${e}`);
            client.emit('make_room', { result: false });
            return false;
        }
        return true;
    }
}

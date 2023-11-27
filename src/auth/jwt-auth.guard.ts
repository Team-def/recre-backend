import { Injectable, ExecutionContext, UnauthorizedException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { normalizeToken } from './normalize-token';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    constructor(private jwtService: JwtService) {
        super();
    }

    canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest();

        const { authorization } = request.headers;
        if (authorization === undefined) {
            throw new HttpException('Token 전송 안됨', HttpStatus.UNAUTHORIZED);
        }

        const token = normalizeToken(authorization);

        Logger.debug(`token = ${token}`, 'JwtAuthGuard');

        request.payload = this.validateToken(token);

        return true;
    }

    validateToken(token: string) {
        const secretKey = process.env.JWT_ACCESS_TOKEN_SECRET;
        let payload;
        try {
            payload = this.jwtService.verify(token, {
                secret: secretKey,
            });
            Logger.debug(`verify 성공! ${JSON.stringify(payload)}`, 'JwtAuthGuard');
            return payload;
        } catch (e) {
            Logger.error(`verify 실패! ${JSON.stringify(e)}`, 'JwtAuthGuard');
            switch (e.name) {
                // 토큰에 대한 오류를 판단합니다.
                case 'JsonWebTokenError': {
                    throw new HttpException('유효하지 않은 토큰입니다.', 401);
                }

                case 'TokenExpiredError': {
                    throw new HttpException('토큰이 만료되었습니다.', 410);
                }

                default: {
                    Logger.error(`서버 오류입니다. (${e})`, `JwtAuthGuard`);
                    throw new HttpException('서버 오류입니다.', 500);
                }
            }
        }
    }
}

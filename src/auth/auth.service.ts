import {
  BadRequestException,
  Injectable,
  HttpException,
  Logger,
} from '@nestjs/common';
import { HttpErrorByCode } from '@nestjs/common/utils/http-error-by-code.util';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async googleLogin(req) {
    const user = await this.userService.findUserByEmail(req.user.email);
    if (user === null) {
      this.googleResister(req);
      console.log('user is not member');
    } else {
      console.log('user is member');
    }
  }

  googleResister(req) {
    const newUser: CreateUserDto = new CreateUserDto();
    newUser.email = req.user.email;
    newUser.nickname = req.user.displayName;
    newUser.profileImage = req.user.picture;
    newUser.provider = 'google';
    this.userService.createUser(newUser);
  }

  async kakaoLogin(req): Promise<any> {
    if (!req.user) {
      throw new BadRequestException('No user from kakao');
    }
    const { nickname, email, profile_image } = req.user;

    // Find user in db
    const user = await this.userService.findUserByEmail(email);

    // If no user found, create one
    if (!user) {
      const newUser: CreateUserDto = new CreateUserDto();
      newUser.email = email;
      newUser.nickname = nickname;
      newUser.profileImage = profile_image;
      newUser.provider = 'kakao';
      this.userService.createUser(newUser);
    }

    return {
      message: 'User information from kakao',
      user,
    };
  }

  async naverLogin(req): Promise<any> {
    if (!req.user) {
      throw new BadRequestException('No user from naver');
    }
    const { nickname, email, profile_image } = req.user;

    // Find user in db
    const user = await this.userService.findUserByEmail(email);

    // If no user found, create one
    if (!user) {
      const newUser: CreateUserDto = new CreateUserDto();
      newUser.email = email;
      newUser.nickname = nickname;
      newUser.profileImage = profile_image;
      newUser.provider = 'naver';
      this.userService.createUser(newUser);
    }

    return {
      message: 'User information from naver',
      user,
    };
  }

  async getJwtTokens(
    email: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const userInfo = await this.userService.findUserByEmail(email);
    const access_token = 'Bearer ' + this.getJwtAccessToken(userInfo);
    const refresh_token = 'Bearer ' + this.getJwtRefreshToken(userInfo);
    return { access_token, refresh_token };
  }

  getJwtAccessToken(userInfo: any) {
    const payload = { email: userInfo.email };
    const token = this.jwtService.sign(payload, {
      secret: process.env.JWT_ACCESS_TOKEN_SECRET,
      expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRATION_TIME,
    });
    return token;
  }

  getJwtRefreshToken(userInfo: any) {
    const payload = { email: userInfo.email };
    const token = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_TOKEN_SECRET,
      expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRATION_TIME,
    });
    return token;
  }

  getAccessTokenPayload(accessToken: string) {
    let payload = null;
    accessToken = accessToken.replace('Bearer ', '');
    try {
      payload = this.jwtService.verify(accessToken, {
        secret: process.env.JWT_ACCESS_TOKEN_SECRET,
      });
    } catch (e) {
      Logger.error(e);
      switch (e.message) {
        // 토큰에 대한 오류를 판단합니다.
        case 'INVALID_TOKEN':
        case 'TOKEN_IS_ARRAY':
        case 'NO_USER':
        // throw new HttpException('유효하지 않은 토큰입니다.', 401);

        case 'EXPIRED_TOKEN':
        // throw new HttpException('토큰이 만료되었습니다.', 410);

        default:
          // throw new HttpException('서버 오류입니다.', 500);
          return false;
      }
    }
    return payload;
  }

  async getJwtAccessTokenFromRefreshToken(refreshToken: string) {
    let verify: object | Buffer;
    refreshToken = refreshToken.replace('Bearer ', '');
    try {
      verify = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_TOKEN_SECRET,
      });
    } catch (e) {
      switch (e.message) {
        // 토큰에 대한 오류를 판단합니다.
        case 'INVALID_TOKEN':
        case 'TOKEN_IS_ARRAY':
        case 'NO_USER':
          throw new HttpException('유효하지 않은 토큰입니다.', 401);

        case 'EXPIRED_TOKEN':
          throw new HttpException('토큰이 만료되었습니다.', 410);

        default:
          throw new HttpException('서버 오류입니다.', 500);
      }
    }
    const userInfo = await this.userService.findUserByEmail(verify['email']);
    const payload = { ...userInfo };

    const token =
      'Bearer ' +
      this.jwtService.sign(payload, {
        secret: process.env.JWT_ACCESS_TOKEN_SECRET,
        expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRATION_TIME,
      });
    return token;
  }

  // async verifyJwtAccessToken(accessToken: string) {
  //     try {
  //         const payload = this.jwtService.verify(accessToken,process.env.JWT_ACCESS_TOKEN_SECRET );
  //         return payload;
  //     } catch (err) {
  //         throw new UnauthorizedException('Invalid token');
  //     }
  // }
}

import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { HttpErrorByCode } from '@nestjs/common/utils/http-error-by-code.util';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AuthService {
    constructor(private readonly userService: UserService, private readonly jwtService: JwtService) { }

    async googleLogin(req) {
        const user = await this.userService.findUserByEmail(req.user.email);
        console.log(user);
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
        console.log('req.user', req.user);
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
        console.log('req:', req);
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

    async setJwtCookie(req:any, res:any)
    {
        const userInfo:CreateUserDto = new CreateUserDto();
        userInfo.email = req.user.email;
        userInfo.nickname = req.user.nickname;
        userInfo.profileImage = req.user.profileImage;
        userInfo.provider = req.user.provider;
        
        const access_token = await this.getJwtAccessToken(userInfo);
        const refresh_token = await this.getJwtRefreshToken(userInfo);
        res.cookie('access_token', access_token, {
            domain: 'localhost',
            path: '/',
            httpOnly: true,
        });
        res.cookie('refresh_token', refresh_token, {
            domain: 'localhost',
            path: '/',
            httpOnly: true,
        });
        return true;
    }


    async getJwtAccessToken(userInfo: CreateUserDto) {
        const payload = { ...userInfo };
        const token = this.jwtService.sign(payload, {
            secret: process.env.JWT_ACCESS_TOKEN_SECRET,
            expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRATION_TIME
        });
        return token;
    }

    async getJwtRefreshToken(userInfo: CreateUserDto) {
        const payload = { ...userInfo };
        const token = this.jwtService.sign(payload, {
            secret: process.env.JWT_REFRESH_TOKEN_SECRET,
            expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRATION_TIME
        });
        return token;
    }



    async getJwtAccessTokenFromRefreshToken(refreshToken: string) {
        const payload = this.jwtService.verify(refreshToken, {
            secret: process.env.JWT_REFRESH_TOKEN_SECRET
        });
        const token = this.jwtService.sign(payload, {
            secret: process.env.JWT_ACCESS_TOKEN_SECRET,
            expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRATION_TIME
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



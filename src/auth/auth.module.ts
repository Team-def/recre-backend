import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleStrategy } from './google-strategy';
import { UserService } from 'src/user/user.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { KakaoStrategy } from './kakao-strategy';
import { NaverStrategy } from './naver-strategy';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
    imports: [TypeOrmModule.forFeature([User]), JwtModule.register({})],
    controllers: [AuthController],
    providers: [GoogleStrategy, AuthService, JwtAuthGuard, UserService, KakaoStrategy, NaverStrategy],
    exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}

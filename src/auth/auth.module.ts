import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleStrategy } from './google-strategy';
import { GoogleAuthGuard } from './google-auth.guard';
import { UserService } from 'src/user/user.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { KakaoStrategy } from './kakao-strategy';
import { NaverStrategy } from './naver-strategy';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [AuthController],
  providers: [
    GoogleStrategy,
    AuthService,
    GoogleAuthGuard,
    UserService,
    KakaoStrategy,
    NaverStrategy,
  ],
})
export class AuthModule {}

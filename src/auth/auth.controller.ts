import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './google-auth.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

@Controller('auth/')
export class AuthController {
  getHello(): any {
    throw new Error('Method not implemented.');
  }
  constructor(private readonly authservice: AuthService) {}

  // @UseGuards(GoogleAuthGuard)
  //구글 로그인 요청
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req) {}

  // @UseGuards(GoogleAuthGuard)
  //구글 로그인 완료
  @Get('google/redirect')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() response: any) {
    console.log('request 정보 in /auth/google/redirect:', req);
    await this.authservice.googleLogin(req);
    // console.log(req.user);
    response.redirect(HttpStatus.PERMANENT_REDIRECT, '/');
    // return "hello";
  }

  /**
   * 카카오 로그인 요청
   */
  @Get('kakao')
  @UseGuards(AuthGuard('kakao'))
  async kakaoAuth(@Req() req) {}

  /**
   * 카카오 로그인 완료
   * @param req
   * @param response
   */
  @Get('kakao/redirect')
  @UseGuards(AuthGuard('kakao'))
  async kakaoAuthRedirect(@Req() req, @Res() response: any) {
    console.log('request 정보 in /auth/kakao/redirect:', req);
    await this.authservice.kakaoLogin(req);
    response.redirect(HttpStatus.PERMANENT_REDIRECT, '/');
  }
}

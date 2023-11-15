import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import {
  Controller,
  Get,
  HttpStatus,
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
    await this.authservice.googleLogin(req);
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
    await this.authservice.kakaoLogin(req);
    response.redirect(HttpStatus.PERMANENT_REDIRECT, '/');
  }

  /**
   * 네이버 로그인 요청
   */
  @Get('naver')
  @UseGuards(AuthGuard('naver'))
  async naverAuth(@Req() req) {}

  /**
   * 네이버 로그인 완료
   * @param req
   * @param response
   */
  @Get('naver/redirect')
  @UseGuards(AuthGuard('naver'))
  async naverAuthRedirect(@Req() req, @Res() response: any) {
    await this.authservice.naverLogin(req);
    response.redirect(HttpStatus.PERMANENT_REDIRECT, '/');
  }
}

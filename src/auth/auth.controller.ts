import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import {
  Controller,
  Get,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Response } from 'express';

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
  async googleAuthRedirect(
    @Req() req,
    @Res({ passthrough: true }) response: any,
  ) {
    await this.authservice.googleLogin(req);
    await this.authservice.setJwtCookie(req, response);
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

  @Get('token')
  @UseGuards(JwtAuthGuard)
  async tokenTest(@Req() req, @Res() response: any) {
    response.redirect(HttpStatus.PERMANENT_REDIRECT, '/');
  }

  @Post('accesstoken')
  async refreshAccessToken(@Req() req, @Res() response: Response) {
    const access_token =
      await this.authservice.getJwtAccessTokenFromRefreshToken(
        req.body.refresh_token,
      );
    response.json({ access_token });
  }
}

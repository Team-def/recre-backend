import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './google-auth.guard';
import { Body, Controller, Delete, Get, HttpStatus, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';

@Controller('google')
export class AuthController {
  getHello(): any {
    throw new Error('Method not implemented.');
  }
  constructor(private readonly authservice: AuthService) {}

  // @UseGuards(GoogleAuthGuard)
  //구글 로그인 요청
  @Get()
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req) {    
  }

  // @UseGuards(GoogleAuthGuard)
  //구글 로그인 완료
  @Get('redirect')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() response:any) {
    await this.authservice.googleLogin(req);
    // console.log(req.user);
    response.redirect(HttpStatus.PERMANENT_REDIRECT, '/');
    // return "hello";
  }
}
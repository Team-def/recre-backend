import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { Controller, Get, HttpStatus, Post, Req, Res, UseGuards, HttpException, Logger } from '@nestjs/common';
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
    async googleAuthRedirect(@Req() req, @Res({ passthrough: true }) response: Response) {
        req.user.provider = 'google';
        await this.authservice.googleLogin(req);
        const { access_token, refresh_token } = await this.authservice.getJwtTokens(req.user.email, req.user.provider);

        Logger.debug(`access_token: ${access_token}`, 'AuthController');

        this.responseWithCookieAndRedirect(response, access_token, refresh_token);
    }

    /**
     * 카카오 로그인 요청
     */
    @Get('kakao')
    @UseGuards(AuthGuard('kakao'))
    async kakaoAuth(@Req() req) {
        Logger.log('kakaoAuth');
    }

    /**
     * 카카오 로그인 완료
     * @param req
     * @param response
     */
    @Get('kakao/redirect')
    @UseGuards(AuthGuard('kakao'))
    async kakaoAuthRedirect(@Req() req, @Res() response: Response) {
        req.user.provider = 'kakao';
        Logger.debug(`kakaoAuthRedirect: ${JSON.stringify(req.user)}`, 'AuthController');

        await this.authservice.kakaoLogin(req);
        const { access_token, refresh_token } = await this.authservice.getJwtTokens(req.user.email, req.user.provider);
        this.responseWithCookieAndRedirect(response, access_token, refresh_token);
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
    async naverAuthRedirect(@Req() req, @Res() response: Response) {
        req.user.provider = 'naver';
        await this.authservice.naverLogin(req);
        const { access_token, refresh_token } = await this.authservice.getJwtTokens(req.user.email, req.user.provider);
        this.responseWithCookieAndRedirect(response, access_token, refresh_token);
    }

    @Get('token')
    @UseGuards(JwtAuthGuard)
    async tokenTest(@Req() req, @Res() response: any) {
        response.redirect(HttpStatus.PERMANENT_REDIRECT, '/');
    }

    @Post('accesstoken')
    async refreshAccessToken(@Req() req, @Res() response: Response) {
        const access_token = await this.authservice.getJwtAccessTokenFromRefreshToken(req.body.refresh_token);
        response.json({ access_token });
    }

    private responseWithCookieAndRedirect(response: Response, access_token: string, refresh_token: string) {
        response
            .cookie('access_token', access_token, {
                expires: new Date(Date.now() + 1000 * 60),
                domain: process.env.DOMAIN,
                sameSite: 'lax',
                // secure: true, /// TODO: https 적용시 주석 해제
            })
            .cookie('refresh_token', refresh_token, {
                domain: process.env.DOMAIN,
                sameSite: 'lax',
                // secure: true, /// TODO: https 적용시 주석 해제
            })
            .redirect(HttpStatus.PERMANENT_REDIRECT, process.env.CLIENT_URL + '/token');
    }
}

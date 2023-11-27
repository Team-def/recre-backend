import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-naver';
import { UserService } from 'src/user/user.service';

export class NaverStrategy extends PassportStrategy(Strategy, 'naver') {
    constructor(private userService: UserService) {
        super({
            clientID: process.env.NAVER_CLIENT_ID,
            clientSecret: process.env.NAVER_CLIENT_SECRET,
            callbackURL: process.env.NAVER_CALLBACK_URL,
        });
    }

    async validate(accessToken: string, refreshToken: string, profile: any, done: any) {
        const { email, nickname, profile_image } = profile._json;
        const user = {
            email,
            nickname,
            profile_image,
        };
        done(null, user);
    }
}

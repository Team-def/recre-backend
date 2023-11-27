import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-kakao';

export class KakaoStrategy extends PassportStrategy(Strategy, 'kakao') {
    constructor() {
        super({
            clientID: process.env.KAKAO_CLIENT_ID,
            clientSecret: process.env.KAKAO_CLIENT_SECRET,
            callbackURL: process.env.KAKAO_CALLBACK_URL,
        });
    }
    async validate(accessToken: string, refreshToken: string, profile: any, done: any) {
        const { id, provider } = profile;
        const { email } = profile._json.kakao_account;
        const { profile_image: profileImage, thumbnail_image: thumbnailImage, nickname } = profile._json.properties;
        const user = {
            id,
            nickname,
            provider,
            email,
            profile_image: profileImage,
            thumbnail_image: thumbnailImage,
            accessToken,
            refreshToken,
        };
        done(null, user);
    }
}

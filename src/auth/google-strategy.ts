import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor() {
        super({
            clientID: process.env.GOOGLE_CLIENT_ID, // CLIENT_ID
            clientSecret: process.env.GOOGLE_CLIENT_SECRET, // CLIENT_SECRET
            callbackURL: process.env.GOOGLE_CALLBACK_URL, // redirect_uri
            passReqToCallback: true,
            scope: ['email', 'profile'], // 가져올 정보들
        });
    }
    authorizationParams(): { [key: string]: string } {
        return {
            access_type: 'offline',
            prompt: 'select_account',
        };
    }

    async validate(
        req: Request,
        accessToken: string,
        refreshToken: string,
        profile: any,
        done: VerifyCallback,
    ): Promise<any> {
        const { name, emails, photos } = profile;
        const user = {
            email: emails[0].value,
            firstName: name.familyName,
            lastName: name.givenName,
            picture: photos[0].value,
            displayName: profile.displayName,
            // accessToken,
            // refreshToken
        };
        done(null, user);
    }
}

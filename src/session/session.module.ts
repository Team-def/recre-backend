import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { SessionGuard } from './session.guard';

import { SessionInfoModule } from '../session-info/session-info.module';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { RedGreenGateway } from './redgreen.gateway';
import { CatchGateway } from './catch.gateway';

@Module({
    imports: [JwtModule.register({}), TypeOrmModule.forFeature([User]), SessionInfoModule, UserModule, AuthModule],
    providers: [CatchGateway, RedGreenGateway, SessionGuard],
    exports: [SessionGuard],
})
export class SessionModule {}

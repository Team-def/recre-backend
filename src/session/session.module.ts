import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { SessionGuard } from './session.guard';
import { RedGreenGateway } from './redgreen.gateway';
import { CatchGateway } from './catch.gateway';
import { RedGreenService } from './redgreen.service';
import { SessionInfoModule } from '../session-info/session-info.module';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';

@Module({
    imports: [JwtModule.register({}), TypeOrmModule.forFeature([User]), SessionInfoModule, UserModule, AuthModule],
    providers: [CatchGateway, RedGreenGateway, RedGreenService, SessionGuard],
    exports: [SessionGuard],
})
export class SessionModule {}

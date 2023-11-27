import { Module } from '@nestjs/common';
import { AuthService } from 'src/auth/auth.service';
import { JwtModule } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { SessionGuard } from './session.guard';
import { RedGreenGateway } from './game/redgreen.gateway';
import { CatchGateway } from './game/catch.gateway';
import { RedGreenService } from './game/redgreen.service';

@Module({
    imports: [JwtModule.register({}), TypeOrmModule.forFeature([User])],
    providers: [CatchGateway, RedGreenGateway, AuthService, UserService, RedGreenService, SessionGuard],
})
export class SessionModule {}

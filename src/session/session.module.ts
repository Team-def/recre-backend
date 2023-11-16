import { Module } from '@nestjs/common';
import { SessionGateway } from './session.gateway';
import { AuthService } from 'src/auth/auth.service';
import { JwtModule } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { SessionGuard } from './session.guard';

@Module({
  imports: [JwtModule.register({}), TypeOrmModule.forFeature([User])],
  providers: [SessionGateway, AuthService, UserService, SessionGuard],
})
export class SessionModule {}

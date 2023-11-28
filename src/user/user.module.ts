import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { JwtModule } from '@nestjs/jwt';

@Module({
    imports: [TypeOrmModule.forFeature([User]), JwtModule.register({})],
    controllers: [UserController],
    providers: [UserService, JwtAuthGuard],
    exports: [UserService, JwtAuthGuard],
})
export class UserModule {}

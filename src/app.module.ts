import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { User } from './user/entities/user.entity';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { SessionModule } from './session/session.module';
import { SessionInfoModule } from './session-info/session-info.module';
import { Player } from './session-info/entities/player.entity';
import { Room } from './session-info/entities/room.entity';
import { CatchGame } from './session-info/entities/catch.game.entity';
import { Host } from './session-info/entities/host.entity';
import { RedGreenGame } from './session-info/entities/redgreen.game.entity';
import { RedGreenPlayer } from './session-info/entities/redgreen.player.entity';
import { CatchPlayer } from './session-info/entities/catch.player.entitiy';

@Module({
    imports: [
        ConfigModule.forRoot(),
        TypeOrmModule.forRoot({
            type: 'postgres',
            host: process.env.DB_HOST,
            port: +process.env.DB_PORT,
            password: process.env.DB_USER_PASSWORD,
            username: process.env.DB_USER_NAME,
            entities: [User],
            database: process.env.DB_DATABASE,
            synchronize: true,
            logging: true,
        }),
        // TypeOrmModule.forRoot({
        //     name: 'sqlite',
        //     type: 'mysql',
        //     host: 'localhost', // MySQL 호스트 주소
        //     port: 3307,         // MySQL 포트 번호
        //     username: 'root', // MySQL 사용자명
        //     password: '1234', // MySQL 비밀번호
        //     database: 'recre_session', // MySQL 데이터베이스 이름
        //     entities: [Player, CatchGame, RedGreenGame ,Room, Host, RedGreenPlayer ,CatchPlayer,], // 엔터티 파일 경로
        //     synchronize: true, // 개발 중에만 사용하고, 프로덕션에서는 사용하지 않는 것이 좋습니다.
        //     logging: true,
        // }),
        TypeOrmModule.forRoot({
            // ----------------- 추가 start
            name: 'sqlite', // - DB 이름
            type: 'sqlite', // - DB 종류
            database: ':memory:', // - DB 파일 이름
            // database: './recre.db', // - DB 파일 이름
            autoLoadEntities: true, // - 구동시 entity파일 자동 로드
            synchronize: true, // - 서비스 구동시 entity와 디비의 테이블 싱크 개발만 할것
            logging: false, // - orm 사용시 로그 남기기
            dropSchema: true, // - 구동시 해당 테이블 삭제 synchronize와 동시 사용
            entities: [Player, CatchGame, RedGreenGame, Room, Host, RedGreenPlayer, CatchPlayer], // - entity 파일 위치
        }),
        UserModule,
        AuthModule,
        SessionModule,
        SessionInfoModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}

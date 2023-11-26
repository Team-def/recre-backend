import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { User } from './user/entities/user.entity';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { SessionModule } from './session/session.module';
import { ClientModule } from './client/client.module';
import { Client } from './client/entities/client.entity';

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
        TypeOrmModule.forRoot({ // ----------------- 추가 start 
            name: 'sqlite', // - DB 이름
            type: 'sqlite', // - DB 종류 
            database:':memory:', // - DB 파일 이름 
            autoLoadEntities: true, // - 구동시 entity파일 자동 로드 
            synchronize: true, // - 서비스 구동시 entity와 디비의 테이블 싱크 개발만 할것 
            logging: true, // - orm 사용시 로그 남기기 
            dropSchema: true, // - 구동시 해당 테이블 삭제 synchronize와 동시 사용 
            entities: [Client], // - entity 파일 위치
        }),
        UserModule,
        AuthModule,
        SessionModule,
        ClientModule,
    ],
    controllers: [AppController,],
    providers: [AppService],
})
export class AppModule {}

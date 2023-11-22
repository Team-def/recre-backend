import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.enableCors();
    app.use(cookieParser());
    if (!process.env.LISTEN_PORT) {
        throw new Error('LISTEN_PORT is not defined');
    }
    await app.listen(process.env.LISTEN_PORT);
}
bootstrap();

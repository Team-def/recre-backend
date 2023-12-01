import { Module } from '@nestjs/common';
import { SessionInfoService } from './session-info.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Player } from './entities/player.entity';
import { CatchGame } from './entities/catch.game.entity';
import { Room } from './entities/room.entity';
import { Host } from './entities/host.entity';
import { RedGreenPlayer } from './entities/redgreen.player.entity';
import { CatchPlayer } from './entities/catch.player.entitiy';
import { RedGreenGame } from './entities/redgreen.game.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Player, CatchGame, RedGreenGame, Room, Host, RedGreenPlayer, CatchPlayer], 'sqlite'),
    ],
    providers: [SessionInfoService],
    exports: [SessionInfoService],
})
export class SessionInfoModule {}

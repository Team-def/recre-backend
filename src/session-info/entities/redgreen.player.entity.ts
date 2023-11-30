import { ChildEntity, Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Player } from './player.entity';
import { RedGreenGame } from './redgreen.game.entity';
import { Room } from './room.entity';

@ChildEntity()
export class RedGreenPlayer extends Player {
    @Column({ type: 'integer', nullable: false, default: 0 })
    distance: number;

    //enum {ALIVE, DEAD, FINISH}
    @Column({ type: 'varchar', length: 10, nullable: false, default: 'ALIVE' })
    state: string;

    /**
     * 플레이어의 게임플레이가 종료된 시간 (사망, 완주 시간)
     */
    @Column({ type: 'datetime', nullable: true, default: 0 })
    endtime: Date;
}

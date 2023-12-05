import { ChildEntity, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Room } from './room.entity';

@ChildEntity()
export class RedGreenGame extends Room {
    @Column({ type: 'integer', nullable: false, default: 0 })
    length: number;

    @Column({ type: 'integer', nullable: false, default: 0 })
    win_num: number;

    /**
     * 영희가 고개를 돌렸는지 여부
     */
    @Column({ type: 'boolean', nullable: false, default: false })
    killer_mode: boolean;

    @Column({ type: 'integer', nullable: false, default: 0 })
    current_win_num: number;

    @Column({ type: 'integer', nullable: false, default: 0 })
    current_alive_num: number;

    @Column({ type: 'datetime', nullable: true, default: 0 })
    start_time: Date;
}

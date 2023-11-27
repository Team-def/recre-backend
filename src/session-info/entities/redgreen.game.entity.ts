import { ChildEntity, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Room } from './room.entity';

@ChildEntity()
export class RedGreenGame extends Room {
    @Column({ type: 'integer', nullable: false, default: 0 })
    length: number;

    @Column({ type: 'integer', nullable: false, default: 0 })
    win_num: number;
}

import { ChildEntity, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Player } from './player.entity';

@ChildEntity()
export class RedGreenPlayer extends Player{
    @Column({ type: 'integer',nullable: false, default: 0})
    distance: number;

    //enum {ALIVE, DEAD, FINISH}
    @Column({ type: 'varchar', length: 10 , nullable: false, default: 'ALIVE'})
    state: string
}
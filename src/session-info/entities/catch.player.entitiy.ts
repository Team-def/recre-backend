import { ChildEntity, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Player } from './player.entity';

@ChildEntity()
export class CatchPlayer extends Player {
    // @Column({ type: 'varchar', length: 30 , nullable: true})
    // ans: string;
}

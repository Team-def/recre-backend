import { ChildEntity, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Room } from './room.entity';

@ChildEntity()
export class CatchGame extends Room {
    @Column({ type: 'varchar', length: 30, nullable: true })
    ans: string;
}

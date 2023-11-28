import { on } from 'events';
import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    OneToOne,
    PrimaryColumn,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Room } from './room.entity';

@Entity('host')
export class Host {

    @Column({ type: 'varchar', length: 30, unique: true, nullable: false })
    @PrimaryColumn()
    uuid: string;

    @Column({ type: 'integer' })
    host_id: number;

    // 방과 일대 일 관계
    @OneToOne(() => Room, (room) => room.host, {
        nullable: true,
        cascade: true,
    })
    room: Promise<Room>;
}

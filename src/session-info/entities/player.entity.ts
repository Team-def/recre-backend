import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryColumn,
    PrimaryGeneratedColumn,
    TableInheritance,
} from 'typeorm';
import { Room } from './room.entity';

@TableInheritance({ column: { type: 'varchar', name: 'player_type' } })
@Entity('player')
export abstract class Player {
    @Column({ type: 'varchar', length: 30 })
    @PrimaryColumn()
    uuid: string;

    @Column({ type: 'varchar', length: 30, nullable: false })
    name: string;

    // @Column({ type: 'varchar', length: 30, nullable: true })
    // @Index({ unique: true })
    // socket_id: string;

    // 방과 다대 일 관계
    @ManyToOne(() => Room, (room) => room.players, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    room: Promise<Room>;
}

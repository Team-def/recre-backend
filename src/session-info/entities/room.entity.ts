import {
    Column,
    Entity,
    Index,
    JoinColumn,
    JoinTable,
    OneToMany,
    OneToOne,
    PrimaryColumn,
    PrimaryGeneratedColumn,
    TableInheritance,
    Unique,
} from 'typeorm';
import { Player } from './player.entity';
import { Host } from './host.entity';
import { promises } from 'dns';

@TableInheritance({ column: { type: 'varchar', name: 'game_type' } })
@Entity('room')
export abstract class Room {
    @PrimaryColumn()
    room_id: number;

    @OneToOne(() => Host, (host) => host.room, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn()
    host: Promise<Host>;

    /**
     * enum string(wait, playing, end)
     */
    @Column({ type: 'varchar', length: 30 })
    status: string;

    @Column({ type: 'integer' })
    user_num: number;

    @Column({ type: 'integer' })
    current_user_num: number;

    // 플레이어와 일대 다 관계
    @OneToMany(() => Player, (player) => player.room, { cascade: true })
    players: Promise<Player[]>;
}

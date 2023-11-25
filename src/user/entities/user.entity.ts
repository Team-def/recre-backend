import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class User {
    /**
     * this decorator will help to auto generate id for the table.
     */
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 30 })
    nickname: string;

    @Column({ type: 'varchar', length: 40 })
    email: string;

    @Column({ type: 'varchar', length: 255 })
    profileImage: string;

    @Column({
        type: 'enum',
        enum: ['naver', 'google', 'kakao'],
        nullable: false,
    })
    provider: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdDt: Date;

    // @Column({ type: 'varchar', length: 15 })
    // username: string;

    // @Column({ type: 'int' })
    // age: number;

    /**
     * m - male
     * f - female
     * u - unspecified
     */
    // @Column({ type: 'enum', enum: ['m', 'f', 'u'], nullable: true })
    // gender: string | null;
}
